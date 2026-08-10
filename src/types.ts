/** Billing tiers the usage report can report. */
export type ServiceTier =
  | "standard" | "batch" | "flex" | "flex_discount" | "priority" | "priority_on_demand";

/** A single metered API interaction. Carries no prompt or response content, by design. */
export interface UsageEvent {
  /** Dedup key in slice 1; ledger primary key in slice 2. */
  idempotencyKey: string;

  /** Billing entity. Slice 1 fills this with a constant. */
  accountId: string;
  /** Cost centre. Slice 1 derives this from the transcript directory name. */
  projectId: string;

  ts: string;
  /**
   * The provider/harness session this request belongs to. Needed because cache lifetime
   * is a property of a conversation, not of the clock: the gap that decides whether a
   * five-minute TTL would have sufficed is the gap to the next request in the SAME
   * session. Another session's traffic does not refresh this prefix.
   */
  sessionId: string | null;
  source: "claude_code" | "admin_usage_report";
  /**
   * The billing tier the request actually ran on. Batch bills at half; the other tiers
   * have no published multiplier, so `costOfEvent` refuses them rather than guessing.
   * `null` where the source does not report it — transcripts do, aggregates always do.
   */
  serviceTier: ServiceTier | null;
  model: string;

  /**
   * Billed totals, not the top-level `usage` fields. Where a response carries
   * `usage.iterations` these are the sum across every iteration — see
   * `importClaudeCodeJsonl` for why reading the top level under-reports.
   */
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;

  /**
   * The cache-write total split by TTL, because the two bill at different rates:
   * 5-minute at 1.25x base input, one-hour at 2x. They must sum to
   * `cacheCreationTokens` — `costOfEvent` rejects the event as malformed if they do not,
   * rather than guessing which figure to believe.
   *
   * Sources that do not report the split put the whole total in the 5-minute bucket,
   * which is the cheaper of the two; the importer counts those in
   * `provenance.unknownTtlWrites` so the report can say the cost is a floor, not a fact.
   */
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;

  /**
   * The share of the totals above that came from compaction sampling steps rather
   * than from the message itself. Zero for every request that did not compact.
   * Broken out so the report can name the gap between what a dashboard reading
   * `usage.input_tokens` shows and what the invoice charges.
   */
  compactionInputTokens: number;
  compactionOutputTokens: number;
}

export const USAGE_EVENT_KEYS = [
  "idempotencyKey", "accountId", "projectId", "ts", "sessionId", "source", "serviceTier", "model",
  "inputTokens", "cacheReadTokens", "cacheCreationTokens", "outputTokens",
  "cacheCreation5mTokens", "cacheCreation1hTokens",
  "compactionInputTokens", "compactionOutputTokens",
] as const;
