import type { ImportProvenance } from "./importers/claudeCode";
import { measuredCacheWriteOverheadPct, type Metrics } from "./metrics";
import { formatCents, microCentsToCents } from "./pricing";
import { cardAgeDays, type RateCard } from "./rates";
import { DEFAULT_CACHE_WRITE_OVERHEAD_PCT, type Assumptions, type Simulation } from "./simulate";

const STALE_AFTER_DAYS = 30;

export interface Money { microCents: number; cents: number; formatted: string }

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
  savings: { cacheOnly: Money; routingOnly: Money; combined: Money };
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
    savings: {
      cacheOnly: money(sim.attribution.cacheOnlySavedMicroCents),
      routingOnly: money(sim.attribution.routingOnlySavedMicroCents),
      combined: money(sim.attribution.combinedSavedMicroCents),
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
