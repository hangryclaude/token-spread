import { expect, test } from "bun:test";
import {
  parseCostReport, ledgerDailyByWorkspace, toleranceMicroCents, reconcile, reconciliationRows,
} from "../../src/pool/reconcile";
import type { ReconcileVerdict } from "../../src/pool/types";
import type { LedgerRow, LedgerState } from "../../src/pool/types";

function row(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    seq: 1, kind: "usage", memberId: "m1", deltaMicroCents: -100,
    idempotencyKey: "k1", ts: "2026-08-01T00:00:00Z", detail: {}, appendedAt: "2026-08-01T00:05:00Z",
    ...over,
  };
}

function state(rows: LedgerRow[]): LedgerState {
  return { rows, seen: new Set(rows.map((r) => r.idempotencyKey)), nextSeq: rows.length + 1 };
}

test("parses a single USD result into integer micro-cents", () => {
  // "123.45" cents -> intPart 123 * 1_000_000 + fracPart "450000" (padded to 6 digits)
  // = 123_000_000 + 450_000 = 123_450_000
  const pages = [
    { data: [{ starting_at: "2026-08-01T00:00:00Z", results: [
      { amount: "123.45", currency: "USD", workspace_id: "ws1" },
    ] }] },
  ];
  const { rows, malformed } = parseCostReport(pages);
  expect(rows).toEqual([{ day: "2026-08-01", workspaceId: "ws1", amountMicroCents: 123_450_000 }]);
  expect(malformed).toBe(0);
});

test("amount is scaled by the rates.ts convention (1 cent = 1_000_000 micro-cents), not 1e-4 of it", () => {
  // Anthropic's cost report amount is a decimal string of whole cents. "50000.0000" is a
  // real $500.00 workspace cost -> 50_000 cents * 1_000_000 micro-cents/cent = 50_000_000_000.
  const pages = [
    { data: [{ starting_at: "2026-08-01T00:00:00Z", results: [
      { amount: "50000.0000", currency: "USD", workspace_id: "ws1" },
    ] }] },
  ];
  const { rows, malformed } = parseCostReport(pages);
  expect(rows).toEqual([{ day: "2026-08-01", workspaceId: "ws1", amountMicroCents: 50_000_000_000 }]);
  expect(malformed).toBe(0);
});

test("a five-decimal-digit amount (the API doc's own example) is not rejected as malformed", () => {
  // "123.78912" cents -> intPart 123 * 1_000_000 + frac "789120" (padded to 6 digits,
  // i.e. millionths of a cent = micro-cents directly) = 123_000_000 + 789_120 = 123_789_120.
  const pages = [
    { data: [{ starting_at: "2026-08-01T00:00:00Z", results: [
      { amount: "123.78912", currency: "USD", workspace_id: "ws1" },
    ] }] },
  ];
  const { rows, malformed } = parseCostReport(pages);
  expect(rows).toEqual([{ day: "2026-08-01", workspaceId: "ws1", amountMicroCents: 123_789_120 }]);
  expect(malformed).toBe(0);
});

test("a null workspace_id maps to the default workspace", () => {
  const pages = [
    { data: [{ starting_at: "2026-08-01T00:00:00Z", results: [
      { amount: "1.00", currency: "USD", workspace_id: null },
    ] }] },
  ];
  const { rows } = parseCostReport(pages);
  expect(rows).toEqual([{ day: "2026-08-01", workspaceId: "default", amountMicroCents: 1_000_000 }]);
});

test("a four-decimal-digit amount converts to the exact micro-cent", () => {
  // "0.0001" -> intPart 0 * 1_000_000 + fracPart "000100" (padded to 6 digits) = 100
  const pages = [
    { data: [{ starting_at: "2026-08-01T00:00:00Z", results: [
      { amount: "0.0001", currency: "USD", workspace_id: "ws1" },
    ] }] },
  ];
  const { rows, malformed } = parseCostReport(pages);
  expect(rows).toEqual([{ day: "2026-08-01", workspaceId: "ws1", amountMicroCents: 100 }]);
  expect(malformed).toBe(0);
});

test("exponents, extra fraction digits, signs, and non-USD currency are all malformed", () => {
  const bad = ["1e2", "12.34567890", "-5"];
  const pages = [
    { data: [{ starting_at: "2026-08-01T00:00:00Z", results: [
      ...bad.map((amount) => ({ amount, currency: "USD", workspace_id: "ws1" })),
      { amount: "5.00", currency: "EUR", workspace_id: "ws1" },
    ] }] },
  ];
  const { rows, malformed } = parseCostReport(pages);
  expect(rows).toEqual([]);
  expect(malformed).toBe(4);
});

test("ledgerDailyByWorkspace sums usage-row spend, positive, keyed by day and workspace", () => {
  const s = state([row({ memberId: "m1", deltaMicroCents: -100 })]);
  const { sums, unmapped } = ledgerDailyByWorkspace(s, new Map([["m1", "ws1"]]));
  expect(sums).toEqual(new Map([["2026-08-01|ws1", 100]]));
  expect(unmapped).toBe(0);
});

test("rows with no workspace mapping are excluded from sums but counted as unmapped", () => {
  const s = state([
    row({ memberId: "m1", deltaMicroCents: -100, idempotencyKey: "k1" }),
    row({ memberId: "ghost", deltaMicroCents: -50, idempotencyKey: "k2" }),
  ]);
  const { sums, unmapped } = ledgerDailyByWorkspace(s, new Map([["m1", "ws1"]]));
  expect(sums).toEqual(new Map([["2026-08-01|ws1", 100]]));
  expect(unmapped).toBe(1);
});

test("non-usage rows (credit, adjustment, reconciliation) are excluded from spend sums", () => {
  const s = state([
    row({ memberId: "m1", deltaMicroCents: -100, idempotencyKey: "k1" }),
    row({ kind: "credit", memberId: "m1", deltaMicroCents: 2000, idempotencyKey: "k2" }),
  ]);
  const { sums } = ledgerDailyByWorkspace(s, new Map([["m1", "ws1"]]));
  expect(sums).toEqual(new Map([["2026-08-01|ws1", 100]]));
});

test("multiple usage rows for the same member and day sum before conversion to spend", () => {
  const s = state([
    row({ memberId: "m1", deltaMicroCents: -100, idempotencyKey: "k1" }),
    row({ memberId: "m1", deltaMicroCents: -250, idempotencyKey: "k2" }),
  ]);
  const { sums } = ledgerDailyByWorkspace(s, new Map([["m1", "ws1"]]));
  expect(sums).toEqual(new Map([["2026-08-01|ws1", 350]]));
});

test("toleranceMicroCents is the floor plus ppm of the larger side", () => {
  // floor 1_000_000 + floor(max(10_000_000, 8_000_000) * 1000 / 1_000_000) = 1_000_000 + 10_000
  const t = toleranceMicroCents(10_000_000, 8_000_000, { toleranceFloorMicroCents: 1_000_000, tolerancePpm: 1000 });
  expect(t).toBe(1_010_000);
});

const ZERO_TOLERANCE = { toleranceFloorMicroCents: 0, tolerancePpm: 0 };

test("a key present only in ours compares against zero on theirs' side", () => {
  const ours = new Map([["2026-08-01|ws1", 500]]);
  const [v] = reconcile(ours, [], ZERO_TOLERANCE);
  expect(v).toEqual({
    day: "2026-08-01", workspaceId: "ws1",
    oursMicroCents: 500, theirsMicroCents: 0, deltaMicroCents: -500,
    toleranceMicroCents: 0, withinTolerance: false,
  });
});

test("a key present only in theirs compares against zero on ours' side", () => {
  const theirs = [{ day: "2026-08-01", workspaceId: "ws1", amountMicroCents: 700 }];
  const [v] = reconcile(new Map(), theirs, ZERO_TOLERANCE);
  expect(v).toEqual({
    day: "2026-08-01", workspaceId: "ws1",
    oursMicroCents: 0, theirsMicroCents: 700, deltaMicroCents: 700,
    toleranceMicroCents: 0, withinTolerance: false,
  });
});

test("withinTolerance is true when the delta lands exactly on the tolerance boundary", () => {
  // floor 100, ppm 0 -> tolerance always 100. |delta| = |1100 - 1000| = 100 == tolerance.
  const ours = new Map([["2026-08-01|ws1", 1000]]);
  const theirs = [{ day: "2026-08-01", workspaceId: "ws1", amountMicroCents: 1100 }];
  const [v] = reconcile(ours, theirs, { toleranceFloorMicroCents: 100, tolerancePpm: 0 });
  expect(v.deltaMicroCents).toBe(100);
  expect(v.toleranceMicroCents).toBe(100);
  expect(v.withinTolerance).toBe(true);
});

test("verdicts are sorted by day then workspaceId", () => {
  const ours = new Map([["2026-08-02|ws1", 0], ["2026-08-01|ws2", 0], ["2026-08-01|ws1", 0]]);
  const verdicts = reconcile(ours, [], ZERO_TOLERANCE);
  expect(verdicts.map((v) => `${v.day}|${v.workspaceId}`)).toEqual([
    "2026-08-01|ws1", "2026-08-01|ws2", "2026-08-02|ws1",
  ]);
});

function verdict(over: Partial<ReconcileVerdict> = {}): ReconcileVerdict {
  return {
    day: "2026-08-01", workspaceId: "ws1",
    oursMicroCents: 1000, theirsMicroCents: 1000, deltaMicroCents: 0,
    toleranceMicroCents: 100, withinTolerance: true,
    ...over,
  };
}

test("reconciliationRows produces a zero-delta, memberId-null row keyed by the verdict", () => {
  const [row] = reconciliationRows([verdict()], "2026-08-02T03:00:00Z");
  expect(row).toEqual({
    kind: "reconciliation", memberId: null, deltaMicroCents: 0,
    ts: "2026-08-02T03:00:00Z", appendedAt: "2026-08-02T03:00:00Z",
    detail: { ...verdict() },
    idempotencyKey: "reconcile:2026-08-01:ws1:1000:1000",
  });
});

test("a changed verdict (late data) produces a distinct idempotency key from the prior run", () => {
  const before = reconciliationRows([verdict({ theirsMicroCents: 1000 })], "2026-08-02T03:00:00Z");
  const after = reconciliationRows([verdict({ theirsMicroCents: 1200, deltaMicroCents: 200 })], "2026-08-03T03:00:00Z");
  expect(before[0].idempotencyKey).not.toBe(after[0].idempotencyKey);
});

test("multiple results for the same day and workspace sum", () => {
  const pages = [
    { data: [{ starting_at: "2026-08-01T00:00:00Z", results: [
      { amount: "1.00", currency: "USD", workspace_id: "ws1" },
      { amount: "2.50", currency: "USD", workspace_id: "ws1" },
    ] }] },
  ];
  const { rows } = parseCostReport(pages);
  // 1.00 -> 1_000_000; 2.50 -> 2_500_000; sum 3_500_000
  expect(rows).toEqual([{ day: "2026-08-01", workspaceId: "ws1", amountMicroCents: 3_500_000 }]);
});

test("a bucket with a missing or non-string starting_at is malformed, not a crash", () => {
  // One rotten bucket must not take down the nightly run (spec §6: degrade, alarm, continue).
  const pages = [{
    data: [
      { results: [{ amount: "100.0000", currency: "USD", workspace_id: "ws-a" }] }, // no starting_at
      { starting_at: 42, results: [{ amount: "100.0000", currency: "USD", workspace_id: "ws-a" }] },
      { starting_at: "2026-08-30T00:00:00Z",
        results: [{ amount: "123.4500", currency: "USD", workspace_id: "ws-b" }] },
    ],
  }];
  const { rows, malformed } = parseCostReport(pages);
  // The two bad buckets count once each; the good row still lands:
  // "123.4500" cents = 123 x 1,000,000 + 450,000 = 123,450,000 micro-cents.
  expect(malformed).toBe(2);
  expect(rows).toEqual([
    { day: "2026-08-30", workspaceId: "ws-b", amountMicroCents: 123_450_000 },
  ]);
});

test("a null or non-object entry in bucket.results is malformed, not a crash", () => {
  const pages = [{ data: [{ starting_at: "2026-08-30T00:00:00Z", results: [
    null,
    "garbage",
    { amount: "50.0000", currency: "USD", workspace_id: "ws-a" },
  ] } ] }];
  const { rows, malformed } = parseCostReport(pages);
  // "50.0000" cents = 50 x 1,000,000 = 50,000,000 micro-cents.
  expect(malformed).toBe(2);
  expect(rows).toEqual([{ day: "2026-08-30", workspaceId: "ws-a", amountMicroCents: 50_000_000 }]);
});
