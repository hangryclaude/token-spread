import { expect, test } from "bun:test";
import { detectTtlCrossing } from "../src/detect/ttlCrossing";
import type { UsageEvent } from "../src/types";

/**
 * Register id 184: Claude Code's cache TTL flips from 1 hour to 5 minutes on crossing from
 * subscription into usage-credit billing, and ENABLE_PROMPT_CACHING_1H=1 restores it. The
 * wire signature is a session whose writes start on the 1-hour TTL and later continue on
 * 5-minute writes alone. Detect-only: the finding warns, it never prices.
 */

let n = 0;
const ev = (over: Partial<UsageEvent>): UsageEvent => ({
  idempotencyKey: `k${++n}`, accountId: "local", projectId: "p",
  ts: "2026-08-01T00:00:00Z", sessionId: "s1", source: "claude_code", serviceTier: null,
  model: "claude-opus-5",
  inputTokens: 1000, cacheReadTokens: 0, cacheCreationTokens: 0,
  cacheCreation5mTokens: 0, cacheCreation1hTokens: 0, outputTokens: 100,
  compactionInputTokens: 0, compactionOutputTokens: 0,
  ...over,
});

const wrote1h = (ts: string, tokens: number, over: Partial<UsageEvent> = {}) =>
  ev({ ts, cacheCreationTokens: tokens, cacheCreation1hTokens: tokens, ...over });
const wrote5m = (ts: string, tokens: number, over: Partial<UsageEvent> = {}) =>
  ev({ ts, cacheCreationTokens: tokens, cacheCreation5mTokens: tokens, ...over });

test("a session that flips from 1h writes to 5m-only writes is detected", () => {
  const f = detectTtlCrossing([
    wrote1h("2026-08-01T00:00:00Z", 4000),
    wrote5m("2026-08-01T00:10:00Z", 3000),
    wrote5m("2026-08-01T00:20:00Z", 2000),
  ]);
  expect(f.flippedSessions).toBe(1);
  // Every 5m write token after the last 1h write in the flipped session.
  expect(f.affectedWriteTokens).toBe(5000);
});

test("a session writing only 1h, or only 5m, is not a flip", () => {
  expect(detectTtlCrossing([
    wrote1h("2026-08-01T00:00:00Z", 4000),
    wrote1h("2026-08-01T00:10:00Z", 3000),
  ]).flippedSessions).toBe(0);
  expect(detectTtlCrossing([
    wrote5m("2026-08-01T00:00:00Z", 4000),
    wrote5m("2026-08-01T00:10:00Z", 3000),
  ]).flippedSessions).toBe(0);
});

test("5m writes before the 1h regime are not a flip — order matters", () => {
  const f = detectTtlCrossing([
    wrote5m("2026-08-01T00:00:00Z", 3000),
    wrote1h("2026-08-01T00:10:00Z", 4000),
  ]);
  expect(f.flippedSessions).toBe(0);
});

test("mixed 1h and 5m writes inside a single event are not a flip", () => {
  // One event carrying both token classes at once — not a session that started on the
  // 1-hour TTL and later moved to 5-minute-only writes. The doc comment calls this out
  // explicitly as something the detector must not fire on.
  const f = detectTtlCrossing([
    ev({ ts: "2026-08-01T00:00:00Z", cacheCreationTokens: 7000, cacheCreation1hTokens: 4000, cacheCreation5mTokens: 3000 }),
  ]);
  expect(f.flippedSessions).toBe(0);
  expect(f.affectedWriteTokens).toBe(0);
});

test("flips are counted per session, not across sessions", () => {
  // 1h writes live in one session, 5m writes in another — no session flipped.
  const f = detectTtlCrossing([
    wrote1h("2026-08-01T00:00:00Z", 4000, { sessionId: "a" }),
    wrote5m("2026-08-01T00:10:00Z", 3000, { sessionId: "b" }),
  ]);
  expect(f.flippedSessions).toBe(0);
});

test("aggregate sources without sessions cannot answer the question, and say so", () => {
  const f = detectTtlCrossing([
    wrote1h("2026-08-01T00:00:00Z", 4000, { sessionId: null, source: "admin_usage_report" }),
    wrote5m("2026-08-01T00:10:00Z", 3000, { sessionId: null, source: "admin_usage_report" }),
  ]);
  expect(f.computable).toBe(false);
  expect(f.flippedSessions).toBe(0);
});

test("an empty input is computable and clean", () => {
  const f = detectTtlCrossing([]);
  expect(f.computable).toBe(true);
  expect(f.flippedSessions).toBe(0);
  expect(f.affectedWriteTokens).toBe(0);
});
