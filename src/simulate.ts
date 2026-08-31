import type { Metrics, Totals } from "./metrics";
import { costOfEvent } from "./pricing";
import type { RateCard } from "./rates";
import type { ServiceTier } from "./types";

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
  /**
   * Integer percent of standard-tier traffic the operator asserts could run through the
   * Message Batches API, or null/absent for off. Opt-in and contractual: the 50% is the
   * provider's published discount on every token class, and nothing in usage data can
   * verify identity across the async boundary — so this lever is priced apart from the
   * measured ones and never summed into them. Traffic already on the batch tier is not
   * movable; there is no discount left on it.
   */
  batchShareTargetPct?: number | null;
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
  /**
   * The opt-in contractual lever, computed on the post-cache regime — levers compound,
   * never add. `microCents` is the total under cache-and-batch; `savedMicroCents` is the
   * step down from the post-cache cost, so it can never double-count the cache saving.
   * Deliberately absent from `attribution`: that block is measured levers only.
   */
  batchTier: { targetSharePct: number; microCents: number; savedMicroCents: number } | null;
  attribution: {
    cacheOnlySavedMicroCents: number;
    /**
     * Family E of the register. Detecting it needs retry/duplicate/zombie signals the
     * slice-1 importer does not carry, so it is honestly unmeasured rather than zero.
     */
    wasteOnly: Unquantified;
    combinedSavedMicroCents: number;
    /**
     * Per model: what fraction of its observed one-hour cache-write volume still exists
     * in the simulated regime, in [0, 1]. 1 when no cache lever is applied. The report
     * multiplies the TTL right-sizing premium by this before adding it to the headline —
     * a lever cannot recover a premium on writes the simulation already removed, and the
     * two levers both touching cache writes is exactly the case where a plain sum
     * overstates (the register's own rule: levers multiply).
     */
    surviving1hWriteRatioByModel: Record<string, number>;
  };
}

/**
 * Token quantities detached from a model, so they can be repriced under another.
 *
 * Derived from `Totals`, not hand-listed: `Totals` minus the two fields that are pricing
 * artifacts rather than token counts (`events`, `microCents`). A field Totals gains later
 * lands on Bundle automatically instead of silently staying un-repriceable — the TTL split
 * did exactly that until it was carried here by hand: a bundle missing
 * `cacheCreation5mTokens`/`cacheCreation1hTokens` reprices observed one-hour writes (2x) at
 * the five-minute rate (1.25x) and reports the difference as a saving the customer never
 * made, a phantom that survived until a fixture with real writes finally had something to
 * mis-price.
 */
type Bundle = Omit<Totals, "events" | "microCents">;

const bundleOf = (t: Totals): Bundle => {
  const { events, microCents, ...bundle } = t;
  return bundle;
};

/** Apply `fn` to every token field. Reads the field list off the object itself, so a field
 * added to Bundle is included without this function needing to be told about it by hand. */
const mapBundle = (b: Bundle, fn: (v: number) => number): Bundle =>
  Object.fromEntries((Object.keys(b) as (keyof Bundle)[]).map((k) => [k, fn(b[k])])) as Bundle;

const scale = (b: Bundle, pct: number): Bundle => {
  const scaled = mapBundle(b, (v) => Math.round(v * pct / 100));
  return {
    ...scaled,
    // Derived from the rounded parts, never rounded on its own: three independent
    // roundings can disagree by one token, and costOfEvent rightly refuses a bundle
    // whose 5m + 1h split does not equal its total. Found 2026-08-20 by an adversarial
    // review — the batch split's own arithmetic was tripping the malformed-event guard.
    cacheCreationTokens: scaled.cacheCreation5mTokens + scaled.cacheCreation1hTokens,
  };
};

/** The complement of a scaled split — subtraction, so no token is created or lost to rounding. */
const minus = (a: Bundle, b: Bundle): Bundle =>
  Object.fromEntries((Object.keys(a) as (keyof Bundle)[]).map((k) => [k, a[k] - b[k]])) as Bundle;

/**
 * Price a bundle. When `cacheTargetPct` is given, the input side is recomputed as if
 * that share of cache-eligible input (fresh + read) were served from cache, and the
 * write volume is re-derived from `writeOverheadPct` — the observed cache_creation
 * count describes the *old* cache regime and cannot be carried into a simulated one.
 */
function priceBundle(
  b: Bundle, model: string, tier: ServiceTier | null, card: RateCard,
  cacheTargetPct: number | null, writeOverheadPct: number,
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
    const split = syntheticWriteSplit(b, writeOverheadPct);
    written = split.written5m + split.written1h;
    written5m = split.written5m;
    written1h = split.written1h;
  }

  // Priced through costOfEvent, never by a second copy of the formula: the simulation
  // and the invoice must be incapable of disagreeing. The synthetic event carries token
  // counts into the one pricing function and is never emitted or stored.
  const priced = costOfEvent({
    idempotencyKey: "", accountId: "", projectId: "",
    ts: "", sessionId: null, source: "claude_code", serviceTier: tier, model,
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
 * The write volume a simulated cache regime implies, split by TTL. One function, used by
 * both the pricing path and the survival-ratio attribution, so the two cannot disagree.
 *
 * Synthetic volume, observed regime: pricing the simulated writes 100% at the 5m rate
 * silently re-priced every observed 1h write down to 1.25x inside the simulation — the
 * exact dollar the TTL right-sizing lever claims from the same data, so allMeasured
 * could exceed the whole bill (found 2026-08-21 by an adversarial review pass). The
 * write *volume* is simulated; the 5m/1h mix it bills at stays the one the real traffic
 * paid, and a bundle that never wrote at all defaults to the cheaper rate so a simulated
 * saving is not flattered by assuming the dearer regime.
 */
function syntheticWriteSplit(b: Bundle, writeOverheadPct: number): { written5m: number; written1h: number } {
  const eligible = b.inputTokens + b.cacheReadTokens;
  const written = Math.floor(eligible * writeOverheadPct / 100);
  if (b.cacheCreationTokens <= 0) return { written5m: written, written1h: 0 };
  const written1h = Math.round(written * b.cacheCreation1hTokens / b.cacheCreationTokens);
  return { written5m: written - written1h, written1h };
}

/**
 * Total cost across all models. Every bundle stays on the model that produced it —
 * there is no path here that reprices traffic onto a different model, and there must
 * not be: a different model answering is a different answer. Bundles are per (model,
 * tier), not per model: batch bills every token class at 0.5x, and re-pricing a
 * tier-merged bundle at one tier invents a delta the customer never saw.
 */
function totalCost(
  metrics: Metrics, card: RateCard, cacheTargetPct: number | null, writeOverheadPct: number,
  batchSharePct: number | null = null,
): number {
  let sum = 0;
  for (const { model, tier, totals } of metrics.byModelTier) {
    if (!card.rates[model]) continue; // already bucketed as unknown_model by computeMetrics
    const b = bundleOf(totals);
    // Only standard-priced traffic can move to batch. Traffic already on the batch tier
    // has no discount left, and no other tier reaches this point — unpriceable tiers were
    // skipped by computeMetrics.
    const movable = batchSharePct !== null && (tier === null || tier === "standard");
    if (!movable) {
      sum += priceBundle(b, model, tier, card, cacheTargetPct, writeOverheadPct);
      continue;
    }
    const moved = scale(b, batchSharePct);
    sum += priceBundle(minus(b, moved), model, tier, card, cacheTargetPct, writeOverheadPct);
    sum += priceBundle(moved, model, "batch", card, cacheTargetPct, writeOverheadPct);
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

  const batchSharePct = a.batchShareTargetPct ?? null;
  if (batchSharePct !== null && (!Number.isInteger(batchSharePct) || batchSharePct < 0 || batchSharePct > 100)) {
    throw new Error(`batch share target must be an integer percent 0-100, got ${batchSharePct}`);
  }
  const batchTier = batchSharePct === null ? null : (() => {
    const microCents = totalCost(metrics, card, cacheTargetPct, writeOverheadPct, batchSharePct);
    // Saved is the step down from the post-cache cost, not from the raw baseline:
    // levers compound, and measuring batch against the baseline would sell the cache
    // saving twice to anyone who adds the two figures.
    return { targetSharePct: batchSharePct, microCents, savedMicroCents: cacheOnly - microCents };
  })();

  // Per model, across its tiers: observed 1h write volume vs what the simulated regime
  // keeps. Computed through the same syntheticWriteSplit the pricing path uses, so the
  // ratio and the priced cost cannot disagree. No cache lever (cacheTargetPct null,
  // which includes target == observed) means the writes are untouched: ratio 1.
  const surviving1hWriteRatioByModel: Record<string, number> = {};
  {
    const observed1h: Record<string, number> = {};
    const sim1h: Record<string, number> = {};
    for (const { model, totals } of metrics.byModelTier) {
      if (!card.rates[model]) continue;
      const b = bundleOf(totals);
      observed1h[model] = (observed1h[model] ?? 0) + b.cacheCreation1hTokens;
      sim1h[model] = (sim1h[model] ?? 0) +
        (cacheTargetPct === null ? b.cacheCreation1hTokens : syntheticWriteSplit(b, writeOverheadPct).written1h);
    }
    for (const model of Object.keys(observed1h)) {
      if (observed1h[model] <= 0) continue;
      surviving1hWriteRatioByModel[model] = Math.min(1, sim1h[model] / observed1h[model]);
    }
  }

  // Combined is the product of the levers, never their sum. With waste unquantified the
  // product has one term, so combined equals cache-only — and it must, or we would be
  // inventing a saving out of a lever we did not measure. The batch lever is contractual
  // and opt-in, so it lives beside the attribution, never inside it.
  return {
    baselineMicroCents: baseline,
    cacheHeadroom,
    batchTier,
    attribution: {
      cacheOnlySavedMicroCents: baseline - cacheOnly,
      wasteOnly: UNQUANTIFIED,
      combinedSavedMicroCents: baseline - cacheOnly,
      surviving1hWriteRatioByModel,
    },
  };
}
