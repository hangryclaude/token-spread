import { expect, test } from "bun:test";
import { detectTtlRightSizing, FIVE_MINUTES_MS } from "../src/detect/ttlRightSizing";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import type { UsageEvent } from "../src/types";

let n = 0;
function ev(over: Partial<UsageEvent> & { ts: string }): UsageEvent {
  const total = (over.cacheCreation1hTokens ?? 0) + (over.cacheCreation5mTokens ?? 0);
  return {
    idempotencyKey: `k${n++}`, accountId: "local", projectId: "p", sessionId: "s1",
    source: "claude_code" as const, model: "claude-opus-5",
    inputTokens: 0, cacheReadTokens: 0, outputTokens: 0,
    cacheCreation5mTokens: 0, cacheCreation1hTokens: 0,
    compactionInputTokens: 0, compactionOutputTokens: 0,
    ...over,
    cacheCreationTokens: total,
  };
}

const at = (min: number) => new Date(Date.UTC(2026, 7, 11, 10, min, 0)).toISOString();

test("a one-hour write re-read inside five minutes is over-bought", () => {
  const f = detectTtlRightSizing([
    ev({ ts: at(0), cacheCreation1hTokens: 1_000_000 }),
    ev({ ts: at(2) }),                              // next request 2 minutes later
  ], CARD);
  expect(f.overBoughtTokens).toBe(1_000_000);
  // opus-5: 1h write 1000 micro-cents/token, 5m write 625 -> 375 recoverable per token
  expect(f.recoverableMicroCents).toBe(1_000_000 * 375);
});

test("a one-hour write re-read after five minutes is correctly bought", () => {
  const f = detectTtlRightSizing([
    ev({ ts: at(0), cacheCreation1hTokens: 1_000_000 }),
    ev({ ts: at(20) }),
  ], CARD);
  expect(f.overBoughtTokens).toBe(0);
  expect(f.recoverableMicroCents).toBe(0);
});

test("a write with nothing after it is never re-read, and is not a TTL saving", () => {
  // Paying 2x for an entry no one reads is waste, a different lever. Claiming it here
  // would double-count it the day a waste detector lands.
  const f = detectTtlRightSizing([ev({ ts: at(0), cacheCreation1hTokens: 1_000_000 })], CARD);
  expect(f.overBoughtTokens).toBe(0);
  expect(f.neverReReadTokens).toBe(1_000_000);
});

test("sessions do not borrow each other's timing", () => {
  // Two sessions interleaved in time. The gap that matters is to the next request in
  // the SAME session — the other session's traffic does not refresh this prefix.
  const f = detectTtlRightSizing([
    ev({ ts: at(0), sessionId: "a", cacheCreation1hTokens: 1_000_000 }),
    ev({ ts: at(1), sessionId: "b" }),
    ev({ ts: at(30), sessionId: "a" }),
  ], CARD);
  expect(f.overBoughtTokens).toBe(0);
});

test("five-minute writes are already right-sized and are never counted", () => {
  const f = detectTtlRightSizing([
    ev({ ts: at(0), cacheCreation5mTokens: 1_000_000 }),
    ev({ ts: at(1) }),
  ], CARD);
  expect(f.overBoughtTokens).toBe(0);
  expect(f.recoverableMicroCents).toBe(0);
});

test("the boundary is inclusive at exactly five minutes", () => {
  const f = detectTtlRightSizing([
    ev({ ts: at(0), cacheCreation1hTokens: 1_000_000 }),
    ev({ ts: new Date(Date.UTC(2026, 7, 11, 10, 0, 0) + FIVE_MINUTES_MS).toISOString() }),
  ], CARD);
  expect(f.overBoughtTokens).toBe(1_000_000);
});

test("an unknown model is skipped rather than priced at a guess", () => {
  const f = detectTtlRightSizing([
    ev({ ts: at(0), model: "some-other-model", cacheCreation1hTokens: 1_000_000 }),
    ev({ ts: at(1), model: "some-other-model" }),
  ], CARD);
  expect(f.recoverableMicroCents).toBe(0);
  expect(f.skippedUnknownModel).toBe(1);
});

test("the finding declares what backs it", () => {
  const f = detectTtlRightSizing([], CARD);
  // TTL is a field the model never reads: same prompt, same model, same output.
  expect(f.evidence).toBe("PASS_METADATA");
});
