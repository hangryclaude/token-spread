/* idemlayer — shared behaviour. No dependencies, no build step. */

/* Scroll reveals. Pre-triggers 200px early so fast scrolling never outruns the
   transition (that showed up as occlusion warnings in gate 2). */
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }),
  { rootMargin: "200px 0px 100px 0px", threshold: 0.01 },
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ── savings model ───────────────────────────────────────────────────────
   Levers compound; each applies to what the previous one left. Never summed —
   summing them overstates the saving, which is the thing every competitor does. */
export const CEIL = 0.85; // realistic achievable hit rate

export function modelSavings({ spend, hit, inputShare, batchable, dupRate }) {
  const h0 = hit / 100;
  // Current spend already reflects h0, so only the gap to CEIL is recoverable.
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
