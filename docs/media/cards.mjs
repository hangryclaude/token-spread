#!/usr/bin/env node
/**
 * Composes the README explainer cards: fal art as backdrop, every word and figure rendered as real
 * HTML on top.
 *
 * The split is deliberate. A diffusion model cannot render a number reliably, and this repo sells
 * numbers, so nothing generated is ever allowed to carry one. The counts below are read out of
 * docs/research/2026-08-10-verdicts-final.json at compose time rather than typed here — the same
 * reason tests/publishedCounts.test.ts exists. If the register changes, the cards change with it.
 *
 *   node docs/media/fal.mjs && node docs/media/cards.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire("/Users/angus/skills/package.json");
const puppeteer = require("puppeteer-core");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const ART = join(HERE, "art");
const OUT = join(HERE, "cards");

/* The manifest, not a hand-list. This file used to name two cohorts while cohorts.json grew to
   seven — the exact "cohort added to two of the three lists" drift publishedCounts.test.ts warns
   about, and the card was quietly drawing a 187-era tally under a README that said 335. */
const entries = JSON.parse(readFileSync(join(ROOT, "docs/research/cohorts.json"), "utf8"))
  .flatMap((f) => JSON.parse(readFileSync(join(ROOT, "docs/research", f), "utf8")));
const tally = (v) => entries.filter((e) => e.strictVerdict === v).length;
const PASSING = ["PASS_ABSOLUTE", "PASS_METADATA", "PASS_SCHEDULING", "PASS_REPLAY"];
const N = {
  total: entries.length,
  pass: PASSING.reduce((n, v) => n + tally(v), 0),
  contractual: tally("CONTRACTUAL_ONLY"),
  rejected: tally("FAIL"),
  unresolved: tally("INSUFFICIENT_EVIDENCE"),
};
// The card would otherwise be the fifth hand-maintained copy of this tally. Refuse to draw a
// breakdown that does not account for every candidate.
if (N.pass + N.contractual + N.rejected + N.unresolved !== N.total) {
  console.error(`register does not reconcile: ${N.pass}+${N.contractual}+${N.rejected}+${N.unresolved} != ${N.total}`);
  process.exit(1);
}

const b64 = (slug) => {
  const f = join(ART, `${slug}.jpg`);
  if (!existsSync(f)) {
    console.error(`missing backdrop ${f} — run: node docs/media/fal.mjs`);
    process.exit(1);
  }
  return `data:image/jpeg;base64,${readFileSync(f).toString("base64")}`;
};

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
@font-face{font-family:x;src:local("Inter"),local("Helvetica Neue")}
body{width:1280px;height:720px;overflow:hidden;
  font-family:"Inter","Helvetica Neue",Arial,sans-serif;color:#f2f5f3;background:#0b0f0d}
.card{position:relative;width:1280px;height:720px}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
/* The art is atmosphere, not information. Held well back so nothing competes with the type. */
.scrim{position:absolute;inset:0;background:
  linear-gradient(100deg,rgba(6,9,8,.96) 0%,rgba(6,9,8,.9) 46%,rgba(6,9,8,.55) 100%)}
.body{position:absolute;inset:0;padding:76px 84px;display:flex;flex-direction:column;justify-content:center;gap:26px}
.eyebrow{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:15px;letter-spacing:.22em;
  text-transform:uppercase;color:#4ec98a}
h1{font-size:58px;line-height:1.06;letter-spacing:-.035em;font-weight:660;max-width:15ch}
blockquote{font-size:34px;line-height:1.32;letter-spacing:-.02em;font-weight:400;max-width:22ch;
  border-left:3px solid #0a7d45;padding-left:26px;color:#e7ece9}
p{font-size:22px;line-height:1.5;color:#a8b4ad;max-width:44ch}
strong{color:#f2f5f3;font-weight:600}
.rows{display:flex;flex-direction:column;gap:11px;max-width:620px}
.row{display:flex;align-items:baseline;gap:18px}
.row .n{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:31px;font-weight:600;
  width:74px;text-align:right;letter-spacing:-.02em}
.row .l{font-size:21px;color:#a8b4ad}
/* Fixed width, not flex:1 — sharing a track length is the whole point of drawing bars, and
   letting the label push the track around made 24 look longer than 50. */
.row .bar{width:300px;flex:none;height:9px;border-radius:5px;background:#1a2521;overflow:hidden}
.row .bar i{display:block;height:100%;background:#0a7d45}
.row.dim .n{color:#7f8c86}.row.dim .bar i{background:#39504a}
.foot{position:absolute;left:84px;bottom:44px;font-family:ui-monospace,"SF Mono",Menlo,monospace;
  font-size:14px;color:#6d7a74;letter-spacing:.04em}
/* Two columns of equal width. The "no" modifier goes on a COLUMN, never on the flex row —
   putting it on the row made the second heading and its list into siblings of the columns. */
.two{display:flex;gap:64px;max-width:840px}
.two>div{flex:1 1 0;min-width:0}
.two h2{font-size:17px;letter-spacing:.16em;text-transform:uppercase;color:#4ec98a;
  font-family:ui-monospace,"SF Mono",Menlo,monospace;margin-bottom:14px;font-weight:500}
.two ul{list-style:none;display:flex;flex-direction:column;gap:9px}
.two li{font-size:21px;color:#cdd6d1;padding-left:24px;position:relative}
.two li::before{content:"\\2192";position:absolute;left:0;color:#0a7d45}
.two .no h2{color:#c98a80}
.two .no li{color:#8d9a94}
.two .no li::before{content:"\\00d7";color:#a5352a}
`;

const pct = (n) => `${(n / N.total * 100).toFixed(0)}%`;

const CARDS = [
  {
    slug: "bar",
    html: `<p class="eyebrow">The bar</p>
      <blockquote>Does the model read a different sequence of tokens, does a different model
        answer, or does a different amount of thinking happen?</blockquote>
      <p>If the answer is yes it is not a saving &mdash; it is a changed product sold as one.
        That rules out the largest number anyone can put on a slide.</p>
      <div class="foot">token-spread &middot; one question, applied ${N.total} times</div>`,
  },
  {
    slug: "register",
    html: `<p class="eyebrow">The register</p>
      <h1>${N.total} techniques, adjudicated one at a time.</h1>
      <div class="rows">
        <div class="row"><span class="n">${N.pass}</span><span class="bar"><i style="width:${pct(N.pass)}"></i></span><span class="l">pass the bar</span></div>
        <div class="row dim"><span class="n">${N.contractual}</span><span class="bar"><i style="width:${pct(N.contractual)}"></i></span><span class="l">pass on the provider's word alone</span></div>
        <div class="row dim"><span class="n">${N.rejected}</span><span class="bar"><i style="width:${pct(N.rejected)}"></i></span><span class="l">rejected outright</span></div>
        <div class="row dim"><span class="n">${N.unresolved}</span><span class="bar"><i style="width:${pct(N.unresolved)}"></i></span><span class="l">unresolved, and stated as unresolved</span></div>
      </div>
      <div class="foot">the four add to ${N.total} &middot; a register that quietly drops a category is doing the thing it exists to prevent</div>`,
  },
  {
    slug: "reads",
    html: `<p class="eyebrow">It only reads</p>
      <h1>Not a promise. A property the tests defend.</h1>
      <div class="two">
        <div>
          <h2>What it reads</h2>
          <ul><li>Token counts</li><li>Model names</li><li>Workspaces and tiers</li><li>Timestamps</li></ul>
        </div>
        <div class="no">
          <h2>What it never reads</h2>
          <!-- Not "file contents": it parses transcript files, that is how it works at all. What it
               never touches is message.content inside them. An explainer that overstates the
               guarantee is the same defect as an overstated saving. -->
          <ul><li>Prompt text</li><li>Completions</li><li><code>message.content</code></li><li>Anything over the network</li></ul>
        </div>
      </div>
      <div class="foot">tests/readOnly.test.ts &middot; every input byte-identical after a full run, canary planted and not found</div>`,
  },
  {
    slug: "bands",
    html: `<p class="eyebrow">What the audit finds</p>
      <h1>Three numbers, three grades of proof.</h1>
      <div class="rows" style="max-width:900px">
        <div class="row"><span class="n">3.9%</span><span class="bar"><i style="width:6%"></i></span><span class="l"><strong>measured</strong> &mdash; our own machine, 100% cache-hit already</span></div>
        <div class="row dim"><span class="n">59%</span><span class="bar"><i style="width:59%"></i></span><span class="l"><strong>published</strong> &mdash; ProjectDiscovery, 7%&rarr;84% hit rate</span></div>
        <div class="row dim"><span class="n">~60%</span><span class="bar"><i style="width:62%"></i></span><span class="l"><strong>modelled</strong> &mdash; broken cache, assumptions stated</span></div>
      </div>
      <p style="max-width:52ch">The audit's whole job is telling you which of the three you are
        before you pay anyone &mdash; including us.</p>
      <div class="foot">a saving quoted without its evidence grade is the thing this register exists to catch</div>`,
  },
  {
    slug: "gate",
    html: `<p class="eyebrow">How it is checked</p>
      <h1>A gate is not finished until something has failed it.</h1>
      <p>Every check in this repo ships with the control that proves it can fail: the bad input is
        planted, the gate fires, the plant is removed. A green suite that has never gone red is
        not evidence &mdash; it is decoration.</p>
      <div class="foot">bun test &middot; controls kept in the repo, not in a screenshot</div>`,
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });

for (const c of CARDS) {
  await page.setContent(
    `<style>${CSS}</style><div class="card">
       <img class="bg" src="${b64(c.slug)}"><div class="scrim"></div>
       <div class="body">${c.html}</div>
     </div>`,
    // Not networkidle0: a ~1MB data: URI counts as an in-flight request that never settles for
    // the idle heuristic, and the second card hung for the full 30s timeout. Wait on the image
    // itself instead, which is the thing we actually need decoded before the shot.
    { waitUntil: "load" },
  );
  await page.evaluate(() => document.querySelector("img.bg").decode());
  // JPEG, not PNG: these are photographic backdrops under type, and the PNG set was 3.3MB for a
  // README that displays them at 820px. At 2560px downsampled to 820 the artefacts are invisible.
  await page.screenshot({ path: join(OUT, `${c.slug}.jpg`), type: "jpeg", quality: 92 });
  console.log(`wrote cards/${c.slug}.jpg`);
}

await browser.close();
