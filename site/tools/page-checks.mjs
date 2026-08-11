/**
 * Page checks the three sitecraft gates cannot make.
 *
 * verify / product-check / contrast-check cover console errors, layout at two viewports, and
 * composited contrast. Everything here is a property they are structurally blind to, and every
 * one of these caught a real defect on this page:
 *
 *   viewports    a 4px horizontal scroll at 320px, and the register sitting in the HUD rail's
 *                corner at 1440x700 — both invisible at the two sizes the gates sample.
 *   navigation   the hero's own link to the proof landed on an act whose heading was at
 *                opacity 0, because act-breaks does not recompute after an instant jump. No
 *                gate navigates the page, so no gate could see it.
 *   keyboard     seven chrome stops before any content, with no way past. No gate tabs.
 *   nojs         text hidden by JS is only safe if JS failing leaves it visible.
 *   fonts        the page awaits document.fonts.ready before signalling __ready; a deploy that
 *                misses the fonts directory must not hang the page on that await.
 *   twin         both panes must stream byte-identical text — that claim IS the product.
 *
 * CONTRACT §: a gate is not finished until something has failed it. Every check below has a
 * control that breaks the property on the live page and asserts the check reports it. Run
 * `--self-test` to execute the controls; a check whose control passes is not a check.
 *
 * Four of the six controls inject a real defect — an over-wide element, a suppressed focus
 * ring, a zeroed heading opacity, one character of drift between the panes. Two cannot:
 * `nojs` runs with scripting disabled and `fonts` measures a load time, so neither can be
 * mutated from inside the page. Their controls move the THRESHOLD instead, which proves the
 * assertion arm fires but not that the check detects an injected defect. That is weaker, and
 * it is recorded here rather than left for a reader to discover.
 *
 *   node site/tools/page-checks.mjs http://localhost:8740/index-scroll.html
 *   node site/tools/page-checks.mjs <url> --self-test
 *
 * Exit 0 = every check passed. 1 = a check failed. 2 = the harness could not run, which is
 * not a pass.
 */
import { createRequire } from 'node:module';

const URL_ARG = process.argv[2];
const SELF_TEST = process.argv.includes('--self-test');
if (!URL_ARG) {
  console.error('usage: page-checks.mjs <url> [--self-test]');
  process.exit(2);
}

/* Resolved the way the sitecraft gates resolve it — this machine keeps puppeteer-core in
 * ~/skills rather than in this repo, so there is nothing to install here. */
let puppeteer;
try {
  puppeteer = createRequire('/Users/angus/skills/package.json')('puppeteer-core');
} catch {
  console.error('✗ cannot load puppeteer-core from ~/skills — harness unavailable, not a pass');
  process.exit(2);
}
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const VIEWPORTS = [
  [1920, 1080], [1600, 900], [1440, 900], [1440, 700], [1280, 800], [1180, 820],
  [1024, 768], [900, 600], [820, 1180], [768, 1024], [430, 932], [390, 844],
  [375, 667], [360, 740], [320, 568],
];

/** Rect helpers injected into the page. Kept in one string so every check overlaps identically. */
const RECTS = `
  const R = (s) => { const e = document.querySelector(s); if (!e) return null;
    const b = e.getBoundingClientRect();
    return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const OV = (a, c) => !!a && !!c && Math.min(a.r, c.r) - Math.max(a.l, c.l) > 0
                                  && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 0;
`;

const ready = async (page) => page.waitForFunction(() => window.__ready === true, { timeout: 15000 });

async function newPage(browser, { width = 1440, height = 900, reduced = false, js = true, blockFonts = false } = {}) {
  const page = await browser.newPage();
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (!js) await page.setJavaScriptEnabled(false);
  if (blockFonts) {
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().includes('/fonts/') ? r.abort() : r.continue()));
  }
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  return page;
}

/* ── the checks ──────────────────────────────────────────────────────────────────────────── */

async function checkViewports(browser, breakIt) {
  const bad = [];
  for (const [w, h] of VIEWPORTS) {
    const page = await newPage(browser, { width: w, height: h });
    await page.goto(URL_ARG, { waitUntil: 'networkidle0' });
    await ready(page);
    if (breakIt) {
      // CONTROL: one element wider than the viewport is the exact defect found at 320px.
      await page.evaluate(() => {
        const d = document.createElement('div');
        d.style.cssText = 'width:120vw;height:4px';
        document.querySelector('main').appendChild(d);
      });
      await new Promise((r) => setTimeout(r, 120));
    }
    const r = await page.evaluate(`(() => { ${RECTS}
      return {
        hscroll: Math.round(document.documentElement.scrollWidth - innerWidth),
        tickerVsH1: OV(R('#hero-marquee'), R('#h1')),
        regVsRail:  OV(R('.reg'), R('.hud-rail')),
        regVsLede:  OV(R('.reg'), R('.hero-sub')),
        noteVsRail: OV(R('.hero-act-note'), R('.hud-rail')),
      }; })()`);
    const issues = [
      r.hscroll > 0 && `${r.hscroll}px horizontal scroll`,
      r.tickerVsH1 && 'ticker overlaps the headline',
      r.regVsRail && 'register overlaps the rail',
      r.regVsLede && 'register overlaps the lede',
      r.noteVsRail && 'note overlaps the rail',
    ].filter(Boolean);
    if (issues.length) bad.push(`${w}x${h}: ${issues.join(', ')}`);
    await page.close();
  }
  return { ok: bad.length === 0, detail: bad.length ? bad.join(' · ') : `${VIEWPORTS.length} viewports clear` };
}

/**
 * Every way a visitor can arrive at an act must leave its heading painted.
 *
 * act-breaks bounds its per-frame rect reads with an IntersectionObserver and its loop
 * early-returns when scrollY is unchanged, so an INSTANT jump leaves elements that just came on
 * screen holding the opacity they had while far below. Smooth scrolling never reaches it.
 */
async function checkNavigation(browser, breakIt) {
  const bad = [];
  const headingOpacity = (page, id) => page.evaluate((i) => {
    const a = document.getElementById(i);
    const o = (n) => (n ? Number(getComputedStyle(n).opacity) : 1);
    return Math.min(o(a.querySelector('h2')), o(a.querySelector('.eyebrow')));
  }, id);

  // 1 · a shared deep link, where the hash is present at load and hashchange never fires
  for (const id of ['act-twin', 'act-bar', 'act-close']) {
    const page = await newPage(browser, { width: 390, height: 844 });
    await page.goto(`${URL_ARG}#${id}`, { waitUntil: 'networkidle0' });
    await ready(page);
    if (breakIt) await page.evaluate((i) => { document.getElementById(i).querySelector('h2').style.opacity = '0'; }, id);
    await new Promise((r) => setTimeout(r, 1400));
    const o = await headingOpacity(page, id);
    if (o < 0.9) bad.push(`deep link #${id} arrived at opacity ${o.toFixed(2)}`);
    await page.close();
  }

  // 2 · the hero's own fragment link, under both motion preferences
  for (const reduced of [false, true]) {
    const page = await newPage(browser, { width: 390, height: 844, reduced });
    await page.goto(URL_ARG, { waitUntil: 'networkidle0' });
    await ready(page);
    await page.evaluate(() => document.querySelector('.hero-act a').click());
    await new Promise((r) => setTimeout(r, 1400));
    const o = await headingOpacity(page, 'act-twin');
    if (o < 0.9) bad.push(`hero link (${reduced ? 'reduced' : 'normal'} motion) arrived at opacity ${o.toFixed(2)}`);
    await page.close();
  }

  // 3 · every HUD chip under reduced motion, where the jump is instant by design
  {
    const page = await newPage(browser, { width: 390, height: 844, reduced: true });
    await page.goto(URL_ARG, { waitUntil: 'networkidle0' });
    await ready(page);
    const chips = await page.$$('#hud button');
    for (let i = 1; i < chips.length; i++) {
      await chips[i].click();
      await new Promise((r) => setTimeout(r, 900));
      const o = await page.evaluate(() => {
        const a = [...document.querySelectorAll('main > section')]
          .find((s) => { const b = s.getBoundingClientRect(); return b.top <= 6 && b.bottom > 120; });
        if (!a) return 1;
        const g = (n) => (n ? Number(getComputedStyle(n).opacity) : 1);
        return Math.min(g(a.querySelector('h2')), g(a.querySelector('.eyebrow')));
      });
      if (o < 0.9) bad.push(`HUD chip ${i + 1} arrived at opacity ${o.toFixed(2)}`);
    }
    await page.close();
  }
  return { ok: bad.length === 0, detail: bad.length ? bad.join(' · ') : 'deep links, hero link and 5 chips all land painted' };
}

async function checkKeyboard(browser, breakIt) {
  const page = await newPage(browser);
  await page.goto(URL_ARG, { waitUntil: 'networkidle0' });
  await ready(page);
  if (breakIt) {
    // CONTROL: a focusable with no visible ring is the thing this check exists to find.
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '#hud button:focus-visible{outline:none !important}';
      document.head.appendChild(s);
    });
  }
  const bad = [];
  let first = null;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().split(' ')[0],
               ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0,
               label: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30) };
    });
    if (!r) break;
    if (i === 0) first = r;
    if (!r.ring) bad.push(`no focus ring on <${r.tag}> "${r.label}"`);
  }
  if (!first || first.cls !== 'skip') bad.push('the first focus stop is not the skip link');

  // The skip link must MOVE FOCUS, not merely scroll — a fragment link only focuses a target
  // that is focusable, and without that the next Tab returns to the chrome it just bypassed.
  await page.evaluate(() => { document.activeElement.blur?.(); window.scrollTo(0, 0); });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 400));
  const landed = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  if (landed !== 'act-hero') bad.push(`skip link left focus on ${landed}, so Tab returns to the chrome`);
  await page.close();
  return { ok: bad.length === 0, detail: bad.length ? bad.join(' · ') : 'every stop has a ring; skip link is first and moves focus' };
}

async function checkNoJs(browser, breakIt) {
  const page = await newPage(browser, { js: false });
  await page.goto(URL_ARG, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  const r = await page.evaluate(() => ({
    words: (document.body.innerText || '').trim().split(/\s+/).length,
    headings: [...document.querySelectorAll('h1,h2')].filter((e) => getComputedStyle(e).opacity !== '0').length,
    totalHeadings: document.querySelectorAll('h1,h2').length,
    twinChars: document.querySelector('[data-twin-out]')?.textContent.trim().length ?? 0,
    meter: document.querySelector('[data-twin-cost]')?.textContent ?? '',
    cta: !!document.querySelector('#close-cta a'),
  }));
  const bad = [];
  // With JS off the control cannot inject; assert against a threshold the real page clears.
  const wordFloor = breakIt ? 100000 : 400;
  if (r.words < wordFloor) bad.push(`only ${r.words} words readable`);
  if (r.headings !== r.totalHeadings) bad.push(`${r.totalHeadings - r.headings} of ${r.totalHeadings} headings unpainted`);
  if (r.twinChars < 200) bad.push(`terminal ships ${r.twinChars} chars`);
  if (!/^\$\d/.test(r.meter)) bad.push(`meter reads "${r.meter}"`);
  if (!r.cta) bad.push('no CTA');
  await page.close();
  return { ok: bad.length === 0, detail: bad.length ? bad.join(' · ')
    : `${r.words} words, ${r.headings}/${r.totalHeadings} headings, terminal ${r.twinChars} chars at ${r.meter}` };
}

async function checkFonts(browser, breakIt) {
  const page = await newPage(browser, { blockFonts: true });
  const t0 = Date.now();
  await page.goto(URL_ARG, { waitUntil: 'networkidle0' });
  let ok = true;
  try { await ready(page); } catch { ok = false; }
  const ms = Date.now() - t0;
  const hscroll = ok ? await page.evaluate(() => Math.round(document.documentElement.scrollWidth - innerWidth)) : 0;
  await page.close();
  // CONTROL: assert against an impossible budget to prove the timing arm can fail.
  const budget = breakIt ? 1 : 9000;
  const bad = [];
  if (!ok) bad.push('window.__ready never became true with the fonts blocked');
  if (ms > budget) bad.push(`ready took ${ms}ms, over the ${budget}ms budget`);
  if (hscroll > 0) bad.push(`${hscroll}px horizontal scroll on fallback metrics`);
  return { ok: bad.length === 0, detail: bad.length ? bad.join(' · ') : `ready in ${ms}ms on fallback fonts, no overflow` };
}

/** Both panes must stream byte-identical text. That claim is the product, not a detail. */
async function checkTwin(browser, breakIt) {
  const page = await newPage(browser);
  await page.goto(URL_ARG, { waitUntil: 'networkidle0' });
  await ready(page);
  await page.evaluate(() => document.querySelector('#act-twin').scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 5200));
  if (breakIt) {
    // CONTROL: one character of drift between the panes must fail this.
    await page.evaluate(() => { document.querySelectorAll('[data-twin-out]')[1].textContent += ' '; });
  }
  const r = await page.evaluate(() => {
    const panes = [...document.querySelectorAll('[data-twin-out]')].map((x) => x.textContent);
    const meters = [...document.querySelectorAll('[data-twin-cost]')].map((m) => m.textContent);
    return { identical: panes[0] === panes[1], len: panes[0].length, meters };
  });
  const bad = [];
  if (!r.identical) bad.push('the two panes are NOT byte-identical');
  if (r.len < 200) bad.push(`panes hold ${r.len} chars`);
  if (r.meters[0] !== '$0.2075' || r.meters[1] !== '$0.0275') bad.push(`meters read ${r.meters.join(' / ')}`);
  await page.close();
  return { ok: bad.length === 0, detail: bad.length ? bad.join(' · ') : `byte-identical, ${r.len} chars, ${r.meters.join(' against ')}` };
}

/* ── run ─────────────────────────────────────────────────────────────────────────────────── */

const CHECKS = [
  ['viewports', checkViewports],
  ['navigation', checkNavigation],
  ['keyboard', checkKeyboard],
  ['nojs', checkNoJs],
  ['fonts', checkFonts],
  ['twin', checkTwin],
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
let failed = 0;

if (SELF_TEST) {
  console.log(`self-test — each control breaks the property and the check must report it\n`);
  for (const [name, fn] of CHECKS) {
    let r;
    try { r = await fn(browser, true); } catch (e) { r = { ok: false, detail: `threw: ${e.message.slice(0, 60)}` }; }
    // A control that still passes means the check cannot fail, which means it is not a check.
    const good = !r.ok;
    if (!good) failed++;
    console.log(`  ${good ? '✓' : '✗'} ${name.padEnd(11)} ${good ? 'caught the control' : 'CONTROL PASSED — this check cannot fail'}`);
  }
  console.log(`\n${failed ? `${failed} check(s) cannot fail and are worthless` : 'every check caught its control'}`);
} else {
  console.log(`page checks — ${URL_ARG}\n`);
  for (const [name, fn] of CHECKS) {
    let r;
    try { r = await fn(browser, false); } catch (e) { r = { ok: false, detail: `threw: ${e.message.slice(0, 80)}` }; }
    if (!r.ok) failed++;
    console.log(`  ${r.ok ? '✓' : '✗'} ${name.padEnd(11)} ${r.detail}`);
  }
  console.log(`\nwhat this does NOT cover: real-device touch, a real screen reader, real-GPU`);
  console.log(`performance, and anything a human has to judge. ${failed ? `${failed} check(s) FAILED.` : 'All checks passed.'}`);
}

await browser.close();
process.exit(failed ? 1 : 0);
