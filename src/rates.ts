/** All rates are integer micro-cents (1e-6 cent) per token. */
export interface ModelRate {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface RateCard {
  capturedAt: string;
  rates: Readonly<Record<string, ModelRate>>;
  notes: readonly string[];
}

// $D per MTok == D * 100 micro-cents per token.
// cacheRead = 0.10x input, cacheWrite = 1.25x input — precomputed, see tests.
export const RATE_CARD_2026_08_08: RateCard = {
  capturedAt: "2026-08-08",
  rates: {
    "claude-opus-5":    { input: 500, output: 2500, cacheRead: 50, cacheWrite: 625 },
    "claude-opus-4-8":  { input: 500, output: 2500, cacheRead: 50, cacheWrite: 625 },
    "claude-sonnet-5":  { input: 300, output: 1500, cacheRead: 30, cacheWrite: 375 },
    "claude-haiku-4-5": { input: 100, output:  500, cacheRead: 10, cacheWrite: 125 },
    // Transcripts carry the dated Haiku id, not the alias. Same model, same price —
    // without this entry every Haiku event is silently dropped as unknown_model.
    "claude-haiku-4-5-20251001": { input: 100, output: 500, cacheRead: 10, cacheWrite: 125 },
  },
  notes: [
    "claude-sonnet-5 intro pricing ($2/$10 per MTok) lapses 2026-08-31.",
    "claude-haiku-4-5-20251001 is the dated id for claude-haiku-4-5; both are priced identically.",
  ],
};

/** Days between the card's capture date and `asOf`. Used for the staleness warning. */
export function cardAgeDays(card: RateCard, asOf: Date): number {
  const captured = Date.parse(card.capturedAt + "T00:00:00Z");
  return Math.floor((asOf.getTime() - captured) / 86_400_000);
}
