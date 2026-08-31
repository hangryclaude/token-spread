import { expect, test } from "bun:test";
import { qualifyVerdict } from "../../src/pool/qualify";

test("normalizes the audited window to 30 days and applies the strict half-seat gate", () => {
  // $13.00 over 26 days → 1300 x 30 / 26 = 1500 cents/30d. Seat $30.00 → threshold
  // floor(3000/2) = 1500. Spec §0's rule is STRICTLY under half, so 1500 < 1500 fails —
  // the boundary case is a refusal, not a coin flip.
  const r = qualifyVerdict({ reportCents: 1300, days: 26, seatCents: 3000 });
  expect(r.normalized30Cents).toBe(1500);
  expect(r.thresholdCents).toBe(1500);
  expect(r.qualified).toBe(false);
});

test("a genuinely light month qualifies, with the arithmetic visible", () => {
  // $5.20 over 26 days → 520 x 30 / 26 = 600 cents/30d < 1500. In.
  const r = qualifyVerdict({ reportCents: 520, days: 26, seatCents: 3000 });
  expect(r).toEqual({ normalized30Cents: 600, thresholdCents: 1500, qualified: true });
});

test("integer math floors, never rounds up someone into a seat", () => {
  // 1001 x 30 / 31 = 968.7… → floor 968. Flooring the CANDIDATE's number is the
  // generous direction; flooring the threshold is the strict one — both floor.
  const r = qualifyVerdict({ reportCents: 1001, days: 31, seatCents: 3001 });
  expect(r.normalized30Cents).toBe(968);
  expect(r.thresholdCents).toBe(1500);
  expect(r.qualified).toBe(true);
});

test("rejects nonsense inputs loudly — a gate that guesses is not a gate", () => {
  for (const bad of [
    { reportCents: -1, days: 26, seatCents: 3000 },
    { reportCents: 100, days: 0, seatCents: 3000 },
    { reportCents: 100, days: 26, seatCents: 0 },
    { reportCents: 1.5, days: 26, seatCents: 3000 },
  ]) {
    expect(() => qualifyVerdict(bad)).toThrow();
  }
});
