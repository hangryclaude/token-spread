import { expect, test } from "bun:test";
import { peakBurnPerMinuteMicroCents, reserveMicroCents } from "../../src/pool/reserve";
import type { LedgerRow } from "../../src/pool/types";

// Minimal row builder — only the fields peakBurnPerMinuteMicroCents reads vary per test.
function row(overrides: Partial<LedgerRow>): LedgerRow {
  return {
    seq: 0,
    kind: "usage",
    memberId: "m1",
    deltaMicroCents: 0,
    idempotencyKey: "k",
    ts: "2026-08-30T12:00:00Z",
    detail: {},
    appendedAt: "2026-08-30T12:00:00Z",
    ...overrides,
  };
}

test("single usage row in one minute is the peak burn for that minute", () => {
  // one row, -500 micro-cents delta -> burn 500 for that minute, no other minute to beat it.
  const rows = [row({ deltaMicroCents: -500, ts: "2026-08-30T12:00:30Z" })];
  const peak = peakBurnPerMinuteMicroCents(rows, { nowIso: "2026-08-30T12:05:00Z", lookbackDays: 1 });
  expect(peak).toBe(500);
});

test("empty input yields zero peak", () => {
  const peak = peakBurnPerMinuteMicroCents([], { nowIso: "2026-08-30T12:05:00Z", lookbackDays: 1 });
  expect(peak).toBe(0);
});

test("two rows in the same minute sum, rows in different minutes do not", () => {
  // minute 12:00 -> 100 + 200 = 300; minute 12:01 -> 900. Peak is the bigger bucket, 900,
  // not the naive sum of everything (1200).
  const rows = [
    row({ deltaMicroCents: -100, ts: "2026-08-30T12:00:05Z" }),
    row({ deltaMicroCents: -200, ts: "2026-08-30T12:00:50Z" }),
    row({ deltaMicroCents: -900, ts: "2026-08-30T12:01:10Z" }),
  ];
  const peak = peakBurnPerMinuteMicroCents(rows, { nowIso: "2026-08-30T12:05:00Z", lookbackDays: 1 });
  expect(peak).toBe(900);
});

test("non-usage rows are ignored even when their delta would dominate", () => {
  // a +50,000 credit row must not be read as burn, and must not merge into the usage bucket.
  const rows = [
    row({ kind: "credit", deltaMicroCents: 50_000, ts: "2026-08-30T12:00:05Z" }),
    row({ kind: "usage", deltaMicroCents: -300, ts: "2026-08-30T12:00:06Z" }),
  ];
  const peak = peakBurnPerMinuteMicroCents(rows, { nowIso: "2026-08-30T12:05:00Z", lookbackDays: 1 });
  expect(peak).toBe(300);
});

test("a row exactly on the lookback lower boundary is included", () => {
  // now = 2026-08-30T12:00:00Z, lookbackDays = 1 -> lower bound = 2026-08-29T12:00:00Z inclusive.
  const rows = [row({ deltaMicroCents: -777, ts: "2026-08-29T12:00:00Z" })];
  const peak = peakBurnPerMinuteMicroCents(rows, { nowIso: "2026-08-30T12:00:00Z", lookbackDays: 1 });
  expect(peak).toBe(777);
});

test("a row one millisecond before the lookback lower boundary is excluded", () => {
  const rows = [row({ deltaMicroCents: -777, ts: "2026-08-29T11:59:59.999Z" })];
  const peak = peakBurnPerMinuteMicroCents(rows, { nowIso: "2026-08-30T12:00:00Z", lookbackDays: 1 });
  expect(peak).toBe(0);
});

test("a row exactly at now is included (inclusive upper bound)", () => {
  const rows = [row({ deltaMicroCents: -42, ts: "2026-08-30T12:00:00Z" })];
  const peak = peakBurnPerMinuteMicroCents(rows, { nowIso: "2026-08-30T12:00:00Z", lookbackDays: 1 });
  expect(peak).toBe(42);
});

test("a row after now is excluded", () => {
  const rows = [row({ deltaMicroCents: -42, ts: "2026-08-30T12:00:01Z" })];
  const peak = peakBurnPerMinuteMicroCents(rows, { nowIso: "2026-08-30T12:00:00Z", lookbackDays: 1 });
  expect(peak).toBe(0);
});

test("a row with a -07:00 offset normalizes into the right UTC minute", () => {
  // 2026-08-30T05:00:30-07:00 is 2026-08-30T12:00:30Z -> bucket "2026-08-30T12:00",
  // the same bucket a plain "Z" row at 12:00 would land in.
  const rows = [
    row({ deltaMicroCents: -100, ts: "2026-08-30T05:00:30-07:00" }),
    row({ deltaMicroCents: -50, ts: "2026-08-30T12:00:45Z" }),
  ];
  const peak = peakBurnPerMinuteMicroCents(rows, { nowIso: "2026-08-30T12:05:00Z", lookbackDays: 1 });
  expect(peak).toBe(150);
});

test("an unparseable timestamp is ignored, not thrown or NaN-propagated", () => {
  const rows = [
    row({ deltaMicroCents: -100, ts: "not-a-date" }),
    row({ deltaMicroCents: -30, ts: "2026-08-30T12:00:00Z" }),
  ];
  const peak = peakBurnPerMinuteMicroCents(rows, { nowIso: "2026-08-30T12:05:00Z", lookbackDays: 1 });
  expect(peak).toBe(30);
});

test("reserveMicroCents multiplies peak by window exactly", () => {
  // spec §5 worked example: $2/min peak (2_000_000 micro-cents/min) x 7 minutes = $14 held back.
  expect(reserveMicroCents(2_000_000, 7)).toBe(14_000_000);
  expect(reserveMicroCents(0, 7)).toBe(0);
  expect(reserveMicroCents(500, 0)).toBe(0);
});

test("reserveMicroCents throws on a negative or non-integer input", () => {
  expect(() => reserveMicroCents(-1, 7)).toThrow();
  expect(() => reserveMicroCents(500, -1)).toThrow();
  expect(() => reserveMicroCents(1.5, 7)).toThrow();
  expect(() => reserveMicroCents(500, 1.5)).toThrow();
});
