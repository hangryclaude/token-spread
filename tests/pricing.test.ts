import { expect, test } from "bun:test";
import { costOfEvent, microCentsToCents, formatCents } from "../src/pricing";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import type { UsageEvent } from "../src/types";

function ev(over: Partial<UsageEvent> = {}): UsageEvent {
  return {
    idempotencyKey: "k", accountId: "local", projectId: "p",
    ts: "2026-08-01T00:00:00Z", source: "claude_code", model: "claude-opus-5",
    inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0,
    ...over,
  };
}

test("prices opus input exactly", () => {
  // 18,000,000 tokens x 500 micro-cents = 9,000,000,000 micro-cents = 9000 cents = $90.00
  const r = costOfEvent(ev({ inputTokens: 18_000_000 }), CARD);
  expect(r).toEqual({ ok: true, microCents: 9_000_000_000 });
  expect(microCentsToCents(9_000_000_000)).toBe(9_000);
  expect(formatCents(9_000)).toBe("$90.00");
});

test("prices all four token classes together", () => {
  // opus: 18e6*500 + 42e6*50 + 3e6*625 + 6e6*2500
  //     = 9.000e9  + 2.100e9 + 1.875e9 + 15.000e9 = 27.975e9 micro-cents = $279.75
  const r = costOfEvent(ev({
    inputTokens: 18_000_000, cacheReadTokens: 42_000_000,
    cacheCreationTokens: 3_000_000, outputTokens: 6_000_000,
  }), CARD);
  expect(r).toEqual({ ok: true, microCents: 27_975_000_000 });
  expect(formatCents(microCentsToCents(27_975_000_000))).toBe("$279.75");
});

test("prices haiku at one fifth of opus input", () => {
  // 12e6*100 + 28e6*10 + 2e6*125 + 4e6*500
  //  = 1.200e9 + 0.280e9 + 0.250e9 + 2.000e9 = 3.730e9 micro-cents = $37.30
  const r = costOfEvent(ev({
    model: "claude-haiku-4-5",
    inputTokens: 12_000_000, cacheReadTokens: 28_000_000,
    cacheCreationTokens: 2_000_000, outputTokens: 4_000_000,
  }), CARD);
  expect(r).toEqual({ ok: true, microCents: 3_730_000_000 });
  expect(formatCents(microCentsToCents(3_730_000_000))).toBe("$37.30");
});

test("unknown model is surfaced, never priced at zero", () => {
  expect(costOfEvent(ev({ model: "gpt-9" }), CARD)).toEqual({ ok: false, reason: "unknown_model" });
});

test("negative and non-integer token counts are rejected", () => {
  expect(costOfEvent(ev({ inputTokens: -1 }), CARD)).toEqual({ ok: false, reason: "malformed" });
  expect(costOfEvent(ev({ outputTokens: 1.5 }), CARD)).toEqual({ ok: false, reason: "malformed" });
});

test("never throws, whatever it is handed", () => {
  expect(() => costOfEvent(ev({ model: "", inputTokens: NaN }), CARD)).not.toThrow();
});

test("rounds to cents half-up, once", () => {
  expect(microCentsToCents(1_499_999)).toBe(1);   // 1.499999c -> 1c
  expect(microCentsToCents(1_500_000)).toBe(2);   // 1.5c      -> 2c
  expect(microCentsToCents(0)).toBe(0);
});

test("formats cents with two decimal places", () => {
  expect(formatCents(0)).toBe("$0.00");
  expect(formatCents(5)).toBe("$0.05");
  expect(formatCents(317_05)).toBe("$317.05");
});
