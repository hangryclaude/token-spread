import type { Metrics, Totals } from "./metrics";
import type { ModelRate, RateCard } from "./rates";

export interface Assumptions {
  /** Integer percents, 0-100. A curve, never a single point. */
  routableFractionsPct: readonly number[];
  targetModel: string;
  /** Integer percent, or null to skip the headroom simulation. */
  targetCacheHitPct: number | null;
  /**
   * Integer percent of cache-eligible input that must be *written* to keep the cache
   * warm under the simulated hit rate. Operator-set; defaults to 5 (spec §6.7).
   * Only applies when `targetCacheHitPct` is non-null — a simulated cache regime
   * implies a write volume the observed data cannot supply.
   */
  cacheWriteOverheadPct?: number;
}

export const DEFAULT_CACHE_WRITE_OVERHEAD_PCT = 5;

export interface RoutingPoint {
  fractionPct: number;
  microCents: number;
  savedMicroCents: number;
}

export interface Simulation {
  baselineMicroCents: number;
  routingCurve: RoutingPoint[];
  cacheHeadroom: { targetCacheHitPct: number; microCents: number; savedMicroCents: number } | null;
  attribution: {
    cacheOnlySavedMicroCents: number;
    routingOnlySavedMicroCents: number;
    combinedSavedMicroCents: number;
  };
}

/** Token quantities detached from a model, so they can be repriced under another. */
interface Bundle {
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
}

const bundleOf = (t: Totals): Bundle => ({
  inputTokens: t.inputTokens, cacheReadTokens: t.cacheReadTokens,
  cacheCreationTokens: t.cacheCreationTokens, outputTokens: t.outputTokens,
});

const scale = (b: Bundle, pct: number): Bundle => ({
  inputTokens: Math.round(b.inputTokens * pct / 100),
  cacheReadTokens: Math.round(b.cacheReadTokens * pct / 100),
  cacheCreationTokens: Math.round(b.cacheCreationTokens * pct / 100),
  outputTokens: Math.round(b.outputTokens * pct / 100),
});

/**
 * Price a bundle. When `cacheTargetPct` is given, the input side is recomputed as if
 * that share of cache-eligible input (fresh + read) were served from cache, and the
 * write volume is re-derived from `writeOverheadPct` — the observed cache_creation
 * count describes the *old* cache regime and cannot be carried into a simulated one.
 */
function priceBundle(
  b: Bundle, rate: ModelRate, cacheTargetPct: number | null, writeOverheadPct: number,
): number {
  let fresh = b.inputTokens;
  let read = b.cacheReadTokens;
  let written = b.cacheCreationTokens;

  if (cacheTargetPct !== null) {
    const eligible = b.inputTokens + b.cacheReadTokens;
    read = Math.floor(eligible * cacheTargetPct / 100);
    fresh = eligible - read;
    written = Math.floor(eligible * writeOverheadPct / 100);
  }

  return fresh * rate.input
       + read * rate.cacheRead
       + written * rate.cacheWrite
       + b.outputTokens * rate.output;
}

/** Total cost across all models, optionally routing `routePct` of every bundle to the target. */
function totalCost(
  metrics: Metrics, card: RateCard,
  routePct: number, targetModel: string, cacheTargetPct: number | null, writeOverheadPct: number,
): number {
  const target = card.rates[targetModel];
  if (!target) throw new Error(`target model not in rate card: ${targetModel}`);

  let sum = 0;
  for (const [model, totals] of Object.entries(metrics.byModel)) {
    const rate = card.rates[model];
    if (!rate) continue; // already bucketed as unknown_model by computeMetrics
    const whole = bundleOf(totals);
    sum += priceBundle(scale(whole, 100 - routePct), rate, cacheTargetPct, writeOverheadPct);
    sum += priceBundle(scale(whole, routePct), target, cacheTargetPct, writeOverheadPct);
  }
  return sum;
}

export function simulate(metrics: Metrics, card: RateCard, a: Assumptions): Simulation {
  for (const p of a.routableFractionsPct) {
    if (!Number.isInteger(p) || p < 0 || p > 100) {
      throw new Error(`routable fraction must be an integer percent 0-100, got ${p}`);
    }
  }

  const writeOverheadPct = a.cacheWriteOverheadPct ?? DEFAULT_CACHE_WRITE_OVERHEAD_PCT;
  if (!Number.isInteger(writeOverheadPct) || writeOverheadPct < 0 || writeOverheadPct > 100) {
    throw new Error(`cache write overhead must be an integer percent 0-100, got ${writeOverheadPct}`);
  }

  const observedPct = Math.round(metrics.cacheHitRate * 100);
  if (a.targetCacheHitPct !== null) {
    if (!Number.isInteger(a.targetCacheHitPct) || a.targetCacheHitPct < 0 || a.targetCacheHitPct > 100) {
      throw new Error(`target cache hit must be an integer percent 0-100, got ${a.targetCacheHitPct}`);
    }
    if (a.targetCacheHitPct < observedPct) {
      throw new Error(`target cache hit ${a.targetCacheHitPct}% is below the observed ${observedPct}%`);
    }
  }

  const baseline = metrics.overall.microCents;

  const routingCurve = a.routableFractionsPct.map((fractionPct) => {
    const microCents = totalCost(metrics, card, fractionPct, a.targetModel, null, writeOverheadPct);
    return { fractionPct, microCents, savedMicroCents: baseline - microCents };
  });

  const cacheHeadroom = a.targetCacheHitPct === null ? null : (() => {
    const microCents = totalCost(metrics, card, 0, a.targetModel, a.targetCacheHitPct, writeOverheadPct);
    return {
      targetCacheHitPct: a.targetCacheHitPct,
      microCents,
      savedMicroCents: baseline - microCents,
    };
  })();

  // Attribution uses the LAST curve point as "the" routing scenario, so a caller that
  // passes a single fraction gets that fraction attributed.
  const routePct = a.routableFractionsPct.at(-1) ?? 0;
  const cachePct = a.targetCacheHitPct;

  const cacheOnly   = totalCost(metrics, card, 0,        a.targetModel, cachePct, writeOverheadPct);
  const routingOnly = totalCost(metrics, card, routePct, a.targetModel, null,     writeOverheadPct);
  const combined    = totalCost(metrics, card, routePct, a.targetModel, cachePct, writeOverheadPct);

  return {
    baselineMicroCents: baseline,
    routingCurve,
    cacheHeadroom,
    attribution: {
      cacheOnlySavedMicroCents: baseline - cacheOnly,
      routingOnlySavedMicroCents: baseline - routingOnly,
      combinedSavedMicroCents: baseline - combined,
    },
  };
}
