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

  const counts = [e.inputTokens, e.cacheReadTokens, e.cacheCreationTokens, e.outputTokens];
  if (counts.some((t) => !Number.isInteger(t) || t < 0)) {
    return { ok: false, reason: "malformed" };
  }

  return {
    ok: true,
    microCents:
      e.inputTokens * rate.input +
      e.cacheReadTokens * rate.cacheRead +
      e.cacheCreationTokens * rate.cacheWrite +
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
