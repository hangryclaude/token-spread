import type { ImportProvenance } from "./importers/claudeCode";
import { measuredCacheWriteOverheadPct, type Metrics } from "./metrics";
import { formatCents, microCentsToCents } from "./pricing";
import { cardAgeDays, lapsesDue, type RateCard } from "./rates";
import type { TtlRightSizingFinding } from "./detect/ttlRightSizing";
import { DEFAULT_CACHE_WRITE_OVERHEAD_PCT, type Assumptions, type Simulation, type Unquantified } from "./simulate";

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
 * Deliberately not "tokens saved": the lever removes no tokens. Caching moves input
 * tokens from the full rate to the 0.10x read rate. The token count is identical
 * before and after — only the price attached to each token changes. A "tokens saved"
 * figure would be zero, and any non-zero one would be a lie.
 *
 * There is no routing entry here, and there must not be. Routing sends a different
 * model, so a different model answers; that is a changed result sold as a saving.
 */
export interface SavingsPct { cacheOnly: number; combined: number }

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
  savings: { cacheOnly: Money; wasteOnly: Unquantified; combined: Money };
  savingsPct: SavingsPct;
  /** Blended cost per million tokens, before and after the measured levers. */
  effectiveRatePerMTok: { before: Money; after: Money };
  cacheHeadroom: { targetCacheHitPct: number; cost: Money; saved: Money } | null;
  /** Measured levers that are not cache-hit headroom. */
  findings: Array<{
    lever: string;
    evidence: string;
    saved: Money;
    detail: string;
  }>;
  assumptions: AssumptionNote[];
  provenance: ImportProvenance & { skipped: Metrics["skipped"] };
  /** Kept on the report so a rendered document can state exposure it cannot price. */
  ttlRightSizing: TtlRightSizingFinding;
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
  ttlRightSizing: TtlRightSizingFinding;
  card: RateCard;
  generatedAt: Date;
}): Report {
  const { metrics, simulation: sim, assumptions: a, provenance, card, generatedAt } = input;
  const ttl = input.ttlRightSizing;

  const o = metrics.overall;
  const baseline = o.microCents;
  const totalTokens = o.inputTokens + o.cacheReadTokens + o.cacheCreationTokens + o.outputTokens;

  const warnings: string[] = [];
  const age = cardAgeDays(card, generatedAt);
  if (age > STALE_AFTER_DAYS) {
    warnings.push(`rate card is ${age} days old (captured ${card.capturedAt}) — every figure may be wrong`);
  }
  for (const l of lapsesDue(card, generatedAt)) {
    warnings.push(
      l.daysAway < 0
        ? `this card is WRONG as of ${l.on}: ${l.what} — re-capture before quoting any figure`
        : `in ${l.daysAway} days, on ${l.on}: ${l.what}`,
    );
  }
  if (provenance.synthesizedKeys > 0) {
    warnings.push(`${provenance.synthesizedKeys} events had no requestId; dedup for those is best-effort`);
  }
  if (provenance.unknownTtlWrites > 0) {
    // 5m writes bill at 1.25x base input, 1h at 2x. A source that omits the split is
    // billed here at the cheaper rate, so the reported cost is a floor, not a fact.
    warnings.push(
      `${provenance.unknownTtlWrites.toLocaleString("en-US")} cache-write tokens came with no TTL — ` +
      `billed here at the 5-minute rate (1.25x); if they were 1-hour writes (2x) the real cost is higher`,
    );
  }
  if (provenance.imported > 0 && provenance.thinkingDetailRecords === 0) {
    // Not a caveat about the total — extended thinking bills as output either way, so the dollar
    // figure is right. What the source cannot answer is how much of that output was thinking, and
    // on reasoning-heavy traffic that is the question worth asking. Said out loud rather than left
    // as an absence the reader has to notice.
    warnings.push(
      `none of the ${provenance.imported.toLocaleString("en-US")} priced records carried ` +
      `usage.output_tokens_details, so the extended-thinking share of output cannot be separated ` +
      `here — the totals are unaffected, the thinking-vs-answer split is simply not in this source`,
    );
  }
  if (provenance.compactionEvents > 0) {
    // Not a caveat about our numbers — a finding about theirs. Anything reading the
    // top-level usage fields is short by exactly this much on this traffic.
    const hidden = provenance.hiddenInputTokens + provenance.hiddenOutputTokens;
    warnings.push(
      `${provenance.compactionEvents} requests ran a compaction sampling step billing ` +
      `${hidden.toLocaleString("en-US")} tokens that the top-level usage fields do not report — ` +
      `this report counts them, a dashboard reading usage.input_tokens does not`,
    );
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
    // One measured lever, named with the assumption that produces it. Waste is stated
    // as unmeasured rather than as $0, which would read as "we looked and found none".
    `Savings: cache-only ${formatCents(microCentsToCents(sim.attribution.cacheOnlySavedMicroCents))} (raising cache-hit to ${a.targetCacheHitPct ?? 0}%). Waste elimination: not measured in this slice. Levers compound and do not add.`,
    // Percentages are of COST. Neither lever removes a token — they change the price
    // each token bills at, so a "tokens saved" figure would be zero by construction.
    `Tokens: ${group(totalTokens)} priced (${group(o.cacheReadTokens)} cache reads, ${group(o.inputTokens)} fresh input, ${group(o.outputTokens)} output).`,
    ...(!ttl.computable && ttl.exposedTokens > 0 ? [
      `Cache-write TTL: ${ttl.exposedTokens.toLocaleString("en-US")} tokens were written at the 1-hour TTL (2x base input vs 1.25x at 5 minutes). Whether 5 minutes would have served cannot be answered from an aggregate usage report — it needs the gap between consecutive turns in a session. Exposure, not a saving.`,
    ] : []),
    ...(ttl.recoverableMicroCents > 0 ? [
      `Cache-write TTL right-sizing: ${formatCents(microCentsToCents(ttl.recoverableMicroCents))} — ${pct1(ttl.recoverableMicroCents, baseline)}% of the bill. ${ttl.overBoughtTokens.toLocaleString("en-US")} tokens bought a 1-hour TTL at 2x base input and were re-read inside 5 minutes, where 1.25x would have served. ttl is metadata the model never reads: same prompt, same model, same output.`,
    ] : []),
    `Percent of cost saved: cache-only ${pct1(sim.attribution.cacheOnlySavedMicroCents, baseline)}%, all measured levers ${pct1(sim.attribution.combinedSavedMicroCents, baseline)}%.`,
    `Blended rate: ${formatCents(microCentsToCents(ratePerMTok(baseline, totalTokens)))} per MTok today → ${formatCents(microCentsToCents(ratePerMTok(baseline - sim.attribution.combinedSavedMicroCents, totalTokens)))} per MTok under the measured levers.`,
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
      wasteOnly: sim.attribution.wasteOnly,
      combined: money(sim.attribution.combinedSavedMicroCents),
    },
    savingsPct: {
      cacheOnly: pct1(sim.attribution.cacheOnlySavedMicroCents, baseline),
      combined: pct1(sim.attribution.combinedSavedMicroCents, baseline),
    },
    effectiveRatePerMTok: {
      before: money(ratePerMTok(baseline, totalTokens)),
      after: money(ratePerMTok(baseline - sim.attribution.combinedSavedMicroCents, totalTokens)),
    },
    cacheHeadroom: sim.cacheHeadroom && {
      targetCacheHitPct: sim.cacheHeadroom.targetCacheHitPct,
      cost: money(sim.cacheHeadroom.microCents),
      saved: money(sim.cacheHeadroom.savedMicroCents),
    },
    findings: ttl.recoverableMicroCents > 0 ? [{
      lever: "cache-write TTL right-sizing",
      evidence: ttl.evidence,
      saved: money(ttl.recoverableMicroCents),
      detail:
        `${ttl.overBoughtTokens.toLocaleString("en-US")} tokens were written at the 1-hour TTL (2x base input) ` +
        `and re-read within 5 minutes, where the 5-minute TTL (1.25x) would have served. ` +
        `ttl is metadata the model never reads: same prompt, same model, same output.` +
        (ttl.neverReReadTokens > 0
          ? ` A further ${ttl.neverReReadTokens.toLocaleString("en-US")} 1-hour tokens were never re-read at all — that is waste, a separate lever, and is not counted here.`
          : ""),
    }] : [],
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
      { name: "cacheWriteOverhead", value: `${writeOverheadPct}%`, kind: "operator_set",
        note: "writes needed to sustain the simulated hit rate, as a share of cache-eligible input; the observed write volume describes the old regime and cannot be carried over" },
      { name: "rateCard", value: card.capturedAt, kind: "operator_set",
        note: "list prices, refreshed by hand" },
    ],
    provenance: { ...provenance, skipped: metrics.skipped },
    ttlRightSizing: ttl,
    warnings,
    humanSummary,
  };
}
