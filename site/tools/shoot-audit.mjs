/**
 * Re-shoot the audit-document screenshots from the live sample.
 *
 * Both images are pictures of a generated document, so any change to src/render/auditHtml.ts
 * silently makes them lies. That happened: the palette fix that cleared 56 WCAG failures left
 * README.md and act 6 of the site both showing the OLD, failing colours. They were built by
 * hand, so nothing re-made them and nothing said they were stale.
 *
 *   node site/tools/shoot-audit.mjs [--check]
 *
 * --check re-shoots to a temporary path and reports whether the committed images still match
 * the document, without writing. Exit 1 if they have drifted.
 */
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CHECK = process.argv.includes('--check');
const ORIGIN = process.env.SITE_ORIGIN || 'http://localhost:8740';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let puppeteer;
try {
  puppeteer = createRequire('/Users/angus/skills/package.json')('puppeteer-core');
} catch {
  console.error('✗ cannot load puppeteer-core from ~/skills — not a pass');
  process.exit(2);
}

/* Derived from the committed files rather than guessed: docs/img was 1920x2360 (1920 CSS at
 * DPR 1, cropped 152px short of the 2512px document) and site/assets was 1840x1400, which is
 * exactly the 920x700 its <img> declares at DPR 2. The README shot is taken full-height now —
 * the old crop cut the closing note off the bottom for no stated reason. */
const SHOTS = [
  { out: 'docs/img/audit-document.png', width: 1920, dpr: 1, fullPage: true },
  { out: 'site/assets/img/sample-audit.png', width: 920, dpr: 2, fullPage: false, height: 700 },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
let drifted = 0;

for (const s of SHOTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: s.width, height: s.height || 900, deviceScaleFactor: s.dpr });
  await page.goto(`${ORIGIN}/sample-audit.html`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  const buf = await page.screenshot({ fullPage: !!s.fullPage });
  await page.close();

  const before = existsSync(s.out) ? createHash('sha256').update(readFileSync(s.out)).digest('hex').slice(0, 12) : 'absent';
  const after = createHash('sha256').update(buf).digest('hex').slice(0, 12);
  // A screenshot is not byte-reproducible across runs, so identical hashes are not expected;
  // size is the honest proxy for "this is a picture of a different document".
  const sizeBefore = existsSync(s.out) ? readFileSync(s.out).length : 0;

  if (CHECK) {
    const delta = Math.abs(buf.length - sizeBefore) / Math.max(1, sizeBefore);
    const stale = delta > 0.02;
    if (stale) drifted++;
    console.log(`  ${stale ? '✗' : '✓'} ${s.out.padEnd(34)} committed ${sizeBefore} bytes, fresh ${buf.length} (${(delta * 100).toFixed(1)}% apart)`);
  } else {
    writeFileSync(s.out, buf);
    console.log(`  wrote ${s.out.padEnd(34)} ${sizeBefore} -> ${buf.length} bytes  [${before} -> ${after}]`);
  }
}

await browser.close();
if (CHECK && drifted) {
  console.log(`\n${drifted} image(s) no longer match the document — run without --check to re-shoot.`);
  process.exit(1);
}
process.exit(0);
