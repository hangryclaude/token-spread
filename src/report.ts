import { isProvable, shipsByDefault } from "./evidence";
import type { ImportProvenance } from "./importers/claudeCode";
import { measuredCacheWriteOverheadPct, type Metrics } from "./metrics";
import { formatCents, microCentsToCents } from "./pricing";
import { cardAgeDays, lapsesDue, type RateCard } from "./rates";
import type { TtlRightSizingFinding } from "./detect/ttlRightSizing";
import type { TtlCrossingFinding } from "./detect/ttlCrossing";
import { MIN_HISTORY_DAYS, type SpendAnomalyFinding } from "./detect/spendAnomaly";
import { COVERAGE, type CoverageRow } from "./coverage";
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
  /**
   * The `UsageEvent.source` values actually priced in, verbatim from metrics. The HTML document
   * prints this as its provenance line; until 2026-08-12 the renderer inferred it from whether
   * byProject was populated — always — so every local-transcript audit stamped itself
   * `admin_usage_report`. A buyer-facing provenance claim is a fact, and facts ride the type.
   */
  dataSources: string[];
  currentCost: Money;
  cacheHitRate: number;
  byModel: Record<string, Money>;
  byProject: Record<string, Money>;
  byAccount: Record<string, Money>;
  /**
   * Spend by service tier, `unspecified` for events that carried none. The axis the batch
   * lever prices against — a bill that cannot say how much of it runs standard cannot say
   * what a batch migration is worth. Register exposure, not a saving (ids 76, 86, 123).
   */
  byTier: Record<string, Money>;
  tokens: TokenTotals;
  /** `combined` is cache headroom alone; `allMeasured` includes every priced finding. */
  savings: { cacheOnly: Money; wasteOnly: Unquantified; combined: Money; allMeasured: Money };
  savingsPct: SavingsPct;
  /** Blended cost per million tokens, before and after the measured levers. */
  effectiveRatePerMTok: { before: Money; after: Money };
  cacheHeadroom: { targetCacheHitPct: number; cost: Money; saved: Money } | null;
  /**
   * The opt-in contractual lever, present only when the operator set a batch share.
   * `saved` is the step down from the post-cache cost — levers compound, never add — and
   * the figure stays out of `savings` entirely: that block is measured levers only, and
   * the batch discount is the provider's published price, not a measurement.
   */
  batchTier: { targetSharePct: number; cost: Money; saved: Money } | null;
  /** Measured levers that are not cache-hit headroom. */
  findings: Array<{
    lever: string;
    evidence: string;
    /**
     * `isProvable(evidence)` — true when the claim can be demonstrated without trusting a
     * provider's prose (a hash-verified replay, or nothing on the wire changing at all),
     * false when it rests on a documented promise instead. Carried onto the finding rather
     * than left implicit in the tag: `evidence.ts`'s own docstring calls this the load-bearing
     * distinction, and a buyer reading `PASS_METADATA` off a badge should not have to know the
     * evidence hierarchy by heart to learn it is one of the classes we take on faith.
     */
    provable: boolean;
    saved: Money;
    detail: string;
  }>;
  assumptions: AssumptionNote[];
  provenance: ImportProvenance & { skipped: Metrics["skipped"] };
  /** Kept on the report so a rendered document can state exposure it cannot price. */
  ttlRightSizing: TtlRightSizingFinding;
  ttlCrossing: TtlCrossingFinding;
  spendAnomaly: SpendAnomalyFinding;
  /** The register-backed coverage table — what was modeled, detected, exposed, or is invisible. */
  coverage: readonly CoverageRow[];
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
  ttlCrossing: TtlCrossingFinding;
  spendAnomaly: SpendAnomalyFinding;
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
      `${group(provenance.unknownTtlWrites)} cache-write tokens came with no TTL — ` +
      `billed here at the 5-minute rate (1.25x); if they were 1-hour writes (2x) the real cost is higher`,
    );
  }
  if (provenance.imported > 0 && provenance.thinkingDetailRecords === 0) {
    // Not a caveat about the total — extended thinking bills as output either way, so the dollar
    // figure is right. What the source cannot answer is how much of that output was thinking, and
    // on reasoning-heavy traffic that is the question worth asking. Said out loud rather than left
    // as an absence the reader has to notice.
    // "imported", not "priced" — the two differ whenever pricing skips events, and this warning
    // once said "1 priced records" beside a summary reading "0 priced events".
    warnings.push(
      `none of the ${group(provenance.imported)} imported records carried ` +
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
      `${group(hidden)} tokens that the top-level usage fields do not report — ` +
      `this report counts them, a dashboard reading usage.input_tokens does not`,
    );
  }
  if (metrics.skipped.unknown_model > 0) {
    warnings.push(
      `${metrics.skipped.unknown_model} events used a model absent from the rate card and were excluded: ` +
      metrics.unknownModels.join(", "),
    );
  }
  /* Three skip reasons exist and only unknown_model warned, which left the other two SILENT: a
     customer entirely on the priority tier imported cleanly, priced nothing, and got a confident
     "$0.00 across 0 priced events" with an empty warnings array. Found by an adversarial review
     on 2026-08-12 and reproduced before fixing. Every reason an event leaves the report now has
     a voice, because an exclusion the reader cannot see is indistinguishable from spend that
     does not exist. */
  if (metrics.skipped.unknown_tier > 0) {
    warnings.push(
      `${metrics.skipped.unknown_tier} events used a service tier this card cannot price ` +
      `(priority/flex have no published multiplier) and were excluded — the real total is higher`,
    );
  }
  if (metrics.skipped.malformed > 0) {
    warnings.push(
      `${metrics.skipped.malformed} events imported but failed pricing (inconsistent token ` +
      `fields) and were excluded — the real total is higher`,
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
  // A check that could not run must say so — an absent warning otherwise reads as
  // "checked and clean", which is the most expensive kind of wrong.
  if (ttl.skippedUnknownModel > 0) {
    // Computed and then dropped is the same failure mode as the metrics.skipped block
    // above: skippedUnknownModel narrows the recoverable figure without saying so unless
    // this fires. It is a different, smaller count than metrics.skipped.unknown_model —
    // only the writes that were otherwise eligible for TTL right-sizing.
    const n = ttl.skippedUnknownModel;
    warnings.push(
      `${n} cache-write ${n === 1 ? "event" : "events"} eligible for TTL right-sizing used a model absent ` +
      `from the rate card and ${n === 1 ? "was" : "were"} excluded from that figure — the real recoverable ` +
      `amount is higher`,
    );
  }
  if (!input.ttlCrossing.computable) {
    warnings.push(
      `this source carries no sessions, so the 1-hour to 5-minute billing-crossing check ` +
      `(register id 184) could not run on it — not checked here is not the same as checked and clean`,
    );
  }
  if (!input.spendAnomaly.computable) {
    warnings.push(
      `only ${input.spendAnomaly.days} day${input.spendAnomaly.days === 1 ? "" : "s"} of priced history — ` +
      `day-spike screening needs ${MIN_HISTORY_DAYS}, so the spend-anomaly check did not run`,
    );
  }
  if (input.spendAnomaly.skippedUnpriceable > 0) {
    // Same shape as the ttl warning above: skippedUnpriceable was computed into the
    // finding and then never spoken — a day the check flags could be a floor, and a
    // quiet day could be hiding spend the check never saw.
    const n = input.spendAnomaly.skippedUnpriceable;
    warnings.push(
      `${n} event${n === 1 ? "" : "s"} could not be priced and ${n === 1 ? "was" : "were"} excluded from the ` +
      `day-by-day totals the spend-anomaly check reads — a flagged day's real total could be higher than shown, ` +
      `and a quiet day could be hiding one`,
    );
  }
  {
    // Money already spent is not recoverable, so an anomaly is dated and dollared, never
    // priced. Capped at three lines: a report is not a pager.
    const an = input.spendAnomaly.anomalies;
    for (const a of an.slice(0, 3)) {
      warnings.push(
        `spend anomaly: ${formatCents(microCentsToCents(a.microCents))} on ${a.day} against a ` +
        `trailing-median ${formatCents(microCentsToCents(a.trailingMedianMicroCents))} — more than 3x. ` +
        `Budget caps and alerts change nothing on the wire (register ids 126, 127); this is a warning, not a saving.`,
      );
    }
    if (an.length > 3) warnings.push(`…and ${an.length - 3} more anomalous days like the above`);
  }
  if (input.ttlCrossing.flippedSessions > 0) {
    const n = input.ttlCrossing.flippedSessions;
    warnings.push(
      `${n} ${n === 1 ? "session" : "sessions"} flipped from 1-hour to 5-minute cache writes mid-session — ` +
      `the signature of crossing from subscription into usage-credit billing. ` +
      `${group(input.ttlCrossing.affectedWriteTokens)} write tokens landed on the 5-minute TTL after the flip, ` +
      `where every pause longer than five minutes re-bills the full context. ` +
      `ENABLE_PROMPT_CACHING_1H=1 restores the 1-hour TTL (register id 184). A signature, not a proof — stated as exposure, never priced.`,
    );
  }
  // Keyed to the traffic, not to the priced result: a tiny standard spend can floor the
  // saving to $0 micro-cents, and blaming that on absent standard traffic would be a lie.
  const movableExists = metrics.byModelTier.some((c) => c.tier === null || c.tier === "standard");
  if (sim.batchTier && sim.batchTier.targetSharePct > 0 && !movableExists) {
    warnings.push(
      `a batch share of ${sim.batchTier.targetSharePct}% is set but there is no standard-tier traffic to move — ` +
      `traffic already on the batch tier has no discount left`,
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
      `Cache-write TTL: ${group(ttl.exposedTokens)} tokens were written at the 1-hour TTL (2x base input vs 1.25x at 5 minutes). Whether 5 minutes would have served cannot be answered from an aggregate usage report — it needs the gap between consecutive turns in a session. Exposure, not a saving.`,
    ] : []),
    ...(ttl.recoverableMicroCents > 0 ? [
      `Cache-write TTL right-sizing: ${formatCents(microCentsToCents(ttl.recoverableMicroCents))} — ${pct1(ttl.recoverableMicroCents, baseline)}% of the bill. ${group(ttl.overBoughtTokens)} tokens bought a 1-hour TTL at 2x base input and were re-read inside 5 minutes, where 1.25x would have served. ttl is metadata the model never reads: same prompt, same model, same output.`,
    ] : []),
    `Percent of cost saved: cache-only ${pct1(sim.attribution.cacheOnlySavedMicroCents, baseline)}%, all measured levers ${pct1(sim.attribution.combinedSavedMicroCents, baseline)}%.`,
    ...(sim.batchTier ? [
      // Named as what it is: the provider's contractual price, opted into by the operator,
      // and excluded from every measured figure so nobody can add it to them by accident.
      `Batch tier (opt-in, contractual — the 50% is the provider's published price; identity across the async boundary is the provider's word): moving ${sim.batchTier.targetSharePct}% of standard-tier traffic to the Message Batches API would save a further ${formatCents(microCentsToCents(sim.batchTier.savedMicroCents))} on top of the measured levers. Excluded from every measured figure above.`,
    ] : []),
    `Blended rate: ${formatCents(microCentsToCents(ratePerMTok(baseline, totalTokens)))} per MTok today → ${formatCents(microCentsToCents(ratePerMTok(baseline - sim.attribution.combinedSavedMicroCents, totalTokens)))} per MTok under the measured levers.`,
    `Rate card captured ${card.capturedAt}. ${card.notes.join(" ")}`,
  ].join("\n");

  const findings = ttl.recoverableMicroCents > 0 ? [{
    lever: "cache-write TTL right-sizing",
    evidence: ttl.evidence,
    provable: isProvable(ttl.evidence),
    saved: money(ttl.recoverableMicroCents),
    detail:
      `${group(ttl.overBoughtTokens)} tokens were written at the 1-hour TTL (2x base input) ` +
      `and re-read within 5 minutes, where the 5-minute TTL (1.25x) would have served. ` +
      `ttl is metadata the model never reads: same prompt, same model, same output.` +
      (ttl.neverReReadTokens > 0
        ? ` A further ${group(ttl.neverReReadTokens)} 1-hour tokens were never re-read at all — that is waste, a separate lever, and is not counted here.`
        : ""),
  }] : [];
  // `CONTRACTUAL_ONLY` evidence must never reach a finding that ships unconditionally — that
  // is the whole rule `shipsByDefault` states. No detector emits that class into `findings`
  // today (the one CONTRACTUAL_ONLY lever, batch tier, is a separate opt-in field, gated by
  // the operator setting `--batch-share`), so this can only fire if a future one tries to.
  // Thrown here rather than filtered silently: a dropped finding is the exact failure mode
  // this report exists to refuse elsewhere, and it should not become the exception for this.
  for (const f of findings) {
    if (!shipsByDefault(f.evidence)) {
      throw new Error(`finding "${f.lever}" carries ${f.evidence} evidence and cannot ship by default`);
    }
  }

  return {
    generatedAt: generatedAt.toISOString(),
    rateCard: card,
    dataSources: metrics.sources,
    currentCost: money(metrics.overall.microCents),
    cacheHitRate: metrics.cacheHitRate,
    byModel: mapMoney(metrics.byModel),
    byProject: mapMoney(metrics.byProject),
    byAccount: mapMoney(metrics.byAccount),
    byTier: mapMoney(
      metrics.byModelTier.reduce<Record<string, { microCents: number }>>((acc, { tier, totals }) => {
        const key = tier ?? "unspecified";
        acc[key] = { microCents: (acc[key]?.microCents ?? 0) + totals.microCents };
        return acc;
      }, {}),
    ),
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
      /**
       * Every measured lever, not just the cache one.
       *
       * The audit document leads with a figure labelled "Recoverable" and it was fed
       * `combined` — which is cache headroom ALONE. On a machine already at a 100% hit rate
       * that tile read "$0.00, 0% of the bill" directly above a finding worth $374.93. The
       * first number a buyer reads contradicted the body of the same page.
       *
       * These two levers COMPOUND — they are not a plain sum. The earlier claim here, that
       * cache headroom touches only fresh input while TTL right-sizing touches only cache
       * writes, was false: the headroom simulation replaces the observed write volume with
       * a synthetic one, so it also removes cache-write cost — and adding the full TTL
       * premium back on top could put "Recoverable" above 100% of the bill (found
       * 2026-08-21 by an adversarial review pass; the register's own rule is that levers
       * multiply and a sum overstates). So the TTL premium is scaled, per model, by the
       * share of one-hour write volume the simulated regime actually keeps — a premium
       * cannot be recovered on a write the simulation already removed.
       *
       * The headline is the better of the two provable roadmaps: (target cache regime +
       * TTL right-sizing on the writes that survive it) or (keep traffic as-is and only
       * right-size the TTLs). Both are real offers; printing the larger one never
       * overstates either. tests/recoverable.test.ts pins the arithmetic, the bill
       * ceiling, and the headline-vs-finding ordering.
       */
      allMeasured: money(Math.max(
        sim.attribution.combinedSavedMicroCents + Object.entries(ttl.recoverableMicroCentsByModel).reduce(
          (s, [model, mc]) => s + Math.round(Math.max(0, mc) * (sim.attribution.surviving1hWriteRatioByModel[model] ?? 1)), 0),
        Math.max(0, ttl.recoverableMicroCents),
      )),
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
    batchTier: sim.batchTier && {
      targetSharePct: sim.batchTier.targetSharePct,
      cost: money(sim.batchTier.microCents),
      saved: money(sim.batchTier.savedMicroCents),
    },
    findings,
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
      ...(sim.batchTier ? [{
        name: "batchShareTarget", value: `${sim.batchTier.targetSharePct}%`, kind: "operator_set" as const,
        note: "share of standard-tier traffic asserted to tolerate async batch processing; the 50% is the provider's published price, not a measurement",
      }] : []),
      { name: "rateCard", value: card.capturedAt, kind: "operator_set",
        note: "list prices, refreshed by hand" },
    ],
    provenance: { ...provenance, skipped: metrics.skipped },
    ttlRightSizing: ttl,
    ttlCrossing: input.ttlCrossing,
    spendAnomaly: input.spendAnomaly,
    coverage: COVERAGE,
    warnings,
    humanSummary,
  };
}
