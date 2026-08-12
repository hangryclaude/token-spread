/**
 * Render docs/media/register.html to an mp4 and a gif for the README.
 *
 * The film states the register's tally, so the tally is read from the verdict file at render
 * time and injected — never typed into the page. On 2026-08-12 the site published 66 + 50 + 36
 * under a headline of 176, having silently dropped the 24 CONTRACTUAL_ONLY entries; an explainer
 * carrying its own hand-typed copy of those numbers would be the same defect in a new costume.
 *
 * The page is a pure function of t: it reads no clock, and its scatter uses a seeded PRNG rather
 * than Math.random. So frames are captured by setting t and shooting, not by recording playback —
 * two renders of the same commit produce identical frames, and a wrong frame is reproducible
 * rather than a fluke.
 *
 *   node docs/media/render.mjs            write mp4 + gif
 *   node docs/media/render.mjs --check    fail if the film's counts no longer match the data
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

/* Same resolution the site tools use: puppeteer-core lives in ~/skills, not in this repo, so
   rendering the README's film adds no dependency to the product. */
let puppeteer;
try {
  puppeteer = createRequire('/Users/angus/skills/package.json')('puppeteer-core');
} catch {
  console.error('✗ cannot load puppeteer-core from ~/skills — cannot render');
  process.exit(2);
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const PAGE = `file://${join(ROOT, 'docs/media/register.html')}`;
const FPS = 25, SECONDS = 12, FRAMES = FPS * SECONDS;
const CHECK = process.argv.includes('--check');

/* The four buckets the site publishes, in the order it publishes them. PASS_* are the classes
   where identity is demonstrable; CONTRACTUAL_ONLY deliberately is not one of them, which is
   exactly why it needs its own column instead of being folded in or dropped. */
const PASSING = ['PASS_ABSOLUTE', 'PASS_METADATA', 'PASS_SCHEDULING', 'PASS_REPLAY'];
/* Both cohorts. The film's whole claim is that its counts are read from the register at render
   time rather than typed into the animation — which stops being true the moment it reads only
   half the register. */
const entries = [
  'docs/research/2026-08-10-verdicts-final.json',
  'docs/research/2026-08-12-addendum.json',
].flatMap((f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8')));
const count = (fn) => entries.filter(fn).length;
const groups = [
  { key: 'pass', label: 'pass the bar', color: '#3ddc84', n: count((e) => PASSING.includes(e.strictVerdict)) },
  { key: 'contractual', label: "provider's<br>word only", color: '#d6a544', n: count((e) => e.strictVerdict === 'CONTRACTUAL_ONLY') },
  { key: 'rejected', label: 'rejected', color: '#e57866', n: count((e) => e.strictVerdict === 'FAIL') },
  { key: 'unresolved', label: 'unresolved', color: '#6d817a', n: count((e) => e.strictVerdict === 'INSUFFICIENT_EVIDENCE') },
];

const total = groups.reduce((a, g) => a + g.n, 0);
if (total !== entries.length) {
  console.error(`✗ the four buckets hold ${total} of ${entries.length} candidates — a verdict class is unaccounted for.`);
  console.error('  Fix the bucket list before rendering; a film that drops a category is the bug it is about.');
  process.exit(1);
}
console.log(`${entries.length} candidates: ${groups.map((g) => `${g.n} ${g.key}`).join(' · ')}`);

if (CHECK) {
  const out = join(ROOT, 'docs/media/register.mp4');
  if (!existsSync(out)) { console.error('✗ register.mp4 has never been rendered'); process.exit(1); }
  console.log(`register.mp4 present (${(statSync(out).size / 1024).toFixed(0)}KB). Counts reconcile: ${total} = ${entries.length}.`);
  console.log('Re-render with `node docs/media/render.mjs` whenever the verdict file changes.');
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'reg-film-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--force-device-scale-factor=1'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto(PAGE, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__ready === true', { timeout: 10000 });
/* Fonts must be resolved before the first frame or beat 1 renders in a fallback face. */
await page.evaluate(() => document.fonts.ready);
await page.evaluate((g) => window.setData(g), groups);

for (let i = 0; i < FRAMES; i++) {
  await page.evaluate((t) => window.setT(t), i / (FRAMES - 1));
  await page.screenshot({ path: join(dir, `f_${String(i).padStart(4, '0')}.png`) });
}
await browser.close();
console.log(`${FRAMES} frames at ${FPS}fps`);

const mp4 = join(ROOT, 'docs/media/register.mp4');
const gif = join(ROOT, 'docs/media/register.gif');
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

ff(['-framerate', String(FPS), '-i', join(dir, 'f_%04d.png'),
  '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', mp4]);

/* A shared palette beats per-frame quantisation badly on flat dark backgrounds — without it the
   green dots band and the background dithers into visible noise. 640px keeps the README light. */
const pal = join(dir, 'pal.png');
ff(['-i', join(dir, 'f_%04d.png'), '-vf', 'fps=12,scale=640:-1:flags=lanczos,palettegen=max_colors=128', pal]);
ff(['-framerate', String(FPS), '-i', join(dir, 'f_%04d.png'), '-i', pal,
  '-lavfi', 'fps=12,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3', gif]);

rmSync(dir, { recursive: true, force: true });
for (const f of [mp4, gif]) console.log(`  ${f.replace(ROOT, '')}  ${(statSync(f).size / 1024).toFixed(0)}KB`);
