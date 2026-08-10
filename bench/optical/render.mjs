// Render a fixed text corpus as PNG pages at several font sizes, so the
// legibility floor of Claude's vision can be measured against visual-token cost.
//
// Visual tokens on Claude = ceil(w/28) * ceil(h/28). High-res tier (4.7+) caps at
// 4784 visual tokens / 2576px long edge, so 2576x1456 is the largest page that is
// NOT downscaled and costs exactly 92 * 52 = 4784 tokens.
//
// The page is packed by construction: geometry is measured first, then exactly
// cols*rows characters of corpus are hard-wrapped in, so no page area is wasted.
// Configurable so the same rig answers the three questions that matter:
//   CORPUS=code|prose   what redundancy the surrounding text carries
//   W, H                the delivered page size (set these to the client's, not the API's)
//   SIZES               comma-separated font sizes
//   TAG                 filename prefix, so runs don't clobber each other
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// puppeteer-core is resolved from outside this repo on purpose — the bench is a
// research rig, not part of the shipped product, and adding a browser driver to
// token-spread's dependencies to run it would be a poor trade. Point
// PUPPETEER_FROM at any package.json whose tree has puppeteer-core installed.
const puppeteer = createRequire(
  process.env.PUPPETEER_FROM ?? '/Users/angus/skills/package.json',
)('puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const CORPUS = process.env.CORPUS ?? 'code';
const W = +(process.env.W ?? 2576), H = +(process.env.H ?? 1456), PAD = 4;
const SIZES = (process.env.SIZES ?? '7,8,10,12,14').split(',').map(Number);
const TAG = process.env.TAG ?? (CORPUS === 'prose' ? 'prose' : 'page');

let seed = +(process.env.SEED ?? 20260811);
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const hex = () => Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0');
const pick = a => a[Math.floor(rnd() * a.length)];

/**
 * Deterministic code corpus: realistic TS-ish source with a probe code every 8th
 * statement. Near-zero linguistic redundancy — the hostile case for vision.
 */
function codeStream() {
  const VERBS = ['resolve', 'flush', 'reconcile', 'hydrate', 'coerce', 'debounce', 'shard', 'replay'];
  const NOUNS = ['ledger', 'breakpoint', 'envelope', 'cursor', 'digest', 'prefix', 'quota', 'window'];
  const raw = [];
  for (let i = 1; i <= 3000; i++) {
    if (i % 8 === 0) {
      raw.push(`/* PROBE-${String(i).padStart(4, '0')}=${hex()} */`);
    } else {
      raw.push(
        `const ${pick(VERBS)}${pick(NOUNS).replace(/^./, c => c.toUpperCase())}${i} = ` +
        `await ${pick(VERBS)}(${pick(NOUNS)}, { retries: ${1 + Math.floor(rnd() * 9)}, ` +
        `ttl: ${300 * (1 + Math.floor(rnd() * 12))}, key: "${hex()}" });`
      );
    }
  }
  return raw.join(' ');
}

/**
 * Prose corpus: real technical English lifted from this repo's own research docs,
 * with a probe every 40 words. Two things get scored on this corpus — probe recall
 * (does surrounding redundancy help an identifier survive?) and word error rate on
 * a marked verbatim region (does the prose itself survive?).
 *
 * Real prose, not generated filler: generated text has the wrong redundancy profile
 * and would flatter the result.
 */
function proseStream() {
  const SOURCES = [
    '../../docs/research/2026-08-10-strict-identity-register.md',
    '../../docs/research/2026-08-11-context-survival-register.md',
    '../../docs/research/2026-08-09-completeness-gaps.md',
    '../../docs/research/2026-08-09-method-register.md',
    '../../docs/architecture.md',
    '../../README.md',
    '../../src/README.md',
    '../../tests/README.md',
    '../../bench/README.md',
  ];
  const text = SOURCES
    .map(rel => { try { return readFileSync(new URL(rel, import.meta.url).pathname, 'utf8'); } catch { return ''; } })
    .join('\n')
    .replace(/```[\s\S]*?```/g, ' ')      // code fences carry no prose redundancy
    .replace(/^\|.*$/gm, ' ')             // tables are not prose either
    .replace(/[#*`>_\[\]()|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 20000) throw new Error('prose corpus too short — are the source docs present?');

  const words = text.split(' ');
  const out = [];
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    out.push(words[i]);
    if ((i + 1) % 40 === 0) out.push(`[PROBE-${String(++n * 8).padStart(4, '0')}=${hex()}]`);
  }
  // Deliberately not padded by repetition: a repeated passage would let a grader
  // recall a probe it had already read rather than the one in front of it.
  return out.join(' ');
}

const stream = CORPUS === 'prose' ? proseStream() : codeStream();

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

const wrap = (s, cols, rows) => {
  if (s.length < cols * rows) {
    throw new Error(
      `corpus is ${s.length} chars but this page holds ${cols * rows} — ` +
      `the page would render half-empty and the ratio would be a lie`);
  }
  const out = [];
  for (let r = 0; r < rows; r++) out.push(s.slice(r * cols, (r + 1) * cols));
  return out.join('\n');
};

const report = [];
for (const fs of SIZES) {
  const lh = Math.round(fs * 1.18);
  const css = `font-family:Menlo,monospace;font-size:${fs}px;line-height:${lh}px`;
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#fff}
    pre{margin:0;padding:${PAD}px;${css};color:#000;white-space:pre;
        -webkit-font-smoothing:none;font-variant-ligatures:none}
    #probe{position:absolute;visibility:hidden;${css};white-space:pre}
  </style><span id="probe">${'M'.repeat(200)}</span><pre id="c"></pre>`);

  const chW = await page.evaluate(() =>
    document.getElementById('probe').getBoundingClientRect().width / 200);
  const cols = Math.floor((W - 2 * PAD) / chW);
  const rows = Math.floor((H - 2 * PAD) / lh);
  const truth = wrap(stream, cols, rows);

  await page.evaluate(t => { document.getElementById('c').textContent = t; }, truth);
  await page.screenshot({ path: `${OUT}${TAG}-${fs}px.png`, clip: { x: 0, y: 0, width: W, height: H } });
  writeFileSync(`${OUT}truth-${TAG}-${fs}px.txt`, truth);

  const visualTokens = Math.ceil(W / 28) * Math.ceil(H / 28);
  const chars = truth.replace(/\n/g, '').length;
  // Claude runs ~3.6 chars/token on dense code, ~4.0 on English prose. Approximate:
  // count_tokens would be exact, and would need an API key the rig deliberately avoids.
  const charsPerToken = CORPUS === 'prose' ? 4.0 : 3.6;
  const textTokens = Math.round(chars / charsPerToken);
  const probesOnPage = (truth.match(/PROBE-\d{4}=[0-9a-f]{6}/g) || []).length;
  report.push({ fontPx: fs, lineHeightPx: lh, charWidthPx: +chW.toFixed(2), cols, rows, corpus: CORPUS, charsPerToken, pageW: W, pageH: H,
                chars, textTokensApprox: textTokens, visualTokens,
                ratio: +(textTokens / visualTokens).toFixed(2), probesOnPage });
}
await browser.close();
writeFileSync(OUT + `report-${TAG}.json`, JSON.stringify(report, null, 2));
console.log('font  lh   chW  cols rows   chars  textTok  visTok  ratio  probes');
for (const r of report) console.log(
  String(r.fontPx).padStart(4), String(r.lineHeightPx).padStart(3), String(r.charWidthPx).padStart(5),
  String(r.cols).padStart(4), String(r.rows).padStart(4), String(r.chars).padStart(7),
  String(r.textTokensApprox).padStart(8), String(r.visualTokens).padStart(7),
  String(r.ratio).padStart(6), String(r.probesOnPage).padStart(7));
