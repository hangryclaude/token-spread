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

// The same bundle twice: once standard, once on the batch tier. Batch bills every token
// class at 0.5x, so the observed bill is $750.00 + $375.00 = $1,125.00. With no cache
// target no lever is applied — the simulation must reproduce the observed bill exactly.
// Found 2026-08-20: byModel merges tiers and priceBundle stamped serviceTier: null, so
// the batch half re-priced at standard and the difference surfaced as a phantom delta.
test("mixed-tier traffic with no cache target saves exactly $0", () => {
  const mixed: UsageEvent[] = [
    { ...BASELINE[0] },
    { ...BASELINE[0], idempotencyKey: "k-batch", serviceTier: "batch" },
  ];
  const m = computeMetrics(mixed, CARD);
  const s = simulate(m, CARD, { targetCacheHitPct: null });
  expect(cash(s.baselineMicroCents)).toBe("$1,125.00");
  expect(s.attribution.cacheOnlySavedMicroCents).toBe(0);
  expect(s.attribution.combinedSavedMicroCents).toBe(0);
});

// AC5's "= observed ⇒ $0" floor, on traffic that is not all one tier.
test("mixed-tier traffic with target equal to observed saves exactly $0", () => {
  const mixed: UsageEvent[] = [
    { ...BASELINE[0] },
    { ...BASELINE[0], idempotencyKey: "k-batch", serviceTier: "batch" },
  ];
  const m = computeMetrics(mixed, CARD); // observed cache-hit is 0
  const s = simulate(m, CARD, { targetCacheHitPct: 0 });
  expect(s.cacheHeadroom!.savedMicroCents).toBe(0);
  expect(s.attribution.cacheOnlySavedMicroCents).toBe(0);
});

// Batch multiplies every token class by 0.5, so a cache saving on all-batch traffic must
// be exactly half the saving the identical traffic yields at standard — the lever's token
// arithmetic is tier-independent, only the price attached to it halves.
test("cache saving on all-batch traffic is exactly half the all-standard saving", () => {
  const asTier = (tier: UsageEvent["serviceTier"]): UsageEvent[] =>
    [{ ...BASELINE[0], idempotencyKey: `k-${tier}`, serviceTier: tier }];
  const std = simulate(computeMetrics(asTier("standard"), CARD), CARD, { ...A, cacheWriteOverheadPct: 0 });
  const bat = simulate(computeMetrics(asTier("batch"), CARD), CARD, { ...A, cacheWriteOverheadPct: 0 });
  expect(std.attribution.cacheOnlySavedMicroCents).toBeGreaterThan(0);
  expect(bat.attribution.cacheOnlySavedMicroCents * 2).toBe(std.attribution.cacheOnlySavedMicroCents);
});

// ── batch-tier lever (opt-in, contractual — register ids 34, 63, 69, 77, 128, 137) ──────
// The Message Batches discount is the provider's contractual 50% on every token class.
// Nothing in transcript data can verify identity across the async boundary, so the lever
// is operator-opted, priced apart from the measured levers, and never summed into them.

// Half of the $750.00 all-standard baseline moves to batch: the moved half bills
// (50 MTok x $5 + 5 MTok x $25) x 0.5 = $187.50, the kept half $375.00 — $562.50 total,
// $187.50 saved. Hand-computed from the 2026-08-08 card, not from the code.
test("batch share of 50 on all-standard traffic saves the hand-computed $187.50", () => {
  const m = computeMetrics(BASELINE, CARD);
  const s = simulate(m, CARD, { targetCacheHitPct: null, batchShareTargetPct: 50 });
  expect(cash(s.batchTier!.savedMicroCents)).toBe("$187.50");
  expect(cash(s.batchTier!.microCents)).toBe("$562.50");
  expect(s.batchTier!.targetSharePct).toBe(50);
});

test("batch share of 0 saves exactly $0", () => {
  const m = computeMetrics(BASELINE, CARD);
  const s = simulate(m, CARD, { targetCacheHitPct: null, batchShareTargetPct: 0 });
  expect(s.batchTier!.savedMicroCents).toBe(0);
});

// Traffic already on the batch tier has no batch discount left to claim. A share of 100
// against all-batch traffic must price to $0 saved, not re-discount the same tokens.
test("batch share of 100 on all-batch traffic saves exactly $0", () => {
  const allBatch: UsageEvent[] = [{ ...BASELINE[0], idempotencyKey: "k-b", serviceTier: "batch" }];
  const m = computeMetrics(allBatch, CARD);
  const s = simulate(m, CARD, { targetCacheHitPct: null, batchShareTargetPct: 100 });
  expect(s.batchTier!.savedMicroCents).toBe(0);
});

test("batch share unset leaves the lever off and attribution untouched", () => {
  const m = computeMetrics(BASELINE, CARD);
  const withNull = simulate(m, CARD, { targetCacheHitPct: null, batchShareTargetPct: null });
  const without = simulate(m, CARD, { targetCacheHitPct: null });
  expect(withNull.batchTier).toBeNull();
  expect(without.batchTier).toBeNull();
  expect(withNull.attribution).toEqual(without.attribution);
});

// Levers compound, never add: the batch saving is computed on the post-cache regime.
// With share 100 every post-cache token halves, so the batch saving must be exactly half
// the post-cache cost — a relation, not a figure, so it holds whatever the cache target did.
test("batch saving compounds on the post-cache cost, never on the raw baseline", () => {
  const m = computeMetrics(BASELINE, CARD);
  const s = simulate(m, CARD, { ...A, cacheWriteOverheadPct: 0, batchShareTargetPct: 100 });
  const postCache = s.baselineMicroCents - s.attribution.cacheOnlySavedMicroCents;
  expect(s.attribution.cacheOnlySavedMicroCents).toBeGreaterThan(0);
  expect(s.batchTier!.savedMicroCents * 2).toBe(postCache);
  // And the contractual lever never leaks into the measured attribution.
  expect(s.attribution.combinedSavedMicroCents).toBe(s.attribution.cacheOnlySavedMicroCents);
});

test("batch share outside 0-100 or non-integer is rejected", () => {
  const m = computeMetrics(BASELINE, CARD);
  expect(() => simulate(m, CARD, { targetCacheHitPct: null, batchShareTargetPct: 101 })).toThrow();
  expect(() => simulate(m, CARD, { targetCacheHitPct: null, batchShareTargetPct: -1 })).toThrow();
  expect(() => simulate(m, CARD, { targetCacheHitPct: null, batchShareTargetPct: 12.5 })).toThrow();
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
  // surviving1hWriteRatioByModel is per-model but reprices nothing across models — it
  // scales the TTL premium by write volume the simulation keeps, on the same model.
  expect(Object.keys(s.attribution).sort())
    .toEqual(["cacheOnlySavedMicroCents", "combinedSavedMicroCents", "surviving1hWriteRatioByModel", "wasteOnly"].sort());
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

// Found 2026-08-20 by an adversarial review: scale() rounded cacheCreationTokens,
// cacheCreation5mTokens and cacheCreation1hTokens independently, so a split bundle could
// violate the 5m + 1h = total invariant that costOfEvent refuses as malformed — and the
// tool's own batch arithmetic crashed the tool's own audit. The property, not the case:
// no share may ever break the invariant the parent bundle held.
test("batch split preserves the 5m+1h=total write invariant at every share", () => {
  const writes: UsageEvent[] = [{
    ...BASELINE[0], idempotencyKey: "kw",
    inputTokens: 100_000, cacheReadTokens: 900_000,
    cacheCreationTokens: 512_998, cacheCreation5mTokens: 305_636, cacheCreation1hTokens: 207_362,
  }];
  const m = computeMetrics(writes, CARD);
  for (const share of [1, 3, 20, 33, 50, 77, 99]) {
    expect(() => simulate(m, CARD, { targetCacheHitPct: null, batchShareTargetPct: share }),
      `share ${share}% split a bundle into a malformed write mix`).not.toThrow();
  }
  // And the minimal case that tripped it: 1 five-minute token + 1 one-hour token at 50%.
  const tiny: UsageEvent[] = [{
    ...BASELINE[0], idempotencyKey: "kt",
    cacheCreationTokens: 2, cacheCreation5mTokens: 1, cacheCreation1hTokens: 1,
  }];
  const mt = computeMetrics(tiny, CARD);
  expect(() => simulate(mt, CARD, { targetCacheHitPct: null, batchShareTargetPct: 50 })).not.toThrow();
});
