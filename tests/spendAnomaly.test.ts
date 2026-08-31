import { expect, test } from "bun:test";
import { detectSpendAnomaly, ANOMALY_FLOOR_MICRO_CENTS, MIN_HISTORY_DAYS, ANOMALY_MULTIPLIER } from "../src/detect/spendAnomaly";
import { computeMetrics } from "../src/metrics";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import type { UsageEvent } from "../src/types";

/**
 * Register ids 126 and 127: spend caps and anomaly detection change nothing on the wire —
 * they exist so a runaway loop is a Tuesday incident, not a month-end invoice. This
 * detector flags days, it never prices a saving: money already spent is not recoverable.
 */

let n = 0;
const onDay = (day: string, inputTokens: number, over: Partial<UsageEvent> = {}): UsageEvent => ({
  idempotencyKey: `k${++n}`, accountId: "local", projectId: "p",
  ts: `${day}T12:00:00Z`, sessionId: null, source: "claude_code", serviceTier: null,
  model: "claude-opus-5",
  inputTokens, cacheReadTokens: 0, cacheCreationTokens: 0,
  cacheCreation5mTokens: 0, cacheCreation1hTokens: 0, outputTokens: 0,
  compactionInputTokens: 0, compactionOutputTokens: 0,
  ...over,
});

// 2 MTok of Opus input at 500 µ¢/token = $10.00/day — comfortably above the floor.
const QUIET = Array.from({ length: 8 }, (_, i) => onDay(`2026-08-0${i + 1}`, 2_000_000));

// The detector reads Metrics.byDay rather than pricing events itself — computeMetrics
// already ran costOfEvent once per event, and this is the same rate card every time.
const detect = (events: UsageEvent[]) => detectSpendAnomaly(computeMetrics(events, CARD));

test("a day spiking past 3x the trailing median is flagged", () => {
  const f = detect([...QUIET, onDay("2026-08-09", 20_000_000)]);
  expect(f.computable).toBe(true);
  expect(f.anomalies.length).toBe(1);
  expect(f.anomalies[0].day).toBe("2026-08-09");
  // $100.00 against a $10.00 trailing median, both in integer micro-cents.
  expect(f.anomalies[0].microCents).toBe(10_000_000_000);
  expect(f.anomalies[0].trailingMedianMicroCents).toBe(1_000_000_000);
});

test("flat traffic raises nothing", () => {
  const f = detect([...QUIET, onDay("2026-08-09", 2_000_000)]);
  expect(f.anomalies).toEqual([]);
});

test("a spike below the absolute floor is noise, not an anomaly", () => {
  // 2k tokens/day = $0.01; a 10x day is still centavos. Ratios alone cry wolf on tiny bills.
  const quietTiny = Array.from({ length: 8 }, (_, i) => onDay(`2026-08-0${i + 1}`, 2_000));
  const f = detect([...quietTiny, onDay("2026-08-09", 20_000)]);
  expect(f.anomalies).toEqual([]);
});

test("too little history cannot claim an anomaly, and says so", () => {
  const f = detect([onDay("2026-08-01", 2_000_000), onDay("2026-08-02", 60_000_000)]);
  expect(f.computable).toBe(false);
  expect(f.anomalies).toEqual([]);
  expect(f.days).toBe(2);
});

test("an empty input is computable and clean", () => {
  const f = detect([]);
  expect(f.computable).toBe(true);
  expect(f.anomalies).toEqual([]);
});

test("unknown models are counted apart, never silently priced", () => {
  const f = detect([...QUIET, onDay("2026-08-09", 20_000_000, { model: "mystery-9000" })]);
  expect(f.skippedUnpriceable).toBe(1);
  expect(f.anomalies).toEqual([]); // the spike day priced $0 — the unpriceable event is not guessed at
});

test("a silent-then-spike history is the classic runaway shape, and counts", () => {
  // Seven days priced at exactly $0 (real events, zero tokens), then a spike over the
  // floor. The trailing median is $0, and the rule fires on it rather than treating a
  // zero median as an edge case to skip.
  const silent = Array.from({ length: 7 }, (_, i) => onDay(`2026-08-0${i + 1}`, 0));
  const f = detect([...silent, onDay("2026-08-08", 20_000_000)]);
  expect(f.anomalies.length).toBe(1);
  expect(f.anomalies[0].trailingMedianMicroCents).toBe(0);
});

test("exactly 3x the median does not cross the strict boundary", () => {
  // QUIET is $10.00/day; 6,000,000 input tokens at 500 µ¢/token is exactly $30.00 — 3x,
  // not "more than" 3x.
  const f = detect([...QUIET, onDay("2026-08-09", 6_000_000)]);
  expect(f.anomalies).toEqual([]);
});

test("one micro-cent past 3x the median crosses it", () => {
  const f = detect([...QUIET, onDay("2026-08-09", 6_000_001)]);
  expect(f.anomalies.length).toBe(1);
});

test("the floor, history, and multiplier constants are what the prose claims", () => {
  // Pinned so the documentation cannot drift from the arithmetic: $10.00, 8 days, 3x.
  expect(ANOMALY_FLOOR_MICRO_CENTS).toBe(1_000_000_000);
  expect(MIN_HISTORY_DAYS).toBe(8);
  expect(ANOMALY_MULTIPLIER).toBe(3);
});
