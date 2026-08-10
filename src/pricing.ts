import type { RateCard } from "./rates";
import type { UsageEvent } from "./types";

export type Priced   = { ok: true;  microCents: number };
export type Unpriced = { ok: false; reason: "unknown_model" | "malformed" | "unknown_tier" };
export type PriceResult = Priced | Unpriced;

/**
 * The single pricing function. Slice 2's ledger imports this unchanged — if the
 * report and the invoice ever disagree, the product is dead. Total: never throws.
 */
/**
 * Tier multipliers, applied to every token category.
 *
 * Batch is the only one with a published number: "a 50% discount on both input and output
 * tokens". flex, flex_discount, priority and priority_on_demand have no public multiplier,
 * so they are refused rather than assumed to be standard — a batch-heavy or priority-heavy
 * org priced at standard rates is wrong by a factor, silently, in whichever direction
 * happens to flatter the report.
 */
const TIER_MULTIPLIER: Partial<Record<NonNullable<UsageEvent["serviceTier"]>, number>> = {
  standard: 1,
  batch: 0.5,
};

export function costOfEvent(e: UsageEvent, card: RateCard): PriceResult {
  const rate = card.rates[e.model];
  if (!rate) return { ok: false, reason: "unknown_model" };

  const tier = e.serviceTier === null ? 1 : TIER_MULTIPLIER[e.serviceTier];
  if (tier === undefined) return { ok: false, reason: "unknown_tier" };

  const counts = [
    e.inputTokens, e.cacheReadTokens, e.cacheCreationTokens, e.outputTokens,
    e.cacheCreation5mTokens, e.cacheCreation1hTokens,
  ];
  if (counts.some((t) => !Number.isInteger(t) || t < 0)) {
    return { ok: false, reason: "malformed" };
  }

  // The TTL split is the price, not a detail: 1.25x for five minutes, 2x for an hour.
  // If it disagrees with the total, one of the two is wrong and there is no honest way
  // to pick — refuse rather than quietly charge the cheaper reading.
  if (e.cacheCreation5mTokens + e.cacheCreation1hTokens !== e.cacheCreationTokens) {
    return { ok: false, reason: "malformed" };
  }

  const gross =
      e.inputTokens * rate.input +
      e.cacheReadTokens * rate.cacheRead +
      e.cacheCreation5mTokens * rate.cacheWrite +
      e.cacheCreation1hTokens * rate.cacheWrite1h +
      e.outputTokens * rate.output;

  // Integer micro-cents throughout: floor once, at the end, never per category.
  return { ok: true, microCents: Math.floor(gross * tier) };
}

/** Half-up. Call this once, at the report boundary — never per event. */
export function microCentsToCents(microCents: number): number {
  return Math.floor(microCents / 1_000_000 + 0.5);
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
