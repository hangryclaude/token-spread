import { expect, test } from "bun:test";
import { simulate } from "../src/simulate";
import { computeMetrics } from "../src/metrics";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import { microCentsToCents, formatCents } from "../src/pricing";
import type { UsageEvent } from "../src/types";

// 100 MTok fresh input, 10 MTok output, all Opus, no cache -> $750.00 baseline
const BASELINE: UsageEvent[] = [{
  idempotencyKey: "k1", accountId: "local", projectId: "p",
  ts: "2026-08-01T00:00:00Z", sessionId: null, source: "claude_code", serviceTier: null, model: "claude-opus-5",
  inputTokens: 100_000_000, cacheReadTokens: 0, cacheCreationTokens: 0,
  outputTokens: 10_000_000,
  cacheCreation5mTokens: 0, cacheCreation1hTokens: 0,
  compactionInputTokens: 0, compactionOutputTokens: 0,
}];

const A = {
  targetCacheHitPct: 70,
};

const cash = (micro: number) => formatCents(microCentsToCents(micro));

test("baseline reproduces the hand-computed bill", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, A);
  expect(cash(s.baselineMicroCents)).toBe("$750.00");
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
    ts: "2026-08-01T00:00:00Z", sessionId: null, source: "claude_code", serviceTier: null, model: "claude-opus-5",
    inputTokens: 50_000_000, cacheReadTokens: 50_000_000, cacheCreationTokens: 0,
    outputTokens: 10_000_000,
    cacheCreation5mTokens: 0, cacheCreation1hTokens: 0,
  compactionInputTokens: 0, compactionOutputTokens: 0,
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
  const s = simulate(m, CARD, { ...A, targetCacheHitPct: 0 });
  expect(s.cacheHeadroom!.savedMicroCents).toBe(0);
  expect(s.attribution.cacheOnlySavedMicroCents).toBe(0);
});

test("cache headroom target equal to a nonzero observed rate also saves exactly $0", () => {
  const halfCache: UsageEvent[] = [{
    idempotencyKey: "k3", accountId: "local", projectId: "p",
    ts: "2026-08-01T00:00:00Z", sessionId: null, source: "claude_code", serviceTier: null, model: "claude-opus-5",
    inputTokens: 50_000_000, cacheReadTokens: 50_000_000, cacheCreationTokens: 0,
    outputTokens: 10_000_000,
    cacheCreation5mTokens: 0, cacheCreation1hTokens: 0,
  compactionInputTokens: 0, compactionOutputTokens: 0,
  }];
  const m = computeMetrics(halfCache, CARD); // observed cache-hit is 50%
  const s = simulate(m, CARD, { ...A, targetCacheHitPct: 50 });
  expect(s.cacheHeadroom!.savedMicroCents).toBe(0);
  expect(s.attribution.cacheOnlySavedMicroCents).toBe(0);
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



// ── the identity bar ───────────────────────────────────────────────────────────
// Routing sends a different model, so a different model answers and the result
// changes. That fails the guarantee this product sells. These tests exist so the
// lever cannot come back by accident.

test("simulate exposes no routing lever", () => {
  const m = computeMetrics(BASELINE, CARD);
  const s = simulate(m, CARD, { ...A, targetCacheHitPct: 0 });
  expect("routingCurve" in s).toBe(false);
  expect(Object.keys(s.attribution).sort())
    .toEqual(["cacheOnlySavedMicroCents", "combinedSavedMicroCents", "wasteOnly"].sort());
});

test("assumptions carry no routing knobs", () => {
  const keys = Object.keys(A);
  expect(keys).not.toContain("routableFractionsPct");
  expect(keys).not.toContain("targetModel");
});

test("waste elimination is unquantified, not zero", () => {
  // Slice 1 has no waste signal in the data. Reporting $0 would read as "no waste
  // found"; the honest statement is "not measured here".
  const m = computeMetrics(BASELINE, CARD);
  const s = simulate(m, CARD, { ...A, targetCacheHitPct: 0 });
  expect(s.attribution.wasteOnly).toBe("UNQUANTIFIED");
});

test("a cache target equal to the observed rate saves $0 even when writes exist", () => {
  // The existing AC5 floor test used a fixture with zero cache writes, so it could not
  // see the simulation repricing observed 1h writes (2x) at the 5m rate (1.25x) and
  // calling the difference a saving. That is a phantom: nothing about the traffic changed.
  const withWrites: UsageEvent[] = [{
    idempotencyKey: "k-ttl", accountId: "local", projectId: "p",
    ts: "2026-08-01T00:00:00Z", sessionId: null, source: "claude_code", serviceTier: null, model: "claude-opus-5",
    inputTokens: 0, cacheReadTokens: 50_000_000,
    cacheCreationTokens: 20_000_000,
    cacheCreation5mTokens: 0, cacheCreation1hTokens: 20_000_000,
    outputTokens: 1_000_000,
    compactionInputTokens: 0, compactionOutputTokens: 0,
  }];
  const m = computeMetrics(withWrites, CARD);
  const observed = Math.round(m.cacheHitRate * 100);
  const s = simulate(m, CARD, { ...A, targetCacheHitPct: observed });
  expect(s.attribution.cacheOnlySavedMicroCents).toBe(0);
  expect(s.attribution.combinedSavedMicroCents).toBe(0);
});
