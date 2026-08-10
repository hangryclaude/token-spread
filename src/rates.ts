/** All rates are integer micro-cents (1e-6 cent) per token. */
export interface ModelRate {
  input: number;
  output: number;
  cacheRead: number;
  /**
   * Five-minute TTL write: 1.25x base input.
   *
   * Named for its TTL on purpose. A single unqualified `cacheWrite` is what let every
   * one-hour write — 100% of real traffic, measured 2026-08-11 — bill at 2x while being
   * priced at 1.25x.
   */
  cacheWrite: number;
  /** One-hour TTL write: 2x base input. */
  cacheWrite1h: number;
}

export interface RateCard {
  capturedAt: string;
  rates: Readonly<Record<string, ModelRate>>;
  notes: readonly string[];
  /**
   * Dates on which a rate in this card is known to change, as `YYYY-MM-DD`. A card is a
   * snapshot of the prices in force on `capturedAt`; these are the days that snapshot
   * stops being true, independent of how old it is. The report warns on them, because a
   * card can be two days old and already wrong.
   */
  lapses?: readonly { on: string; what: string }[];
}

// $D per MTok == D * 100 micro-cents per token.
// cacheRead = 0.10x input, cacheWrite (5m) = 1.25x, cacheWrite1h = 2x — see tests.
export const RATE_CARD_2026_08_08: RateCard = {
  capturedAt: "2026-08-08",
  rates: {
    "claude-opus-5":    { input: 500, output: 2500, cacheRead: 50, cacheWrite: 625, cacheWrite1h: 1000 },
    "claude-opus-4-8":  { input: 500, output: 2500, cacheRead: 50, cacheWrite: 625, cacheWrite1h: 1000 },
    // Introductory pricing, in force on this card's capture date. It becomes
    // 300/1500/30/375 on 2026-09-01 — see `lapses`. Carrying the post-lapse rate here
    // (as this card did until 2026-08-11) over-states Sonnet 5 cost by 50% and therefore
    // over-states every saving measured against it.
    "claude-sonnet-5":  { input: 200, output: 1000, cacheRead: 20, cacheWrite: 250, cacheWrite1h: 400 },
    "claude-haiku-4-5": { input: 100, output:  500, cacheRead: 10, cacheWrite: 125, cacheWrite1h: 200 },
    // Transcripts carry the dated Haiku id, not the alias. Same model, same price —
    // without this entry every Haiku event is silently dropped as unknown_model.
    "claude-haiku-4-5-20251001": { input: 100, output: 500, cacheRead: 10, cacheWrite: 125, cacheWrite1h: 200 },
  },
  notes: [
    "claude-sonnet-5 is priced at its introductory $2/$10 per MTok, in force through 2026-08-31.",
    "claude-haiku-4-5-20251001 is the dated id for claude-haiku-4-5; both are priced identically.",
  ],
  lapses: [
    { on: "2026-09-01", what: "claude-sonnet-5 rises from $2/$10 to $3/$15 per MTok (a 50% increase)" },
  ],
};

/**
 * Lapses that have already passed, or fall within `withinDays`, as of `asOf`.
 * A lapsed rate is not a staleness problem — the card can be brand new and still wrong
 * the day after a scheduled price change — so this is reported separately from age.
 */
export function lapsesDue(card: RateCard, asOf: Date, withinDays = 30): { on: string; what: string; daysAway: number }[] {
  return (card.lapses ?? [])
    .map((l) => ({ ...l, daysAway: Math.floor((Date.parse(l.on + "T00:00:00Z") - asOf.getTime()) / 86_400_000) }))
    .filter((l) => l.daysAway <= withinDays)
    .sort((a, b) => a.daysAway - b.daysAway);
}

/** Days between the card's capture date and `asOf`. Used for the staleness warning. */
export function cardAgeDays(card: RateCard, asOf: Date): number {
  const captured = Date.parse(card.capturedAt + "T00:00:00Z");
  return Math.floor((asOf.getTime() - captured) / 86_400_000);
}

// Readonly<> is erased at runtime, so freeze the card: a mutated rate would silently
// change every figure in every report with nothing to show for it in the provenance.
Object.freeze(RATE_CARD_2026_08_08);
Object.freeze(RATE_CARD_2026_08_08.rates);
for (const r of Object.values(RATE_CARD_2026_08_08.rates)) Object.freeze(r);
Object.freeze(RATE_CARD_2026_08_08.lapses);
for (const l of RATE_CARD_2026_08_08.lapses ?? []) Object.freeze(l);
