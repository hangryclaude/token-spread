import type { ImportProvenance } from "./importers/claudeCode";
import { measuredCacheWriteOverheadPct, type Metrics } from "./metrics";
import { formatCents, microCentsToCents } from "./pricing";
import { cardAgeDays, type RateCard } from "./rates";
import { DEFAULT_CACHE_WRITE_OVERHEAD_PCT, type Assumptions, type Simulation } from "./simulate";

const STALE_AFTER_DAYS = 30;

export interface Money { microCents: number; cents: number; formatted: string }

/** Token volume the report covers. Counts, not money — nothing here is priced. */
export interface TokenTotals {
  total: number;
  input: number;
  cacheRead: number;
  cacheCreation: number;
  output: number;
  /** cacheRead / (cacheRead + input), as a percent to one decimal. */
  cacheHitPct: number;
}

/**
 * Each lever's saving as a percent of the baseline **cost**, to one decimal.
 *
 * Deliberately not "tokens saved": neither lever removes a single token. Caching
 * moves input tokens from the full rate to the 0.10x read rate, and routing moves
 * them to a cheaper model's rate. The token count is identical before and after —
 * only the price attached to each token changes. A "tokens saved" figure would be
 * zero, and any non-zero one would be a lie.
 */
export interface SavingsPct { cacheOnly: number; routingOnly: number; combined: number }

export interface AssumptionNote {
  name: string;
  value: string;
  kind: "measured" | "operator_set";
  note: string;
}

export interface Report {
  generatedAt: string;
  rateCard: RateCard;
  currentCost: Money;
  cacheHitRate: number;
  byModel: Record<string, Money>;
  byProject: Record<string, Money>;
  byAccount: Record<string, Money>;
  tokens: TokenTotals;
  savings: { cacheOnly: Money; routingOnly: Money; combined: Money };
  savingsPct: SavingsPct;
  /** Blended cost per million tokens, before and after both levers. */
  effectiveRatePerMTok: { before: Money; after: Money };
  routingCurve: Array<{ fractionPct: number; cost: Money; saved: Money }>;
  cacheHeadroom: { targetCacheHitPct: number; cost: Money; saved: Money } | null;
  assumptions: AssumptionNote[];
  provenance: ImportProvenance & { skipped: Metrics["skipped"] };
  warnings: string[];
  humanSummary: string;
}

const money = (microCents: number): Money => {
  const cents = microCentsToCents(microCents);
  return { microCents, cents, formatted: formatCents(cents) };
};

/** Thousands separators without Intl — locale must not change the report's bytes. */
const group = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** One decimal place, half-up. Presentation only — never feeds back into pricing. */
const pct1 = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;

/**
 * Blended µ¢ per million tokens. Integer-first so a huge token count can't lose
 * precision: multiply before dividing.
 */
const ratePerMTok = (microCents: number, tokens: number): number =>
  tokens === 0 ? 0 : Math.round((microCents * 1_000_000) / tokens);

const mapMoney = (rec: Record<string, { microCents: number }>): Record<string, Money> =>
  Object.fromEntries(
    Object.entries(rec).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, money(v.microCents)]),
  );

export function buildReport(input: {
  metrics: Metrics;
  simulation: Simulation;
  assumptions: Assumptions;
  provenance: ImportProvenance;
  card: RateCard;
  generatedAt: Date;
}): Report {
  const { metrics, simulation: sim, assumptions: a, provenance, card, generatedAt } = input;

  const o = metrics.overall;
  const baseline = o.microCents;
  const totalTokens = o.inputTokens + o.cacheReadTokens + o.cacheCreationTokens + o.outputTokens;

  const warnings: string[] = [];
  const age = cardAgeDays(card, generatedAt);
  if (age > STALE_AFTER_DAYS) {
    warnings.push(`rate card is ${age} days old (captured ${card.capturedAt}) — every figure may be wrong`);
  }
  if (provenance.synthesizedKeys > 0) {
    warnings.push(`${provenance.synthesizedKeys} events had no requestId; dedup for those is best-effort`);
  }
  if (metrics.skipped.unknown_model > 0) {
    warnings.push(
      `${metrics.skipped.unknown_model} events used a model absent from the rate card and were excluded: ` +
      metrics.unknownModels.join(", "),
    );
  }

  const observedPct = Math.round(metrics.cacheHitRate * 100);
  const writeOverheadPct = a.cacheWriteOverheadPct ?? DEFAULT_CACHE_WRITE_OVERHEAD_PCT;
  const measuredOverhead = measuredCacheWriteOverheadPct(metrics);

  if (measuredOverhead !== null && measuredOverhead !== writeOverheadPct) {
    warnings.push(
      `cache-write overhead is assumed at ${writeOverheadPct}% but measures ${measuredOverhead}% on this traffic — ` +
      `the simulated cache figures are driven by the assumption, not the measurement`,
    );
  }
  if (sim.cacheHeadroom && sim.cacheHeadroom.savedMicroCents < 0) {
    warnings.push(
      `simulated cache headroom is negative: the observed hit rate is already ${observedPct}%, ` +
      `so the target adds write cost without removing read cost — there is no cache lever left on this traffic`,
    );
  }

  const humanSummary = [
    `Current cost: ${formatCents(microCentsToCents(metrics.overall.microCents))} across ${metrics.overall.events} priced events.`,
    `Observed cache-hit rate: ${observedPct}% — defined as cache reads over (cache reads + fresh input); cache writes are excluded from the denominator.`,
    // The routing figures are attributed at ONE fraction — the last curve point. Naming
    // it inline is not decoration: unlabelled, "routing saves $753" reads as a property
    // of the traffic when it is really a property of an assumption nobody agreed to.
    `Savings levers compound and do not add: cache-only ${formatCents(microCentsToCents(sim.attribution.cacheOnlySavedMicroCents))} (raising cache-hit to ${a.targetCacheHitPct ?? 0}%), routing-only ${formatCents(microCentsToCents(sim.attribution.routingOnlySavedMicroCents))} (at ${a.routableFractionsPct.at(-1) ?? 0}% of traffic routed to ${a.targetModel}), both together ${formatCents(microCentsToCents(sim.attribution.combinedSavedMicroCents))}.`,
    // Percentages are of COST. Neither lever removes a token — they change the price
    // each token bills at, so a "tokens saved" figure would be zero by construction.
    `Tokens: ${group(totalTokens)} priced (${group(o.cacheReadTokens)} cache reads, ${group(o.inputTokens)} fresh input, ${group(o.outputTokens)} output).`,
    `Percent of cost saved: cache-only ${pct1(sim.attribution.cacheOnlySavedMicroCents, baseline)}%, routing-only ${pct1(sim.attribution.routingOnlySavedMicroCents, baseline)}%, both together ${pct1(sim.attribution.combinedSavedMicroCents, baseline)}%.`,
    `Blended rate: ${formatCents(microCentsToCents(ratePerMTok(baseline, totalTokens)))} per MTok today → ${formatCents(microCentsToCents(ratePerMTok(baseline - sim.attribution.combinedSavedMicroCents, totalTokens)))} per MTok under both levers.`,
    `Rate card captured ${card.capturedAt}. ${card.notes.join(" ")}`,
  ].join("\n");

  return {
    generatedAt: generatedAt.toISOString(),
    rateCard: card,
    currentCost: money(metrics.overall.microCents),
    cacheHitRate: metrics.cacheHitRate,
    byModel: mapMoney(metrics.byModel),
    byProject: mapMoney(metrics.byProject),
    byAccount: mapMoney(metrics.byAccount),
    tokens: {
      total: totalTokens,
      input: o.inputTokens,
      cacheRead: o.cacheReadTokens,
      cacheCreation: o.cacheCreationTokens,
      output: o.outputTokens,
      cacheHitPct: pct1(o.cacheReadTokens, o.cacheReadTokens + o.inputTokens),
    },
    savings: {
      cacheOnly: money(sim.attribution.cacheOnlySavedMicroCents),
      routingOnly: money(sim.attribution.routingOnlySavedMicroCents),
      combined: money(sim.attribution.combinedSavedMicroCents),
    },
    savingsPct: {
      cacheOnly: pct1(sim.attribution.cacheOnlySavedMicroCents, baseline),
      routingOnly: pct1(sim.attribution.routingOnlySavedMicroCents, baseline),
      combined: pct1(sim.attribution.combinedSavedMicroCents, baseline),
    },
    effectiveRatePerMTok: {
      before: money(ratePerMTok(baseline, totalTokens)),
      after: money(ratePerMTok(baseline - sim.attribution.combinedSavedMicroCents, totalTokens)),
    },
    routingCurve: sim.routingCurve.map((p) => ({
      fractionPct: p.fractionPct, cost: money(p.microCents), saved: money(p.savedMicroCents),
    })),
    cacheHeadroom: sim.cacheHeadroom && {
      targetCacheHitPct: sim.cacheHeadroom.targetCacheHitPct,
      cost: money(sim.cacheHeadroom.microCents),
      saved: money(sim.cacheHeadroom.savedMicroCents),
    },
    assumptions: [
      { name: "cacheHitRate", value: `${observedPct}%`, kind: "measured",
        note: "computed from real cache_read vs input tokens" },
      { name: "observedCacheWrites", value: `${metrics.overall.cacheCreationTokens} tokens`, kind: "measured",
        note: "cache_creation tokens present in the source data" },
      { name: "measuredCacheWriteOverhead",
        value: measuredOverhead === null ? "n/a" : `${measuredOverhead}%`, kind: "measured",
        note: "observed cache writes as a share of cache-eligible input — compare against the operator-set figure below" },
      { name: "modelMix", value: Object.keys(metrics.byModel).sort().join(", "), kind: "measured",
        note: "observed per-model split" },
      { name: "projectSplit", value: Object.keys(metrics.byProject).sort().join(", "), kind: "measured",
        note: "observed per-project split" },
      { name: "routableFraction", value: `${a.routableFractionsPct.join("/")}%`, kind: "operator_set",
        note: "no per-request difficulty label exists yet — reported as a curve, never a point" },
      { name: "cacheWriteOverhead", value: `${writeOverheadPct}%`, kind: "operator_set",
        note: "writes needed to sustain the simulated hit rate, as a share of cache-eligible input; the observed write volume describes the old regime and cannot be carried over" },
      { name: "rateCard", value: card.capturedAt, kind: "operator_set",
        note: "list prices, refreshed by hand" },
    ],
    provenance: { ...provenance, skipped: metrics.skipped },
    warnings,
    humanSummary,
  };
}
