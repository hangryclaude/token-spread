import { expect, test } from "bun:test";
import { CEIL, modelSavings, tierFor, usd } from "../site/assets/savings.js";

/* The model behind every number the marketing site quotes. It had no tests until now, because
   it lived in a module that runs an IntersectionObserver at import time and so could not be
   loaded outside a browser. The CLI's pricing has a hundred and thirty; this had zero, and it
   is the arithmetic a visitor sees first. */

/** What index.html assumes. pricing.html exposes the same four and lets you move them. */
const HOMEPAGE = { hit: 30, inputShare: 70, batchable: 20, dupRate: 5 };

test("the homepage's quoted numbers are what the model actually returns", () => {
  const r = modelSavings({ spend: 40000, ...HOMEPAGE });
  // These three strings appear on index.html. If the model moves, this fails before a visitor
  // sees a number the page cannot justify.
  expect(usd(r.final)).toBe("$17,967");
  expect(usd(r.saved)).toBe("$22,033");
  expect(r.pct.toFixed(0)).toBe("55");
});

test("levers compound rather than sum", () => {
  const spend = 40000;
  const r = modelSavings({ spend, ...HOMEPAGE });
  // Each lever applied independently to the FULL spend, which is the overstatement this model
  // exists to avoid: batch and dedup only ever see what caching left behind.
  const naive =
    r.cache +
    spend * (HOMEPAGE.batchable / 100) * 0.5 +
    spend * (HOMEPAGE.dupRate / 100);
  expect(naive).toBeGreaterThan(r.saved);
  // And the parts still add up to the whole, so nothing is quietly dropped.
  expect(r.cache + r.batch + r.dedup).toBeCloseTo(r.saved, 6);
  expect(r.final + r.saved).toBeCloseTo(spend, 6);
});

test("a hit rate at or above the ceiling leaves nothing to recover from caching", () => {
  for (const hit of [CEIL * 100, 90, 100]) {
    const r = modelSavings({ spend: 40000, ...HOMEPAGE, hit });
    expect(r.cache).toBe(0);
  }
});

test("the cache lever never reports a negative saving", () => {
  // The measured case that killed the routing pitch: Angus's own traffic sits at ~100%.
  const r = modelSavings({ spend: 12345, hit: 100, inputShare: 100, batchable: 0, dupRate: 0 });
  expect(r.saved).toBe(0);
  expect(r.final).toBe(12345);
  expect(r.pct).toBe(0);
});

test("a better cache today means less left to recover", () => {
  let previous = Infinity;
  for (const hit of [0, 10, 30, 50, 70, 84]) {
    const r = modelSavings({ spend: 40000, ...HOMEPAGE, hit });
    expect(r.cache).toBeLessThan(previous);
    previous = r.cache;
  }
});

test("zero spend produces zeroes, not NaN", () => {
  const r = modelSavings({ spend: 0, ...HOMEPAGE });
  for (const v of [r.cache, r.batch, r.dedup, r.saved, r.final, r.pct]) {
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(0);
  }
});

test("the saving can never exceed the spend", () => {
  // Every lever at maximum, which is the only way to push the total anywhere near 100%.
  const r = modelSavings({ spend: 1000, hit: 0, inputShare: 100, batchable: 100, dupRate: 100 });
  expect(r.pct).toBeLessThanOrEqual(100);
  expect(r.final).toBeGreaterThanOrEqual(0);
});

test("tier boundaries are inclusive at the top of each band", () => {
  expect(tierFor(10000).name).toBe("Starter");
  expect(tierFor(10001).name).toBe("Growth");
  expect(tierFor(35000).name).toBe("Growth");
  expect(tierFor(35001).name).toBe("Scale");
  expect(tierFor(120000).name).toBe("Scale");
  expect(tierFor(120001).name).toBe("Above Scale");
});

test("no fee is quoted above the highest published tier", () => {
  /* The band above Scale carried an invented $15,000/mo until 2026-08-12 — a figure on no card
     and in no brief, shown to exactly the buyer the product is built for. Every published tier
     must have a number and the unpublished one must not, or the calculator is making prices up. */
  for (const spend of [5000, 10000, 35000, 120000]) {
    expect(tierFor(spend).fee, `${spend} has no published fee`).toBeGreaterThan(0);
  }
  for (const spend of [120001, 250000, 400000]) {
    expect(tierFor(spend).fee, `${spend} quotes a fee nobody published`).toBeNull();
  }
});

test("an unpublished fee cannot be arithmetic'd into a net figure", () => {
  // `null <= 0` is true and `saved - null` is `saved`, so a caller that forgets the null check
  // silently prints the gross saving as if it were net, or advises against buying. Pin both.
  const fee = tierFor(400000).fee;
  expect(fee).toBeNull();
  expect(fee === null ? null : 1 - fee).toBeNull();
});

test("the fee never exceeds the saving it is quoted against on the homepage default", () => {
  // pricing.html shows `saved - fee` as net. A tier whose fee outruns its own band's saving
  // would put a negative number on the page.
  for (const spend of [10000, 35000, 120000]) {
    const r = modelSavings({ spend, ...HOMEPAGE });
    expect(r.saved).toBeGreaterThan(tierFor(spend).fee);
  }
});

test("usd rounds and groups the way the page renders it", () => {
  expect(usd(17966.71)).toBe("$17,967");
  expect(usd(0)).toBe("$0");
  expect(usd(1000000)).toBe("$1,000,000");
});
