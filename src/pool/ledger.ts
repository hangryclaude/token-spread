/**
 * Slice 2 — the append-only pool ledger (spec §4). Every row is immutable once written;
 * corrections are compensating rows, never edits. Pure core: this module never reads a
 * clock or touches disk — callers inject `appendedAt`/`ts` and do their own I/O around
 * `serializeLedgerRow`/`parseLedgerJsonl`.
 */
import type { LedgerRow, LedgerRowKind, LedgerState, NewLedgerRow } from "./types";
import { costOfEvent } from "../pricing";
import type { RateCard } from "../rates";
import type { UsageEvent } from "../types";

export function emptyLedger(): LedgerState {
  return { rows: [], seen: new Set(), nextSeq: 1 };
}

/**
 * Data-shape and sign validation for one candidate row (spec §4). Never throws — a bad
 * row from an untrusted source (a re-poll, a malformed importer output) is data to
 * reject and report, not a program bug to crash on. Returns the reason string, or null
 * if the row is well-formed.
 */
function rejectReason(row: NewLedgerRow): string | null {
  if (!Number.isSafeInteger(row.deltaMicroCents)) {
    return "deltaMicroCents is not a safe integer";
  }
  if (row.idempotencyKey === "") {
    return "idempotencyKey must not be empty";
  }
  if (row.memberId === null && row.kind !== "reconciliation") {
    return "memberId is null on a non-reconciliation row";
  }

  const d = row.deltaMicroCents;
  const signOk: Record<LedgerRowKind, boolean> = {
    usage: d <= 0,
    credit: d >= 0,
    reconciliation: d === 0,
    adjustment: true,
  };
  if (!signOk[row.kind]) {
    return `sign violation: ${row.kind} rows require ${
      row.kind === "usage" ? "<= 0" : row.kind === "credit" ? ">= 0" : "== 0"
    }, got ${d}`;
  }

  return null;
}

export function appendRows(
  state: LedgerState,
  candidates: readonly NewLedgerRow[],
): {
  state: LedgerState;
  appended: LedgerRow[];
  deduped: number;
  rejected: { row: NewLedgerRow; reason: string }[];
} {
  const rows = state.rows.slice();
  const seen = new Set(state.seen);
  let nextSeq = state.nextSeq;
  const appended: LedgerRow[] = [];
  const rejected: { row: NewLedgerRow; reason: string }[] = [];
  let deduped = 0;

  for (const candidate of candidates) {
    const reason = rejectReason(candidate);
    if (reason !== null) {
      rejected.push({ row: candidate, reason });
      continue;
    }

    if (seen.has(candidate.idempotencyKey)) {
      deduped++;
      continue;
    }

    const row: LedgerRow = { ...candidate, seq: nextSeq };
    nextSeq++;
    rows.push(row);
    appended.push(row);
    seen.add(candidate.idempotencyKey);
  }

  return { state: { rows, seen, nextSeq }, appended, deduped, rejected };
}

/** Fields every LedgerRow must carry — used by parseLedgerJsonl to reject a partial line. */
const REQUIRED_FIELDS = [
  "seq", "kind", "memberId", "deltaMicroCents", "idempotencyKey", "ts", "detail", "appendedAt",
] as const;

/**
 * One line, stable key order (seq first) so a human diffing the JSONL file sees the
 * append order at a glance and so two serializations of the same row are byte-identical
 * (spec §4: the file is the audit trail).
 */
export function serializeLedgerRow(row: LedgerRow): string {
  return JSON.stringify({
    seq: row.seq,
    kind: row.kind,
    memberId: row.memberId,
    deltaMicroCents: row.deltaMicroCents,
    idempotencyKey: row.idempotencyKey,
    ts: row.ts,
    detail: row.detail,
    appendedAt: row.appendedAt,
  });
}

/**
 * Rebuilds a LedgerState from JSONL. A torn tail write (process killed mid-`appendFile`)
 * or a seq that regresses (file corruption, a bad hand-edit) must not poison the whole
 * ledger — such lines are counted malformed and skipped, and replay continues from the
 * last good row (spec §4).
 */
export function parseLedgerJsonl(lines: Iterable<string>): { state: LedgerState; malformed: number } {
  const rows: LedgerRow[] = [];
  const seen = new Set<string>();
  let lastSeq = 0;
  let malformed = 0;

  for (const line of lines) {
    if (line.trim() === "") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      malformed++;
      continue;
    }

    if (
      typeof parsed !== "object" || parsed === null ||
      !REQUIRED_FIELDS.every((f) => f in (parsed as Record<string, unknown>))
    ) {
      malformed++;
      continue;
    }

    const row = parsed as LedgerRow;
    if (typeof row.seq !== "number" || row.seq <= lastSeq) {
      malformed++;
      continue;
    }

    rows.push(row);
    seen.add(row.idempotencyKey);
    lastSeq = row.seq;
  }

  return { state: { rows, seen, nextSeq: lastSeq + 1 }, malformed };
}

/**
 * Builds a credit candidate. Throws on a non-positive amount: a top-up of $0 or less is
 * always a caller bug (a real top-up is positive by definition), never data to reject
 * and carry on with the way appendRows does for untrusted external input.
 */
export function creditRow(
  memberId: string,
  microCents: number,
  idempotencyKey: string,
  ts: string,
  note: string,
  appendedAt: string,
): NewLedgerRow {
  if (!Number.isInteger(microCents) || microCents <= 0) {
    throw new Error(`creditRow: microCents must be a positive integer, got ${microCents}`);
  }
  return {
    kind: "credit",
    memberId,
    deltaMicroCents: microCents,
    idempotencyKey,
    ts,
    detail: { note },
    appendedAt,
  };
}

/** credited/consumed/balance per member (spec §4). Reconciliation rows carry no memberId. */
export function balances(
  state: LedgerState,
): Map<string, { creditedMicroCents: number; consumedMicroCents: number; balanceMicroCents: number }> {
  const out = new Map<string, { creditedMicroCents: number; consumedMicroCents: number; balanceMicroCents: number }>();

  const get = (memberId: string) => {
    let entry = out.get(memberId);
    if (!entry) {
      entry = { creditedMicroCents: 0, consumedMicroCents: 0, balanceMicroCents: 0 };
      out.set(memberId, entry);
    }
    return entry;
  };

  for (const row of state.rows) {
    if (row.memberId === null) continue;
    const entry = get(row.memberId);
    if (row.kind === "credit") entry.creditedMicroCents += row.deltaMicroCents;
    if (row.kind === "usage") entry.consumedMicroCents += -row.deltaMicroCents;
    entry.balanceMicroCents += row.deltaMicroCents;
  }

  return out;
}

/**
 * Prices raw usage into ledger candidates and attributes each to a member by workspace
 * (spec §8: never silently drop). An event with no rate-card entry (unpriced) or no
 * workspace mapping (unattributed) is surfaced in its own bucket rather than dropped,
 * so the caller can see and act on the gap instead of quietly under-billing.
 */
export function usageRowsFromEvents(
  events: readonly UsageEvent[],
  card: RateCard,
  workspaceToMember: ReadonlyMap<string, string>,
  appendedAt: string,
): { rows: NewLedgerRow[]; unpriced: { event: UsageEvent; reason: string }[]; unattributed: UsageEvent[] } {
  const rows: NewLedgerRow[] = [];
  const unpriced: { event: UsageEvent; reason: string }[] = [];
  const unattributed: UsageEvent[] = [];

  for (const event of events) {
    const memberId = workspaceToMember.get(event.projectId);
    if (memberId === undefined) {
      unattributed.push(event);
      continue;
    }

    const priced = costOfEvent(event, card);
    if (!priced.ok) {
      unpriced.push({ event, reason: priced.reason });
      continue;
    }

    rows.push({
      kind: "usage",
      memberId,
      deltaMicroCents: -priced.microCents,
      idempotencyKey: event.idempotencyKey,
      ts: event.ts,
      detail: {
        model: event.model,
        serviceTier: event.serviceTier,
        workspaceId: event.projectId,
        accountId: event.accountId,
      },
      appendedAt,
    });
  }

  return { rows, unpriced, unattributed };
}
