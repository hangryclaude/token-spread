/* Types for savings.js, which stays plain JavaScript because the site has no build step and
   the browser loads it directly. Without this, `bunx tsc --noEmit` fails the whole repo on
   TS7016 the moment a test imports the model. */

export declare const CEIL: number;

export interface SavingsInput {
  /** Monthly Anthropic spend, US dollars. */
  spend: number;
  /** Current cache-hit rate, 0-100. */
  hit: number;
  /** Share of the bill that is input tokens, 0-100. */
  inputShare: number;
  /** Share of traffic that could run on the batch API, 0-100. */
  batchable: number;
  /** Share of requests that are duplicates, 0-100. */
  dupRate: number;
}

export interface SavingsResult {
  spend: number;
  /** Each lever's contribution, after everything before it has already been taken. */
  cache: number;
  batch: number;
  dedup: number;
  saved: number;
  final: number;
  /** Saved as a percentage of spend; 0 when spend is 0 rather than NaN. */
  pct: number;
}

export declare function modelSavings(input: SavingsInput): SavingsResult;

export declare function tierFor(spend: number): { name: string; fee: number };

export declare function usd(n: number): string;
