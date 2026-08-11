/* Tokens Saved — the savings model the site quotes. Pure: no DOM, no side effects.

   Split out of site.js so it can be tested. It used to live beside an IntersectionObserver
   that runs at module scope, which made the module impossible to import outside a browser —
   so the arithmetic behind the homepage's headline number had no tests at all, while the
   CLI's pricing next door had a hundred and thirty. site.js re-exports everything here, so
   both pages import exactly what they did before. */

export const CEIL = 0.85; // realistic achievable hit rate

/**
 * Levers compound; each applies to what the previous one left. Never summed — summing them
 * overstates the saving, which is the thing every competitor does.
 */
export function modelSavings({ spend, hit, inputShare, batchable, dupRate }) {
  const h0 = hit / 100;
  // Current spend already reflects h0, so only the gap to CEIL is recoverable.
  //
  // Input cost at hit rate h is (1 - 0.9h) of the uncached rate, because a read bills at
  // 0.1x. So the recoverable fraction of the CURRENT input bill is the difference over the
  // current level: [(1-0.9*h0) - (1-0.9*CEIL)] / (1-0.9*h0), which reduces to the below.
  const cacheFrac = h0 < CEIL ? (0.9 * (CEIL - h0)) / (1 - 0.9 * h0) : 0;
  const cache = spend * (inputShare / 100) * cacheFrac;
  const afterCache = spend - cache;
  const batch = afterCache * (batchable / 100) * 0.5;
  const afterBatch = afterCache - batch;
  const dedup = afterBatch * (dupRate / 100);
  const final = afterBatch - dedup;
  return { spend, cache, batch, dedup, saved: spend - final, final,
           pct: spend > 0 ? ((spend - final) / spend) * 100 : 0 };
}

export function tierFor(spend) {
  if (spend <= 10000) return { name: "Starter", fee: 499 };
  if (spend <= 35000) return { name: "Growth", fee: 1999 };
  if (spend <= 120000) return { name: "Scale", fee: 5999 };
  return { name: "Enterprise", fee: 15000 };
}

export const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
