import { costOfEvent } from "./pricing";
import type { RateCard } from "./rates";
import type { UsageEvent } from "./types";

export interface Totals {
  events: number;
  microCents: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
}

export interface Metrics {
  overall: Totals;
  byModel: Record<string, Totals>;
  byProject: Record<string, Totals>;
  /** Slice 2 budgets per account; the axis has to exist before the ledger does. */
  byAccount: Record<string, Totals>;
  /** cacheRead / (cacheRead + freshInput). Cache *writes* are excluded from the denominator. */
  cacheHitRate: number;
  skipped: { unknown_model: number; malformed: number };
  /** Sorted, deduped model ids absent from the rate card — a count alone is not actionable. */
  unknownModels: string[];
}

const empty = (): Totals => ({
  events: 0, microCents: 0, inputTokens: 0,
  cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0,
});

function add(t: Totals, e: UsageEvent, microCents: number): void {
  t.events++;
  t.microCents += microCents;
  t.inputTokens += e.inputTokens;
  t.cacheReadTokens += e.cacheReadTokens;
  t.cacheCreationTokens += e.cacheCreationTokens;
  t.outputTokens += e.outputTokens;
}

export function computeMetrics(events: UsageEvent[], card: RateCard): Metrics {
  const overall = empty();
  const byModel: Record<string, Totals> = {};
  const byProject: Record<string, Totals> = {};
  const byAccount: Record<string, Totals> = {};
  const skipped = { unknown_model: 0, malformed: 0 };
  const unknown = new Set<string>();

  for (const e of events) {
    const priced = costOfEvent(e, card);
    if (!priced.ok) {
      skipped[priced.reason]++;
      if (priced.reason === "unknown_model") unknown.add(e.model);
      continue;
    }

    byModel[e.model] ??= empty();
    byProject[e.projectId] ??= empty();
    byAccount[e.accountId] ??= empty();
    add(overall, e, priced.microCents);
    add(byModel[e.model], e, priced.microCents);
    add(byProject[e.projectId], e, priced.microCents);
    add(byAccount[e.accountId], e, priced.microCents);
  }

  const eligible = overall.cacheReadTokens + overall.inputTokens;
  const cacheHitRate = eligible === 0 ? 0 : overall.cacheReadTokens / eligible;

  return {
    overall, byModel, byProject, byAccount, cacheHitRate, skipped,
    unknownModels: [...unknown].sort(),
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
