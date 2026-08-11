/**
 * Enumerate EVERY state the pricing calculator can reach, and check what the page would print.
 *
 * pricing.html exposes all five inputs as bounded, stepped sliders, so the reachable surface is
 * finite — 78.8 million combinations — and small enough to enumerate exactly rather than sample.
 * Anything this misses is not something a visitor can produce.
 *
 * It checks the arithmetic (nothing non-finite, no negative saving, nothing over 100%) and the
 * two places the page divides — the ROI figure and the "N% of it is caching" share — because a
 * divide by zero there prints NaN to a buyer. It also checks the commercial claim the page makes
 * about itself: the "we'd tell you not to buy" verdict must appear exactly when the fee is worth
 * more than the saving, in both directions.
 *
 *   node site/tools/sweep-pricing.mjs             ~2 minutes, exit 1 on any finding
 *   node site/tools/sweep-pricing.mjs --control   inject faults; every assertion must fire
 *
 * The control is the point. A sweep of 78 million states that has never failed is not evidence
 * of anything, and this one passed first time.
 */
import { modelSavings as realModel, tierFor } from '../assets/savings.js';

const CONTROL = process.argv.includes('--control');

/* Faults a plausible edit could introduce, each aimed at a different assertion. */
const brokenModel = (input) => {
  const r = realModel(input);
  if (input.hit === 100) return { ...r, saved: -1, final: input.spend + 1 };      // negative saving
  if (input.hit === 0 && input.dupRate === 0) return { ...r, pct: 101 };          // over 100%
  if (input.inputShare === 30) return { ...r, cache: r.saved * 2 };               // share over 100
  if (input.spend === 5000) return { ...r, saved: NaN, pct: NaN };                // non-finite
  return r;
};
const model = CONTROL ? brokenModel : realModel;

const range = (min, max, step) => {
  const out = [];
  for (let v = min; v <= max; v += step) out.push(v);
  return out;
};
/* Read off the <input> attributes in pricing.html. If a slider's bounds change there, change
   them here — a sweep of the wrong range is worse than no sweep, because it reads as coverage. */
const SPEND = range(5000, 400000, 5000);
const HIT = range(0, 100, 1);
const INS = range(30, 95, 5);
const BAT = range(0, 80, 5);
const DUP = range(0, 40, 1);

const found = new Map();
const note = (k, detail) => { if (!found.has(k)) found.set(k, detail); };
let n = 0;

for (const spend of SPEND) for (const hit of HIT) for (const inputShare of INS)
  for (const batchable of BAT) for (const dupRate of DUP) {
    n++;
    const r = model({ spend, hit, inputShare, batchable, dupRate });
    const t = tierFor(spend);
    const net = r.saved - t.fee;
    const state = `spend ${spend} hit ${hit} ins ${inputShare} bat ${batchable} dup ${dupRate}`;

    for (const [name, v] of Object.entries(r)) {
      if (typeof v === 'number' && !Number.isFinite(v)) note(`non-finite ${name}`, `${state} -> ${v}`);
    }
    if (r.saved < -1e-9) note('negative saving', `${state} -> ${r.saved}`);
    if (r.final < -1e-9) note('negative final', `${state} -> ${r.final}`);
    if (r.pct > 100 + 1e-9) note('pct over 100', `${state} -> ${r.pct}`);
    if (r.final > spend + 1e-9) note('final above spend', state);

    if (!Number.isFinite(r.saved / t.fee)) note('non-finite ROI', state);
    if (r.pct >= 40) {
      const share = Math.round((r.cache / r.saved) * 100);
      if (!Number.isFinite(share)) note('non-finite cache share in the >=40% branch', state);
      else if (share > 100 || share < 0) note('cache share outside 0-100', `${state} -> ${share}%`);
    }
    const saysDontBuy = net <= 0;
    if (saysDontBuy && r.saved > t.fee) note('says do-not-buy while saving more than the fee', state);
    if (!saysDontBuy && r.saved <= t.fee) note('recommends buying while the fee eats the saving', state);
  }

console.log(`${n.toLocaleString()} reachable states enumerated${CONTROL ? ' (control: faults injected)' : ''}`);
if (CONTROL) {
  // Every fault above must surface, or the corresponding assertion is dead weight.
  const want = ['negative saving', 'pct over 100', 'cache share outside 0-100', 'non-finite saved'];
  const missed = want.filter((w) => ![...found.keys()].some((k) => k.startsWith(w)));
  for (const k of found.keys()) console.log(`  ✓ fired: ${k}`);
  if (missed.length) {
    console.log(`\n✗ these assertions never fired and are worthless: ${missed.join(', ')}`);
    process.exit(1);
  }
  console.log('\nevery injected fault was caught');
  process.exit(0);
}
if (!found.size) { console.log('no broken or misleading output in any reachable state'); process.exit(0); }
for (const [k, v] of found) console.log(`  ✗ ${k}\n      first at: ${v}`);
process.exit(1);
