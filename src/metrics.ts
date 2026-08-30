import { costOfEvent } from "./pricing";
import type { RateCard } from "./rates";
import type { UsageEvent } from "./types";

export interface Totals {
  events: number;
  microCents: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
  outputTokens: number;
}

/** One (model, service tier) cell of the priced traffic. */
export interface ModelTierTotals {
  model: string;
  tier: UsageEvent["serviceTier"];
  totals: Totals;
}

export interface Metrics {
  overall: Totals;
  byModel: Record<string, Totals>;
  byProject: Record<string, Totals>;
  /** Slice 2 budgets per account; the axis has to exist before the ledger does. */
  byAccount: Record<string, Totals>;
  /**
   * The same traffic split by (model, tier), because byModel merges tiers and a merged
   * bundle cannot be re-priced: batch bills every token class at 0.5x, so any simulation
   * that re-prices a merged bundle at one tier invents money in whichever direction the
   * mix leans. Sorted by model then tier so downstream output is order-independent.
   */
  byModelTier: ModelTierTotals[];
  /** cacheRead / (cacheRead + freshInput). Cache *writes* are excluded from the denominator. */
  cacheHitRate: number;
  /**
   * Priced spend per UTC day (`event.ts.slice(0, 10)`), in micro-cents. Computed in the same
   * pass as every other total, because the spend-anomaly detector needs exactly this and
   * pricing every event a second time to get it would double the cost of a call that is
   * already `costOfEvent` run once per event.
   */
  byDay: Record<string, number>;
  skipped: { unknown_model: number; malformed: number; unknown_tier: number };
  /** Sorted, deduped model ids absent from the rate card — a count alone is not actionable. */
  unknownModels: string[];
  /**
   * Sorted, deduped `UsageEvent.source` values actually priced into this report. The HTML
   * renderer used to GUESS the source from whether byProject was populated — which it always
   * is — so every local-transcript audit labelled itself `admin_usage_report`. A provenance
   * fact belongs in the type, computed once from the events, not inferred from a neighbour.
   */
  sources: string[];
}

const empty = (): Totals => ({
  events: 0, microCents: 0, inputTokens: 0,
  cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0,
  cacheCreation5mTokens: 0, cacheCreation1hTokens: 0,
});

function add(t: Totals, e: UsageEvent, microCents: number): void {
  t.events++;
  t.microCents += microCents;
  t.inputTokens += e.inputTokens;
  t.cacheReadTokens += e.cacheReadTokens;
  t.cacheCreationTokens += e.cacheCreationTokens;
  t.cacheCreation5mTokens += e.cacheCreation5mTokens;
  t.cacheCreation1hTokens += e.cacheCreation1hTokens;
  t.outputTokens += e.outputTokens;
}

export function computeMetrics(events: UsageEvent[], card: RateCard): Metrics {
  const overall = empty();
  const byModel: Record<string, Totals> = {};
  const byProject: Record<string, Totals> = {};
  const byAccount: Record<string, Totals> = {};
  const byModelTier = new Map<string, ModelTierTotals>();
  const byDay: Record<string, number> = {};
  const skipped = { unknown_model: 0, malformed: 0, unknown_tier: 0 };
  const unknown = new Set<string>();
  const sources = new Set<string>();

  for (const e of events) {
    const priced = costOfEvent(e, card);
    if (!priced.ok) {
      skipped[priced.reason]++;
      if (priced.reason === "unknown_model") unknown.add(e.model);
      continue;
    }
    sources.add(e.source);
    const day = e.ts.slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + priced.microCents;

    byModel[e.model] ??= empty();
    byProject[e.projectId] ??= empty();
    byAccount[e.accountId] ??= empty();
    // \u0000 cannot appear in a model id or tier name, so the key cannot collide.
    const tierKey = `${e.model}\u0000${e.serviceTier ?? ""}`;
    let cell = byModelTier.get(tierKey);
    if (!cell) byModelTier.set(tierKey, cell = { model: e.model, tier: e.serviceTier, totals: empty() });
    add(overall, e, priced.microCents);
    add(byModel[e.model], e, priced.microCents);
    add(byProject[e.projectId], e, priced.microCents);
    add(byAccount[e.accountId], e, priced.microCents);
    add(cell.totals, e, priced.microCents);
  }

  const eligible = overall.cacheReadTokens + overall.inputTokens;
  const cacheHitRate = eligible === 0 ? 0 : overall.cacheReadTokens / eligible;

  return {
    overall, byModel, byProject, byAccount, cacheHitRate, byDay, skipped,
    byModelTier: [...byModelTier.values()].sort(
      (a, b) => a.model.localeCompare(b.model) || String(a.tier).localeCompare(String(b.tier)),
    ),
    unknownModels: [...unknown].sort(),
    sources: [...sources].sort(),
  };
}

/**
 * Cache-write volume as an integer percent of cache-eligible input, rounded half-up.
 * `null` when there is no eligible input to divide by — the caller must then fall back
 * to an operator-set figure rather than pretend 0% was measured.
 */
export function measuredCacheWriteOverheadPct(metrics: Metrics): number | null {
  const eligible = metrics.overall.cacheReadTokens + metrics.overall.inputTokens;
  if (eligible === 0) return null;
  return Math.floor((metrics.overall.cacheCreationTokens / eligible) * 100 + 0.5);
}
