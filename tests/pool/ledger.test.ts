import { expect, test } from "bun:test";
import {
  emptyLedger, appendRows, serializeLedgerRow, parseLedgerJsonl, creditRow, balances,
  usageRowsFromEvents,
} from "../../src/pool/ledger";
import type { NewLedgerRow, LedgerRow } from "../../src/pool/types";
import { RATE_CARD_2026_08_08 as CARD } from "../../src/rates";
import type { UsageEvent } from "../../src/types";

function usageEvent(over: Partial<UsageEvent> = {}): UsageEvent {
  return {
    idempotencyKey: "evt-1", accountId: "acct-1", projectId: "workspace-a",
    ts: "2026-08-30T00:00:00Z", sessionId: null, source: "admin_usage_report",
    serviceTier: null, model: "claude-haiku-4-5",
    inputTokens: 1_000_000, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0,
    cacheCreation5mTokens: 0, cacheCreation1hTokens: 0,
    compactionInputTokens: 0, compactionOutputTokens: 0,
    ...over,
  };
}

test("emptyLedger starts with no rows, empty seen set, seq 1", () => {
  const state = emptyLedger();
  expect(state.rows).toEqual([]);
  expect(state.seen.size).toBe(0);
  expect(state.nextSeq).toBe(1);
});

function creditCandidate(over: Partial<NewLedgerRow> = {}): NewLedgerRow {
  return {
    kind: "credit",
    memberId: "member-a",
    deltaMicroCents: 20_000_000, // $20.00 in micro-cents
    idempotencyKey: "topup-1",
    ts: "2026-08-30T00:00:00Z",
    detail: { note: "initial top-up" },
    appendedAt: "2026-08-30T00:00:01Z",
    ...over,
  };
}

test("appendRows assigns seq starting from state.nextSeq and returns a new state", () => {
  const state0 = emptyLedger();
  const { state: state1, appended, deduped, rejected } = appendRows(state0, [creditCandidate()]);

  expect(state0.rows).toEqual([]); // original state untouched (pure)
  expect(appended).toHaveLength(1);
  expect(appended[0].seq).toBe(1);
  expect(deduped).toBe(0);
  expect(rejected).toEqual([]);
  expect(state1.rows).toHaveLength(1);
  expect(state1.nextSeq).toBe(2);
  expect(state1.seen.has("topup-1")).toBe(true);
});

test("appendRows dedups a key already seen in an earlier call", () => {
  const { state: state1 } = appendRows(emptyLedger(), [creditCandidate({ idempotencyKey: "topup-1" })]);
  const { state: state2, appended, deduped } = appendRows(state1, [
    creditCandidate({ idempotencyKey: "topup-1", deltaMicroCents: 999 }),
  ]);

  expect(appended).toEqual([]);
  expect(deduped).toBe(1);
  expect(state2.rows).toHaveLength(1); // the retried candidate never lands
  expect(state2.nextSeq).toBe(2); // no seq consumed by a deduped row
});

test("appendRows dedups a key duplicated within the same batch, first wins", () => {
  const { state, appended, deduped } = appendRows(emptyLedger(), [
    creditCandidate({ idempotencyKey: "topup-1", deltaMicroCents: 1_000 }),
    creditCandidate({ idempotencyKey: "topup-1", deltaMicroCents: 2_000 }), // dup, later in batch
  ]);

  expect(appended).toHaveLength(1);
  expect(appended[0].deltaMicroCents).toBe(1_000); // first one wins
  expect(deduped).toBe(1);
  expect(state.rows).toHaveLength(1);
  expect(state.nextSeq).toBe(2);
});

test("appendRows rejects a usage row with a positive delta (usage must be <= 0)", () => {
  const { appended, rejected, state } = appendRows(emptyLedger(), [
    creditCandidate({ kind: "usage", idempotencyKey: "u1", deltaMicroCents: 5 }),
  ]);
  expect(appended).toEqual([]);
  expect(state.rows).toEqual([]);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason).toMatch(/sign/i);
});

test("appendRows accepts a usage row with a zero or negative delta", () => {
  const { appended, rejected } = appendRows(emptyLedger(), [
    creditCandidate({ kind: "usage", idempotencyKey: "u1", deltaMicroCents: -5 }),
    creditCandidate({ kind: "usage", idempotencyKey: "u2", deltaMicroCents: 0 }),
  ]);
  expect(rejected).toEqual([]);
  expect(appended).toHaveLength(2);
});

test("appendRows rejects a credit row with a negative delta (credit must be >= 0)", () => {
  const { appended, rejected } = appendRows(emptyLedger(), [
    creditCandidate({ deltaMicroCents: -1 }),
  ]);
  expect(appended).toEqual([]);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason).toMatch(/sign/i);
});

test("appendRows rejects a reconciliation row whose delta is not exactly zero", () => {
  const { appended, rejected } = appendRows(emptyLedger(), [
    creditCandidate({ kind: "reconciliation", memberId: null, deltaMicroCents: 1 }),
  ]);
  expect(appended).toEqual([]);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason).toMatch(/sign/i);
});

test("appendRows accepts a reconciliation row with delta exactly zero and memberId null", () => {
  const { appended, rejected } = appendRows(emptyLedger(), [
    creditCandidate({ kind: "reconciliation", memberId: null, deltaMicroCents: 0 }),
  ]);
  expect(rejected).toEqual([]);
  expect(appended).toHaveLength(1);
});

test("appendRows accepts an adjustment row with any sign", () => {
  const { appended, rejected } = appendRows(emptyLedger(), [
    creditCandidate({ kind: "adjustment", idempotencyKey: "adj-1", deltaMicroCents: -100 }),
    creditCandidate({ kind: "adjustment", idempotencyKey: "adj-2", deltaMicroCents: 100 }),
  ]);
  expect(rejected).toEqual([]);
  expect(appended).toHaveLength(2);
});

test("appendRows rejects a non-safe-integer delta", () => {
  const { appended, rejected } = appendRows(emptyLedger(), [
    creditCandidate({ deltaMicroCents: 1.5 }),
    creditCandidate({ idempotencyKey: "topup-2", deltaMicroCents: Number.MAX_SAFE_INTEGER + 1 }),
  ]);
  expect(appended).toEqual([]);
  expect(rejected).toHaveLength(2);
  for (const r of rejected) expect(r.reason).toMatch(/integer/i);
});

test("appendRows rejects an empty idempotencyKey", () => {
  const { appended, rejected } = appendRows(emptyLedger(), [
    creditCandidate({ idempotencyKey: "" }),
  ]);
  expect(appended).toEqual([]);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason).toMatch(/idempotencyKey/i);
});

test("appendRows rejects memberId null on a non-reconciliation row", () => {
  const { appended, rejected } = appendRows(emptyLedger(), [
    creditCandidate({ memberId: null }),
  ]);
  expect(appended).toEqual([]);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason).toMatch(/memberId/i);
});

test("a rejected candidate consumes no seq and does not enter seen", () => {
  const { state } = appendRows(emptyLedger(), [
    creditCandidate({ deltaMicroCents: -1 }), // rejected: bad sign
  ]);
  expect(state.nextSeq).toBe(1);
  expect(state.seen.has("topup-1")).toBe(false);
});

// ── serialize / parse ──────────────────────────────────────────────────────────

test("serializeLedgerRow round-trips through parseLedgerJsonl", () => {
  const { appended } = appendRows(emptyLedger(), [creditCandidate()]);
  const line = serializeLedgerRow(appended[0]);
  expect(line.includes("\n")).toBe(false); // one line

  const { state, malformed } = parseLedgerJsonl([line]);
  expect(malformed).toBe(0);
  expect(state.rows).toEqual(appended);
});

test("serializeLedgerRow puts seq first in the JSON key order", () => {
  const { appended } = appendRows(emptyLedger(), [creditCandidate()]);
  const line = serializeLedgerRow(appended[0]);
  expect(line.startsWith('{"seq":')).toBe(true);
});

test("parseLedgerJsonl ignores blank lines without counting them malformed", () => {
  const { appended } = appendRows(emptyLedger(), [creditCandidate()]);
  const line = serializeLedgerRow(appended[0]);
  const { state, malformed } = parseLedgerJsonl(["", line, "   ", ""]);
  expect(malformed).toBe(0);
  expect(state.rows).toHaveLength(1);
});

test("parseLedgerJsonl skips a line that is not valid JSON (torn tail write)", () => {
  const { appended } = appendRows(emptyLedger(), [creditCandidate()]);
  const goodLine = serializeLedgerRow(appended[0]);
  const tornLine = '{"seq":2,"kind":"credit"'; // truncated mid-write
  const { state, malformed } = parseLedgerJsonl([goodLine, tornLine]);
  expect(malformed).toBe(1);
  expect(state.rows).toHaveLength(1);
  expect(state.nextSeq).toBe(2); // rebuilt from the one accepted row, not poisoned
});

test("parseLedgerJsonl skips a line missing required fields", () => {
  const { state, malformed } = parseLedgerJsonl(['{"seq":1,"kind":"credit"}']); // no deltaMicroCents etc.
  expect(malformed).toBe(1);
  expect(state.rows).toEqual([]);
});

test("parseLedgerJsonl skips a line whose seq does not strictly increase (regression)", () => {
  const { state: s1 } = appendRows(emptyLedger(), [
    creditCandidate({ idempotencyKey: "k1" }),
    creditCandidate({ idempotencyKey: "k2" }),
  ]);
  const lines = s1.rows.map(serializeLedgerRow);
  // Corrupt: swap so seq 2 comes before seq 1 -> the second line is a regression, skipped.
  const reordered = [lines[1], lines[0]];
  const { state, malformed } = parseLedgerJsonl(reordered);
  expect(malformed).toBe(1);
  expect(state.rows).toHaveLength(1);
  expect(state.rows[0].seq).toBe(2);
  expect(state.nextSeq).toBe(3);
});

test("parseLedgerJsonl rebuilds seen and nextSeq for a multi-row ledger", () => {
  const { state: s1 } = appendRows(emptyLedger(), [
    creditCandidate({ idempotencyKey: "k1" }),
    creditCandidate({ idempotencyKey: "k2" }),
  ]);
  const lines = s1.rows.map(serializeLedgerRow);
  const { state, malformed } = parseLedgerJsonl(lines);
  expect(malformed).toBe(0);
  expect(state.nextSeq).toBe(3);
  expect(state.seen.has("k1")).toBe(true);
  expect(state.seen.has("k2")).toBe(true);
});

// ── creditRow ────────────────────────────────────────────────────────────────

test("creditRow builds a well-formed positive credit candidate", () => {
  const row = creditRow("member-a", 20_000_000, "topup-7", "2026-08-30T00:00:00Z", "manual top-up", "2026-08-30T00:00:01Z");
  expect(row).toEqual({
    kind: "credit",
    memberId: "member-a",
    deltaMicroCents: 20_000_000,
    idempotencyKey: "topup-7",
    ts: "2026-08-30T00:00:00Z",
    detail: { note: "manual top-up" },
    appendedAt: "2026-08-30T00:00:01Z",
  });
});

test("creditRow throws on a non-positive amount (a bad credit is a programmer error)", () => {
  expect(() => creditRow("member-a", 0, "k", "t", "t", "n")).toThrow();
  expect(() => creditRow("member-a", -5, "k", "t", "t", "n")).toThrow();
});

test("creditRow throws on a non-integer amount", () => {
  expect(() => creditRow("member-a", 1.5, "k", "t", "t", "n")).toThrow();
});

// ── balances ────────────────────────────────────────────────────────────────

test("balances sums credit, usage, and adjustment rows per member", () => {
  // member-a: credited 20_000_000, consumed 6_000_000 (delta -6_000_000), adjustment -1_000_000
  // balance = 20_000_000 - 6_000_000 - 1_000_000 = 13_000_000
  const { state } = appendRows(emptyLedger(), [
    creditCandidate({ memberId: "member-a", idempotencyKey: "c1", deltaMicroCents: 20_000_000 }),
    creditCandidate({ kind: "usage", memberId: "member-a", idempotencyKey: "u1", deltaMicroCents: -6_000_000 }),
    creditCandidate({ kind: "adjustment", memberId: "member-a", idempotencyKey: "a1", deltaMicroCents: -1_000_000 }),
    creditCandidate({ memberId: "member-b", idempotencyKey: "c2", deltaMicroCents: 5_000_000 }),
  ]);

  const b = balances(state);
  expect(b.get("member-a")).toEqual({
    creditedMicroCents: 20_000_000,
    consumedMicroCents: 6_000_000,
    balanceMicroCents: 13_000_000,
  });
  expect(b.get("member-b")).toEqual({
    creditedMicroCents: 5_000_000,
    consumedMicroCents: 0,
    balanceMicroCents: 5_000_000,
  });
});

test("balances excludes reconciliation rows' null memberId from the map", () => {
  const { state } = appendRows(emptyLedger(), [
    creditCandidate({ kind: "reconciliation", memberId: null, idempotencyKey: "r1", deltaMicroCents: 0 }),
  ]);
  expect(balances(state).size).toBe(0);
});

// ── usageRowsFromEvents ────────────────────────────────────────────────────────

test("usageRowsFromEvents prices an event and produces a negative-delta usage row", () => {
  // haiku input: 1_000_000 tokens * 100 micro-cents = 100_000_000 micro-cents
  const workspaceToMember = new Map([["workspace-a", "member-a"]]);
  const { rows, unpriced, unattributed } = usageRowsFromEvents(
    [usageEvent()], CARD, workspaceToMember, "2026-08-30T01:00:00Z",
  );

  expect(unpriced).toEqual([]);
  expect(unattributed).toEqual([]);
  expect(rows).toEqual([{
    kind: "usage",
    memberId: "member-a",
    deltaMicroCents: -100_000_000,
    idempotencyKey: "evt-1",
    ts: "2026-08-30T00:00:00Z",
    detail: { model: "claude-haiku-4-5", serviceTier: null, workspaceId: "workspace-a", accountId: "acct-1" },
    appendedAt: "2026-08-30T01:00:00Z",
  }]);
});

test("usageRowsFromEvents surfaces an unpriced event (unknown model), never drops it silently", () => {
  const workspaceToMember = new Map([["workspace-a", "member-a"]]);
  const event = usageEvent({ model: "gpt-9" });
  const { rows, unpriced } = usageRowsFromEvents([event], CARD, workspaceToMember, "t");

  expect(rows).toEqual([]);
  expect(unpriced).toEqual([{ event, reason: "unknown_model" }]);
});

test("usageRowsFromEvents surfaces an unattributed event (unmapped workspace), never drops it", () => {
  const event = usageEvent({ projectId: "workspace-unknown" });
  const { rows, unattributed } = usageRowsFromEvents([event], CARD, new Map(), "t");

  expect(rows).toEqual([]);
  expect(unattributed).toEqual([event]);
});

test("usageRowsFromEvents surfaces both an unpriced and an unattributed event in the same batch", () => {
  const priceable = usageEvent({ idempotencyKey: "ok", projectId: "workspace-a" });
  const badModel = usageEvent({ idempotencyKey: "bad-model", model: "gpt-9" });
  const noWorkspace = usageEvent({ idempotencyKey: "no-workspace", projectId: "workspace-z" });
  const workspaceToMember = new Map([["workspace-a", "member-a"]]);

  const { rows, unpriced, unattributed } = usageRowsFromEvents(
    [priceable, badModel, noWorkspace], CARD, workspaceToMember, "t",
  );

  expect(rows).toHaveLength(1);
  expect(rows[0].idempotencyKey).toBe("ok");
  expect(unpriced).toEqual([{ event: badModel, reason: "unknown_model" }]);
  expect(unattributed).toEqual([noWorkspace]);
});
