import { expect, test } from "bun:test";
import { budgetDecision, actionsFromDecision } from "../../src/pool/budget";
import type { PoolMember } from "../../src/pool/types";

function member(over: Partial<PoolMember> = {}): PoolMember {
  return { id: "m1", workspaceId: "default", apiKeyId: "apikey_abc", ...over };
}

test("balance and spendable are computed, no threshold crossed below any", () => {
  // credited 2000, consumed 500 -> balance 1500; reserve 100 -> spendable 1400.
  // shareBps = floor(500 * 10_000 / 2000) = 2500 (25.00%), below the 50% threshold.
  const d = budgetDecision({
    memberId: "m1",
    creditedMicroCents: 2000,
    consumedMicroCents: 500,
    reserveMicroCents: 100,
    alreadyAlertedPcts: [],
    thresholds: [50, 80, 95],
  });
  expect(d.balanceMicroCents).toBe(1500);
  expect(d.spendableMicroCents).toBe(1400);
  expect(d.newAlertPcts).toEqual([]);
  expect(d.hardCap).toBe(false);
});

test("exact threshold boundary fires: shareBps == t*100 counts as crossed", () => {
  // credited 1000, consumed 500 -> shareBps = floor(500*10_000/1000) = 5000 == 50*100.
  const d = budgetDecision({
    memberId: "m1",
    creditedMicroCents: 1000,
    consumedMicroCents: 500,
    reserveMicroCents: 0,
    alreadyAlertedPcts: [],
    thresholds: [50, 80, 95],
  });
  expect(d.newAlertPcts).toEqual([50]);
  expect(d.hardCap).toBe(false);
});

test("already-alerted thresholds are suppressed, not re-fired", () => {
  // Same 50% crossing as above, but 50 is already in alreadyAlertedPcts.
  const d = budgetDecision({
    memberId: "m1",
    creditedMicroCents: 1000,
    consumedMicroCents: 500,
    reserveMicroCents: 0,
    alreadyAlertedPcts: [50],
    thresholds: [50, 80, 95],
  });
  expect(d.newAlertPcts).toEqual([]);
});

test("multiple thresholds crossed in one look emit in ascending order", () => {
  // credited 1000, consumed 900 -> shareBps = 9000 (90%), crosses 50 and 80, not 95.
  const d = budgetDecision({
    memberId: "m1",
    creditedMicroCents: 1000,
    consumedMicroCents: 900,
    reserveMicroCents: 0,
    alreadyAlertedPcts: [],
    thresholds: [95, 50, 80], // deliberately unsorted input
  });
  expect(d.newAlertPcts).toEqual([50, 80]);
});

test("hardCap fires exactly when spendable == 0, not just when negative", () => {
  // credited 1000, consumed 1000 -> balance 0, reserve 0 -> spendable 0 -> hardCap.
  const d = budgetDecision({
    memberId: "m1",
    creditedMicroCents: 1000,
    consumedMicroCents: 1000,
    reserveMicroCents: 0,
    alreadyAlertedPcts: [],
    thresholds: [50, 80, 95],
  });
  expect(d.spendableMicroCents).toBe(0);
  expect(d.hardCap).toBe(true);
});

test("a reserve can push an in-credit member over the cap", () => {
  // balance = 1000 - 400 = 600, but reserve 700 -> spendable -100 -> hardCap, even
  // though the member is nowhere near their credited amount.
  const d = budgetDecision({
    memberId: "m1",
    creditedMicroCents: 1000,
    consumedMicroCents: 400,
    reserveMicroCents: 700,
    alreadyAlertedPcts: [],
    thresholds: [50, 80, 95],
  });
  expect(d.balanceMicroCents).toBe(600);
  expect(d.spendableMicroCents).toBe(-100);
  expect(d.hardCap).toBe(true);
});

test("a zero-credit member is 100% consumed by definition and hard-capped", () => {
  const d = budgetDecision({
    memberId: "m1",
    creditedMicroCents: 0,
    consumedMicroCents: 0,
    reserveMicroCents: 0,
    alreadyAlertedPcts: [],
    thresholds: [50, 80, 95],
  });
  expect(d.spendableMicroCents).toBe(0);
  expect(d.hardCap).toBe(true);
  expect(d.newAlertPcts).toEqual([50, 80, 95]);
});

test("large-value integer exactness: consumed*10_000 stays exact under MAX_SAFE_INTEGER", () => {
  // $9B in micro-cents = 9e9 * 1e6 = 9e15 micro-cents. consumed*10_000 = 9e19... too
  // large; instead pick consumed such that consumed*10_000 sits just under
  // Number.MAX_SAFE_INTEGER (2^53-1 ~= 9.007e15), per the spec's "~$9B" note:
  // $9B = 9e9 dollars * 100 cents * 1e6 micro-cents/cent... spec means consumed itself
  // up to ~9e9 micro-cents-worth-of-nines; use a value whose *10_000 lands exactly
  // under MAX_SAFE_INTEGER and check the arithmetic is exact, not rounded.
  const consumedMicroCents = 900_719_925_474; // * 10_000 = 9_007_199_254_740_000 < MAX_SAFE_INTEGER
  const creditedMicroCents = 1_000_000_000_000; // 1e12, so shareBps < 10_000 (not maxed out)
  expect(consumedMicroCents * 10_000).toBeLessThan(Number.MAX_SAFE_INTEGER);
  const d = budgetDecision({
    memberId: "m1",
    creditedMicroCents,
    consumedMicroCents,
    reserveMicroCents: 0,
    alreadyAlertedPcts: [],
    thresholds: [50, 80, 95],
  });
  // floor(900_719_925_474 * 10_000 / 1_000_000_000_000) = floor(9007.19925474) = 9007
  // (90.07%): crosses 50 and 80, not 95.
  expect(Math.floor(consumedMicroCents * 10_000 / creditedMicroCents)).toBe(9007);
  expect(d.newAlertPcts).toEqual([50, 80]);
});

test("actionsFromDecision emits one alert per newAlertPct, no deactivation below cap", () => {
  const d = budgetDecision({
    memberId: "m1",
    creditedMicroCents: 1000,
    consumedMicroCents: 900,
    reserveMicroCents: 0,
    alreadyAlertedPcts: [],
    thresholds: [50, 80, 95],
  });
  const actions = actionsFromDecision(d, member());
  expect(actions).toEqual([
    { type: "alert", memberId: "m1", pct: 50, spendableMicroCents: d.spendableMicroCents },
    { type: "alert", memberId: "m1", pct: 80, spendableMicroCents: d.spendableMicroCents },
  ]);
});

test("actionsFromDecision appends deactivate_key after alerts when hardCapped", () => {
  const d = budgetDecision({
    memberId: "m1",
    creditedMicroCents: 1000,
    consumedMicroCents: 1000,
    reserveMicroCents: 0,
    alreadyAlertedPcts: [50, 80],
    thresholds: [50, 80, 95],
  });
  const actions = actionsFromDecision(d, member({ apiKeyId: "apikey_xyz" }));
  expect(actions).toEqual([
    { type: "alert", memberId: "m1", pct: 95, spendableMicroCents: 0 },
    { type: "deactivate_key", memberId: "m1", apiKeyId: "apikey_xyz" },
  ]);
});

test("actionsFromDecision re-emits deactivate_key every look while hardcapped, even with no new alerts", () => {
  const d = budgetDecision({
    memberId: "m1",
    creditedMicroCents: 1000,
    consumedMicroCents: 1100,
    reserveMicroCents: 0,
    alreadyAlertedPcts: [50, 80, 95],
    thresholds: [50, 80, 95],
  });
  const actions = actionsFromDecision(d, member());
  expect(actions).toEqual([{ type: "deactivate_key", memberId: "m1", apiKeyId: "apikey_abc" }]);
});
