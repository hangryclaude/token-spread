import type { RateCard } from "./rates";
import type { UsageEvent } from "./types";

export type Priced   = { ok: true;  microCents: number };
export type Unpriced = { ok: false; reason: "unknown_model" | "malformed" };
export type PriceResult = Priced | Unpriced;

/**
 * The single pricing function. Slice 2's ledger imports this unchanged — if the
 * report and the invoice ever disagree, the product is dead. Total: never throws.
 */
export function costOfEvent(e: UsageEvent, card: RateCard): PriceResult {
  const rate = card.rates[e.model];
  if (!rate) return { ok: false, reason: "unknown_model" };

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

  return {
    ok: true,
    microCents:
      e.inputTokens * rate.input +
      e.cacheReadTokens * rate.cacheRead +
      e.cacheCreation5mTokens * rate.cacheWrite +
      e.cacheCreation1hTokens * rate.cacheWrite1h +
      e.outputTokens * rate.output,
  };
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
