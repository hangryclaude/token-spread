# Interface Contract — Savings Report (slice 1)

Every task builds against these exact signatures. No task may rename, re-shape, or
re-sign anything here. All internal money is **integer micro-cents (µ¢)**; convert to
cents once, at the report boundary, half-up. No floating point in the pricing path.

```ts
// ── types.ts ──────────────────────────────────────────────────────────
export interface ModelRate {   // µ¢ per token, all integers
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
export interface RateCard {
  capturedAt: string;                    // ISO date, e.g. "2026-08-08"
  rates: Record<string, ModelRate>;      // canonical model id → rate
}
export interface UsageEvent {
  idempotencyKey: string;                // dedup key (slice 1) / ledger PK (slice 2)
  accountId: string;                     // slice 1 default: "local"
  projectId: string;                     // slice 1: transcript dir name
  ts: string;                            // ISO 8601
  source: "claude_code" | "admin_usage_report";
  model: string;                         // canonical id, post-normalisation
  inputTokens: number;                   // non-negative integer
  cacheReadTokens: number;               // non-negative integer
  cacheCreationTokens: number;           // non-negative integer
  outputTokens: number;                  // non-negative integer
}
export interface Provenance {
  eventsSeen: number;
  priced: number;
  skipped: number;                       // unknown model, excluded from cost
  malformed: number;                     // bad/negative/non-int fields
  deduped: number;                       // duplicate idempotencyKey dropped
  synthesizedKeys: number;               // idempotencyKey was synthesized (no requestId)
  byModel: Record<string, number>;       // priced-event count per model
}
export interface ImportResult {
  events: UsageEvent[];
  provenance: Provenance;
}

// ── rates.ts ──────────────────────────────────────────────────────────
export const RATE_CARD: RateCard;        // capturedAt "2026-08-08", integer µ¢ (table below)
export function rateCardAgeDays(card: RateCard, now: Date): number;
export function isStale(card: RateCard, now: Date): boolean;   // age > 30 days

// ── pricing.ts ── THE critical unit; slice 2 reuses verbatim ───────────
export type Priced   = { ok: true;  microCents: number };
export type Unpriced = { ok: false; reason: "unknown_model" | "malformed" };
export function costOfEvent(e: UsageEvent, card: RateCard): Priced | Unpriced;

// ── metrics.ts (pure) ─────────────────────────────────────────────────
export interface CostBreakdown {
  totalMicroCents: number;
  byModel: Record<string, number>;       // µ¢ per model
  byProject: Record<string, number>;     // µ¢ per project
}
export function currentCost(events: UsageEvent[], card: RateCard): CostBreakdown;
export function cacheHitRate(events: UsageEvent[]): number;   // 0..1

// ── simulate.ts (pure, parameterised) ─────────────────────────────────
export interface RoutingPoint {
  fraction: number;
  projectedMicroCents: number;
  savingsMicroCents: number;
}
export function routingCurve(
  events: UsageEvent[], card: RateCard,
  targetModel?: string,                  // default "claude-haiku-4-5"
  fractions?: number[],                  // default [0, .25, .5, .75, 1]
): RoutingPoint[];

export interface CacheHeadroom {
  targetHitRate: number;
  projectedMicroCents: number;
  savingsMicroCents: number;
}
export function cacheHeadroom(events: UsageEvent[], card: RateCard, targetHitRate: number): CacheHeadroom; // throws if targetHitRate < observed

export interface SavingsAttribution {    // all µ¢; compounding, never additive
  baselineMicroCents: number;
  cacheOnly: number;
  routingOnly: number;
  combined: number;                      // the headline; combined < cacheOnly + routingOnly when both active
}
export function attributeSavings(
  events: UsageEvent[], card: RateCard,
  opts: { targetCacheHit: number; routableFraction: number; targetModel?: string },
): SavingsAttribution;

// ── report.ts (pure, deterministic) ───────────────────────────────────
export type AssumptionTag = "measured" | "operator_set";
export interface Report {
  rateCard: { capturedAt: string; stale: boolean; rates: Record<string, ModelRate> };
  cost: { totalCents: number; byModel: Record<string, number>; byProject: Record<string, number> }; // cents at boundary
  cacheHitRate: number;
  routing: RoutingPoint[];
  cacheHeadroom: CacheHeadroom | null;
  savings: SavingsAttribution;
  assumptions: { routableFraction: { value: number; tag: AssumptionTag }; targetCacheHit: { value: number; tag: AssumptionTag } };
  provenance: Provenance;
  humanSummary: string;
}
export function buildReport(
  events: UsageEvent[], provenance: Provenance, card: RateCard,
  opts: { now: Date; targetCacheHit?: number; routableFraction?: number },
): Report;

// ── importers/claudeCode.ts ───────────────────────────────────────────
export function parseClaudeCodeJSONL(text: string, projectId: string): ImportResult;

// ── cli.ts ── the ONLY unit that does I/O ─────────────────────────────
export function analyze(
  inputs: { text: string; projectId: string }[],
  opts: { now: Date; card?: RateCard; targetCacheHit?: number; routableFraction?: number },
): { report: Report; humanText: string };          // pure over strings — testable
export function main(argv: string[]): Promise<void>; // resolves globs, reads files, prints
```

## Rate card values (integer µ¢ per token)

| Model | input | output | cacheRead | cacheWrite |
|---|---|---|---|---|
| `claude-opus-5`    | 500 | 2500 | 50 | 625 |
| `claude-sonnet-5`  | 300 | 1500 | 30 | 375 |
| `claude-haiku-4-5` | 100 |  500 | 10 | 125 |

## Invariants every task honours

- No `Date.now()` / `Math.random()` in `pricing`, `metrics`, `simulate`, `report` — the
  clock is injected via `opts.now`. Only `cli.main` and tests may read the real clock.
- No module-level mutable state, no accumulator global, `accountId` hardcoded only as
  the importer's default argument. (Slice-2 contract, §7.1.)
- `parseClaudeCodeJSONL` reads only the token/model/ts/requestId fields; `message.content`
  is never read into a `UsageEvent`.
- Money: integer µ¢ internally; `Math.round` to cents once, at the report boundary only.
