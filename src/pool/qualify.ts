/**
 * The admission gate as an instrument (spec §0): a candidate qualifies when their
 * audited usage, normalized to 30 days, is STRICTLY under half the seat price.
 * The boundary refuses — a gate that admits its own edge case admits everyone who
 * games to the edge. Integer cents throughout; both sides floor, so the candidate's
 * number gets the generous rounding and the threshold gets the strict one.
 */
export interface QualifyVerdict {
  normalized30Cents: number;
  thresholdCents: number;
  qualified: boolean;
}

export function qualifyVerdict(input: {
  reportCents: number;
  days: number;
  seatCents: number;
}): QualifyVerdict {
  const { reportCents, days, seatCents } = input;
  if (!Number.isInteger(reportCents) || reportCents < 0) {
    throw new Error(`reportCents must be a non-negative integer, got ${reportCents}`);
  }
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(`days must be a positive integer, got ${days}`);
  }
  if (!Number.isInteger(seatCents) || seatCents <= 0) {
    throw new Error(`seatCents must be a positive integer, got ${seatCents}`);
  }
  const normalized30Cents = Math.floor((reportCents * 30) / days);
  const thresholdCents = Math.floor(seatCents / 2);
  return { normalized30Cents, thresholdCents, qualified: normalized30Cents < thresholdCents };
}
