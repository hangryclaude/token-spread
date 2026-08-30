/**
 * The blind-window holdback (spec §5). The meter lags ~5 min freshness + 1 min poll +
 * one in-flight request before a hard-cap key actually dies, so the balance the member
 * sees must already subtract what they can burn during that blindness. Reserve is
 * priced from observed behavior, not promises — a member with a $2/min peak and a
 * 7-minute window has $14 held back, which is the honest cost of a 5-minute meter
 * (spec §5 table).
 */

import type { LedgerRow } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Truncate an epoch-ms instant to its UTC minute, keyed "YYYY-MM-DDTHH:MM". */
function utcMinuteKey(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 16);
}

export function peakBurnPerMinuteMicroCents(
  rows: readonly LedgerRow[],
  opts: { nowIso: string; lookbackDays: number },
): number {
  const now = Date.parse(opts.nowIso);
  const lowerBound = now - opts.lookbackDays * MS_PER_DAY;

  const perMinute = new Map<string, number>();
  for (const r of rows) {
    if (r.kind !== "usage") continue;
    const ts = Date.parse(r.ts);
    if (Number.isNaN(ts)) continue; // malformed timestamp — ignore rather than throw
    if (ts < lowerBound || ts > now) continue;

    const key = utcMinuteKey(ts);
    // Burn is the consumed side of the delta; usage rows are negative, so burn is the
    // negation. Adjustments never enter here (kind === "usage" only), so this can't
    // legitimately go negative — clamp anyway rather than trust that invariant blindly.
    perMinute.set(key, (perMinute.get(key) ?? 0) - r.deltaMicroCents);
  }

  let peak = 0;
  for (const burn of perMinute.values()) {
    if (burn > peak) peak = burn;
  }
  return peak;
}

export function reserveMicroCents(peakPerMinuteMicroCents: number, exposureWindowMinutes: number): number {
  if (!Number.isInteger(peakPerMinuteMicroCents) || peakPerMinuteMicroCents < 0) {
    throw new Error(`reserveMicroCents: peakPerMinuteMicroCents must be a non-negative integer, got ${peakPerMinuteMicroCents}`);
  }
  if (!Number.isInteger(exposureWindowMinutes) || exposureWindowMinutes < 0) {
    throw new Error(`reserveMicroCents: exposureWindowMinutes must be a non-negative integer, got ${exposureWindowMinutes}`);
  }
  return peakPerMinuteMicroCents * exposureWindowMinutes;
}
