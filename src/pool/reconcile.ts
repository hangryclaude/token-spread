/**
 * Nightly reconciliation (spec §6): our ledger vs Anthropic's cost report. The
 * instrument that produced a number never grades it — the ledger prices with our
 * rate card, the cost report prices with theirs. Divergence is signal, not noise.
 */

import type { LedgerState, NewLedgerRow, ReconcileVerdict } from "./types";

/** Spec §6: 1¢ floor plus 0.1% (parts-per-million) of the larger side of the comparison. */
export function toleranceMicroCents(
  ours: number,
  theirs: number,
  cfg: { toleranceFloorMicroCents: number; tolerancePpm: number },
): number {
  const larger = Math.max(Math.abs(ours), Math.abs(theirs));
  return cfg.toleranceFloorMicroCents + Math.floor((larger * cfg.tolerancePpm) / 1_000_000);
}

/**
 * Our side of the comparison: usage-row spend, per (UTC day, workspace), positive.
 * Rows whose memberId has no workspace mapping cannot be attributed to a workspace,
 * so they are excluded from the sums and counted separately — silently dropping
 * them would understate our total and manufacture a fake reconciliation gap.
 */
export function ledgerDailyByWorkspace(
  state: LedgerState,
  memberToWorkspace: ReadonlyMap<string, string>,
): { sums: Map<string, number>; unmapped: number } {
  const sums = new Map<string, number>();
  let unmapped = 0;

  for (const r of state.rows) {
    if (r.kind !== "usage") continue;
    const workspaceId = r.memberId === null ? undefined : memberToWorkspace.get(r.memberId);
    if (workspaceId === undefined) { unmapped++; continue; }
    const day = r.ts.slice(0, 10);
    const key = `${day}|${workspaceId}`;
    sums.set(key, (sums.get(key) ?? 0) - r.deltaMicroCents);
  }

  return { sums, unmapped };
}

/**
 * Compared over the union of keys — a (day, workspace) present on only one side is
 * exactly the failure mode this exists to catch (a poller gap, a workspace the
 * ledger never heard of), so it compares against zero on the missing side rather
 * than being dropped from the report.
 */
export function reconcile(
  ours: Map<string, number>,
  theirs: readonly { day: string; workspaceId: string; amountMicroCents: number }[],
  cfg: { toleranceFloorMicroCents: number; tolerancePpm: number },
): ReconcileVerdict[] {
  const theirsByKey = new Map<string, number>();
  for (const t of theirs) {
    const key = `${t.day}|${t.workspaceId}`;
    theirsByKey.set(key, (theirsByKey.get(key) ?? 0) + t.amountMicroCents);
  }

  const keys = new Set<string>([...ours.keys(), ...theirsByKey.keys()]);

  const verdicts: ReconcileVerdict[] = [...keys].map((key) => {
    const [day, workspaceId] = key.split("|");
    const oursMicroCents = ours.get(key) ?? 0;
    const theirsMicroCents = theirsByKey.get(key) ?? 0;
    const deltaMicroCents = theirsMicroCents - oursMicroCents;
    const tolerance = toleranceMicroCents(oursMicroCents, theirsMicroCents, cfg);
    return {
      day, workspaceId, oursMicroCents, theirsMicroCents, deltaMicroCents,
      toleranceMicroCents: tolerance,
      withinTolerance: Math.abs(deltaMicroCents) <= tolerance,
    };
  });

  return verdicts.sort((a, b) => (a.day === b.day
    ? a.workspaceId.localeCompare(b.workspaceId)
    : a.day.localeCompare(b.day)));
}

/**
 * A verdict is a record, never money (deltaMicroCents 0, memberId null — spec §4/§6).
 * The idempotency key folds in both sides' totals, so an unchanged re-run dedups to
 * nothing while a changed verdict (late-arriving data) posts a fresh row rather than
 * being silently swallowed by the dedup set.
 */
export function reconciliationRows(
  verdicts: readonly ReconcileVerdict[],
  appendedAt: string,
): NewLedgerRow[] {
  return verdicts.map((v) => ({
    kind: "reconciliation",
    memberId: null,
    deltaMicroCents: 0,
    ts: appendedAt,
    appendedAt,
    detail: { ...v },
    idempotencyKey: `reconcile:${v.day}:${v.workspaceId}:${v.oursMicroCents}:${v.theirsMicroCents}`,
  }));
}

/**
 * Decimal-cent string -> integer micro-cents, string math only (no parseFloat,
 * which would round a value like "0.0001" through binary float error before it
 * ever reached a balance). Anything not exactly `\d+(\.\d{1,4})?` is refused —
 * signs, exponents, extra fraction digits, stray characters all come back null.
 */
function parseDecimalCentsToMicroCents(amount: string): number | null {
  if (!/^\d+(\.\d{1,4})?$/.test(amount)) return null;
  const [intPart, fracPart = ""] = amount.split(".");
  const fracPadded = fracPart.padEnd(4, "0");
  return Number(intPart) * 10_000 + Number(fracPadded);
}

export function parseCostReport(
  pages: readonly any[],
): { rows: { day: string; workspaceId: string; amountMicroCents: number }[]; malformed: number } {
  const sums = new Map<string, number>();
  let malformed = 0;

  for (const page of pages) {
    for (const bucket of page?.data ?? []) {
      const day: string = bucket.starting_at.slice(0, 10);
      for (const result of bucket.results ?? []) {
        if (result.currency !== "USD") { malformed++; continue; }
        const micro = parseDecimalCentsToMicroCents(String(result.amount));
        if (micro === null) { malformed++; continue; }
        const workspaceId: string = result.workspace_id ?? "default";
        const key = `${day}|${workspaceId}`;
        sums.set(key, (sums.get(key) ?? 0) + micro);
      }
    }
  }

  const rows = [...sums.entries()].map(([key, amountMicroCents]) => {
    const [day, workspaceId] = key.split("|");
    return { day, workspaceId, amountMicroCents };
  });
  return { rows, malformed };
}
