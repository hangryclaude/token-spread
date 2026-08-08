import { expect, test } from "bun:test";
import { simulate } from "../src/simulate";
import { computeMetrics } from "../src/metrics";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import { microCentsToCents, formatCents } from "../src/pricing";
import type { UsageEvent } from "../src/types";

// 100 MTok fresh input, 10 MTok output, all Opus, no cache -> $750.00 baseline
const BASELINE: UsageEvent[] = [{
  idempotencyKey: "k1", accountId: "local", projectId: "p",
  ts: "2026-08-01T00:00:00Z", source: "claude_code", model: "claude-opus-5",
  inputTokens: 100_000_000, cacheReadTokens: 0, cacheCreationTokens: 0,
  outputTokens: 10_000_000,
}];

const A = {
  routableFractionsPct: [0, 25, 50, 75, 100] as const,
  targetModel: "claude-haiku-4-5",
  targetCacheHitPct: 70,
};

const cash = (micro: number) => formatCents(microCentsToCents(micro));

test("baseline reproduces the hand-computed bill", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, A);
  expect(cash(s.baselineMicroCents)).toBe("$750.00");
});

test("routing at 0% saves exactly nothing", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, A);
  const p0 = s.routingCurve.find((p) => p.fractionPct === 0)!;
  expect(p0.savedMicroCents).toBe(0);
});

test("routing at 100% moves everything to the target model", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, A);
  const p100 = s.routingCurve.find((p) => p.fractionPct === 100)!;
  // all haiku: 100e6*100 + 10e6*500 = 10e9 + 5e9 = 15e9 micro-cents = $150.00
  expect(cash(p100.microCents)).toBe("$150.00");
});

test("routing curve is monotonically cheaper toward the cheaper model", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, A);
  const costs = s.routingCurve.map((p) => p.microCents);
  for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeLessThan(costs[i - 1]);
});

test("cache headroom below the observed rate is rejected", () => {
  const m = computeMetrics(BASELINE, CARD); // observed cache-hit is 0
  expect(() => simulate(m, CARD, { ...A, targetCacheHitPct: -1 })).toThrow();
});

// -1 above is caught by the 0-100 range-bounds check, not the below-observed check —
// it never actually exercises the `targetCacheHitPct < observedPct` branch. This one
// uses an in-range value below a nonzero observed rate, so it fails only if that
// branch itself is broken.
test("cache headroom below a nonzero observed rate is rejected (in-range value)", () => {
  const halfCache: UsageEvent[] = [{
    idempotencyKey: "k2", accountId: "local", projectId: "p",
    ts: "2026-08-01T00:00:00Z", source: "claude_code", model: "claude-opus-5",
    inputTokens: 50_000_000, cacheReadTokens: 50_000_000, cacheCreationTokens: 0,
    outputTokens: 10_000_000,
  }];
  const m = computeMetrics(halfCache, CARD); // observed cache-hit is 50%
  expect(m.cacheHitRate).toBeCloseTo(0.5, 10);
  expect(() => simulate(m, CARD, { ...A, targetCacheHitPct: 30 })).toThrow();
});

// Spec §9.5 / plan AC5: "targetCacheHit < observed is rejected; = observed ⇒ $0."
// This was previously unverified and actually broken: priceBundle() re-derived write
// volume from cacheWriteOverheadPct whenever a cache target was set, even when the
// target equaled the already-observed rate and implied no behavior change — charging
// phantom cache-write cost the real baseline never incurred.
test("cache headroom target equal to the observed rate saves exactly $0", () => {
  const m = computeMetrics(BASELINE, CARD); // observed cache-hit is 0
  const s = simulate(m, CARD, { ...A, routableFractionsPct: [0], targetCacheHitPct: 0 });
  expect(s.cacheHeadroom!.savedMicroCents).toBe(0);
  expect(s.attribution.cacheOnlySavedMicroCents).toBe(0);
});

test("cache headroom target equal to a nonzero observed rate also saves exactly $0", () => {
  const halfCache: UsageEvent[] = [{
    idempotencyKey: "k3", accountId: "local", projectId: "p",
    ts: "2026-08-01T00:00:00Z", source: "claude_code", model: "claude-opus-5",
    inputTokens: 50_000_000, cacheReadTokens: 50_000_000, cacheCreationTokens: 0,
    outputTokens: 10_000_000,
  }];
  const m = computeMetrics(halfCache, CARD); // observed cache-hit is 50%
  const s = simulate(m, CARD, { ...A, routableFractionsPct: [0], targetCacheHitPct: 50 });
  expect(s.cacheHeadroom!.savedMicroCents).toBe(0);
  expect(s.attribution.cacheOnlySavedMicroCents).toBe(0);
});

test("the levers compound — combined saves less than the sum of each alone", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, { ...A, routableFractionsPct: [40] });
  const { cacheOnlySavedMicroCents: c, routingOnlySavedMicroCents: r,
          combinedSavedMicroCents: both } = s.attribution;

  expect(cash(c)).toBe("$283.75");     // hand-computed, spec 6.7
  expect(cash(r)).toBe("$240.00");     // hand-computed, spec 6.7
  expect(cash(both)).toBe("$432.95");  // hand-computed, spec 6.7
  expect(both).toBeLessThan(c + r);    // the bug this test exists to prevent
});

test("a simulated cache regime synthesizes its own write volume", () => {
  // Observed cache_creation is 0 here, so any write cost must come from the overhead
  // assumption. At 0% overhead the cache-only saving is the naive $315.00; at the
  // default 5% it is the spec's $283.75. The gap is 5e6 tokens x 625 = $31.25.
  const m = computeMetrics(BASELINE, CARD);
  const noOverhead = simulate(m, CARD, { ...A, cacheWriteOverheadPct: 0 });
  expect(cash(noOverhead.attribution.cacheOnlySavedMicroCents)).toBe("$315.00");
  expect(cash(simulate(m, CARD, A).attribution.cacheOnlySavedMicroCents)).toBe("$283.75");
});

test("write overhead must be an integer percent", () => {
  const m = computeMetrics(BASELINE, CARD);
  expect(() => simulate(m, CARD, { ...A, cacheWriteOverheadPct: 5.5 })).toThrow();
  expect(() => simulate(m, CARD, { ...A, cacheWriteOverheadPct: 101 })).toThrow();
});

test("routing-only pricing keeps the observed write volume, not a synthesized one", () => {
  // No cache target applied -> cache_creation stays as measured (0 here), so the
  // routing curve is unaffected by the overhead assumption.
  const m = computeMetrics(BASELINE, CARD);
  const a = simulate(m, CARD, { ...A, cacheWriteOverheadPct: 0 }).routingCurve;
  const b = simulate(m, CARD, { ...A, cacheWriteOverheadPct: 50 }).routingCurve;
  expect(a.map((p) => p.microCents)).toEqual(b.map((p) => p.microCents));
});

test("attribution exposes no additive total", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, { ...A, routableFractionsPct: [40] });
  expect(Object.keys(s.attribution).sort()).toEqual([
    "cacheOnlySavedMicroCents", "combinedSavedMicroCents", "routingOnlySavedMicroCents",
  ]);
});
