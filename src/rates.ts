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
    // $2/$10, and no longer introductory — see the 2026-08-12 note below. Carrying the
    // once-scheduled $3/$15 here (as this card did until 2026-08-11) over-states Sonnet 5
    // cost by 50% and therefore over-states every saving measured against it.
    "claude-sonnet-5":  { input: 200, output: 1000, cacheRead: 20, cacheWrite: 250, cacheWrite1h: 400 },
    // $10/$50, read from the pricing page 2026-08-12 and added the same day — the first
    // fable-5 events appeared in this machine's transcripts that morning (15 of them, all
    // dropped as unknown_model until this entry). Cache read $1, 5m write $12.50, 1h $20:
    // the standard 0.1x / 1.25x / 2x ladder at a base of $10.
    "claude-fable-5":   { input: 1000, output: 5000, cacheRead: 100, cacheWrite: 1250, cacheWrite1h: 2000 },
    "claude-haiku-4-5": { input: 100, output:  500, cacheRead: 10, cacheWrite: 125, cacheWrite1h: 200 },
    // Transcripts carry the dated Haiku id, not the alias. Same model, same price —
    // without this entry every Haiku event is silently dropped as unknown_model.
    "claude-haiku-4-5-20251001": { input: 100, output: 500, cacheRead: 10, cacheWrite: 125, cacheWrite1h: 200 },
  },
  notes: [
    "claude-sonnet-5 is priced at $2/$10 per MTok. Announced as introductory pricing through 2026-08-31, this is now the standard price (corrected 2026-08-12).",
    "claude-fable-5 ($10/$50) was added 2026-08-12 from the pricing page read that day; the card's other rates were captured 2026-08-08 and are unchanged.",
    "claude-haiku-4-5-20251001 is the dated id for claude-haiku-4-5; both are priced identically.",
  ],
  /*
   * Empty, and deliberately so — the entry that was here has been CANCELLED, not merely served.
   *
   * Until 2026-08-12 this card carried `{ on: "2026-09-01", what: "claude-sonnet-5 rises from
   * $2/$10 to $3/$15 per MTok (a 50% increase)" }`, so every run printed a warning that the
   * reader's Sonnet 5 costs were about to rise by half. Anthropic's pricing page now says:
   *
   *   "The $2/$10 per million input/output token pricing for Claude Sonnet 5, announced at
   *    launch as introductory pricing through August 31, 2026, is now the standard price. The
   *    previously scheduled increase to $3/$15 per million input/output tokens on September 1,
   *    2026 will not occur."
   *   — https://platform.claude.com/docs/en/about-claude/pricing, read 2026-08-12
   *
   * The rates themselves never moved, so capturedAt still honestly describes when they were
   * taken. What changed is a future event that is no longer going to happen. A cancelled lapse
   * is the failure mode this field cannot see on its own: `lapsesDue` correctly reports a lapse
   * that has passed, and has no way to know one was called off. Only re-reading the source finds
   * it, which is why the note above carries a date.
   */
  lapses: [],
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
