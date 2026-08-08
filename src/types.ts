/** A single metered API interaction. Carries no prompt or response content, by design. */
export interface UsageEvent {
  /** Dedup key in slice 1; ledger primary key in slice 2. */
  idempotencyKey: string;

  /** Billing entity. Slice 1 fills this with a constant. */
  accountId: string;
  /** Cost centre. Slice 1 derives this from the transcript directory name. */
  projectId: string;

  ts: string;
  source: "claude_code" | "admin_usage_report";
  model: string;

  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
}

export const USAGE_EVENT_KEYS = [
  "idempotencyKey", "accountId", "projectId", "ts", "source", "model",
  "inputTokens", "cacheReadTokens", "cacheCreationTokens", "outputTokens",
] as const;
