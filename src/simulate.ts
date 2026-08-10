import type { Metrics, Totals } from "./metrics";
import { costOfEvent } from "./pricing";
import type { RateCard } from "./rates";

export interface Assumptions {
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

/**
 * A lever with no signal in the data yet. Reporting 0 would read as "we looked and
 * found none"; this reads as what it is. Never render it as money.
 */
export const UNQUANTIFIED = "UNQUANTIFIED" as const;
export type Unquantified = typeof UNQUANTIFIED;

export interface Simulation {
  baselineMicroCents: number;
  cacheHeadroom: { targetCacheHitPct: number; microCents: number; savedMicroCents: number } | null;
  attribution: {
    cacheOnlySavedMicroCents: number;
    /**
     * Family E of the register. Detecting it needs retry/duplicate/zombie signals the
     * slice-1 importer does not carry, so it is honestly unmeasured rather than zero.
     */
    wasteOnly: Unquantified;
    combinedSavedMicroCents: number;
  };
}

/** Token quantities detached from a model, so they can be repriced under another. */
interface Bundle {
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /**
   * Carried, not re-derived. Without it the simulation reprices observed one-hour
   * writes (2x) at the five-minute rate (1.25x) and reports the difference as a saving
   * the customer never made — a phantom that survived until a fixture with real writes
   * finally had something to mis-price.
   */
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
  outputTokens: number;
}

const bundleOf = (t: Totals): Bundle => ({
  inputTokens: t.inputTokens, cacheReadTokens: t.cacheReadTokens,
  cacheCreationTokens: t.cacheCreationTokens,
  cacheCreation5mTokens: t.cacheCreation5mTokens,
  cacheCreation1hTokens: t.cacheCreation1hTokens,
  outputTokens: t.outputTokens,
});

const scale = (b: Bundle, pct: number): Bundle => ({
  inputTokens: Math.round(b.inputTokens * pct / 100),
  cacheReadTokens: Math.round(b.cacheReadTokens * pct / 100),
  cacheCreationTokens: Math.round(b.cacheCreationTokens * pct / 100),
  cacheCreation5mTokens: Math.round(b.cacheCreation5mTokens * pct / 100),
  cacheCreation1hTokens: Math.round(b.cacheCreation1hTokens * pct / 100),
  outputTokens: Math.round(b.outputTokens * pct / 100),
});

/**
 * Price a bundle. When `cacheTargetPct` is given, the input side is recomputed as if
 * that share of cache-eligible input (fresh + read) were served from cache, and the
 * write volume is re-derived from `writeOverheadPct` — the observed cache_creation
 * count describes the *old* cache regime and cannot be carried into a simulated one.
 */
function priceBundle(
  b: Bundle, model: string, card: RateCard, cacheTargetPct: number | null, writeOverheadPct: number,
): number {
  let fresh = b.inputTokens;
  let read = b.cacheReadTokens;
  let written = b.cacheCreationTokens;
  // Observed writes keep the TTL they were actually billed at. Only a *simulated* write
  // volume has no TTL of its own, and that one is priced at the cheaper 5m rate so a
  // simulated saving is never flattered by assuming the dearer regime was in force.
  let written5m = b.cacheCreation5mTokens;
  let written1h = b.cacheCreation1hTokens;

  if (cacheTargetPct !== null) {
    const eligible = b.inputTokens + b.cacheReadTokens;
    read = Math.floor(eligible * cacheTargetPct / 100);
    fresh = eligible - read;
    written = Math.floor(eligible * writeOverheadPct / 100);
    written5m = written;
    written1h = 0;
  }

  // Priced through costOfEvent, never by a second copy of the formula: the simulation
  // and the invoice must be incapable of disagreeing. The synthetic event carries token
  // counts into the one pricing function and is never emitted or stored.
  const priced = costOfEvent({
    idempotencyKey: "", accountId: "", projectId: "",
    ts: "", sessionId: null, source: "claude_code", serviceTier: null, model,
    inputTokens: fresh, cacheReadTokens: read,
    cacheCreationTokens: written,
    cacheCreation5mTokens: written5m, cacheCreation1hTokens: written1h,
    outputTokens: b.outputTokens,
    compactionInputTokens: 0, compactionOutputTokens: 0,
  }, card);

  if (!priced.ok) throw new Error(`cannot price simulated bundle on ${model}: ${priced.reason}`);
  return priced.microCents;
}

/**
 * Total cost across all models. Every bundle stays on the model that produced it —
 * there is no path here that reprices traffic onto a different model, and there must
 * not be: a different model answering is a different answer.
 */
function totalCost(
  metrics: Metrics, card: RateCard, cacheTargetPct: number | null, writeOverheadPct: number,
): number {
  let sum = 0;
  for (const [model, totals] of Object.entries(metrics.byModel)) {
    if (!card.rates[model]) continue; // already bucketed as unknown_model by computeMetrics
    sum += priceBundle(bundleOf(totals), model, card, cacheTargetPct, writeOverheadPct);
  }
  return sum;
}

export function simulate(metrics: Metrics, card: RateCard, a: Assumptions): Simulation {
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

  // A target equal to the observed rate is not a behavior change — that traffic is
  // already happening. Pricing it through the synthesized-write-volume path anyway
  // charges phantom cache-write cost the real baseline never incurred (writeOverheadPct
  // has no reason to match whatever the observed regime's actual write ratio was), which
  // breaks the AC5 floor: "= observed ⇒ $0". Treat "= observed" as "no cache lever
  // applied" and price the bundle exactly as observed, same as `cacheTargetPct: null`.
  const cacheTargetPct =
    a.targetCacheHitPct !== null && a.targetCacheHitPct === observedPct ? null : a.targetCacheHitPct;

  const baseline = metrics.overall.microCents;

  const cacheHeadroom = a.targetCacheHitPct === null ? null : (() => {
    const microCents = totalCost(metrics, card, cacheTargetPct, writeOverheadPct);
    return {
      targetCacheHitPct: a.targetCacheHitPct,
      microCents,
      savedMicroCents: baseline - microCents,
    };
  })();

  const cacheOnly = totalCost(metrics, card, cacheTargetPct, writeOverheadPct);

  // Combined is the product of the levers, never their sum. With waste unquantified the
  // product has one term, so combined equals cache-only — and it must, or we would be
  // inventing a saving out of a lever we did not measure.
  return {
    baselineMicroCents: baseline,
    cacheHeadroom,
    attribution: {
      cacheOnlySavedMicroCents: baseline - cacheOnly,
      wasteOnly: UNQUANTIFIED,
      combinedSavedMicroCents: baseline - cacheOnly,
    },
  };
}
