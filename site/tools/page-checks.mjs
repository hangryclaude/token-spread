/**
 * Page checks the three sitecraft gates cannot make, across every page of the site.
 *
 * verify / product-check / contrast-check cover console errors, layout at two viewports, and
 * composited contrast. Everything here is a property they are structurally blind to, and every
 * one of these caught a real defect on this site:
 *
 *   viewports    a 4px horizontal scroll at 320px, and the register sitting in the HUD rail's
 *                corner at 1440x700 — both invisible at the two sizes the gates sample.
 *   navigation   the hero's own link to the proof landed on an act whose heading was at
 *                opacity 0, because act-breaks does not recompute after an instant jump. No
 *                gate navigates the page, so no gate could see it.
 *   keyboard     the spend input on the live homepage had NO focus ring, and no page had any
 *                way past five repeated nav stops. No gate presses Tab.
 *   nojs         .reveal started at opacity 0 in CSS and relied on JS to bring it back, so
 *                seven sections of the live homepage were invisible without JavaScript. The
 *                text stays in the DOM, so only a picture — or this check — sees it.
 *   fonts        the page awaits document.fonts.ready before signalling __ready; a deploy that
 *                misses the fonts directory must not hang the page on that await.
 *   twin         both panes must stream byte-identical text — that claim IS the product.
 *
 * CONTRACT §: a gate is not finished until something has failed it. Every check has a control
 * that breaks the property on the live page and asserts the check reports it. `--self-test`
 * runs the controls; a check whose control passes is not a check.
 *
 * Four controls inject a real defect — an over-wide element, a suppressed focus ring, a zeroed
 * heading opacity, one character of drift between the panes. Two cannot: `nojs` runs with
 * scripting disabled and `fonts` measures a load time, so neither can be mutated from inside
 * the page, and their controls move the THRESHOLD instead. That proves the assertion arm fires
 * but not that the check detects an injected defect. Weaker, and recorded rather than hidden.
 *
 * SKIPS ARE NOT PASSES. A check that does not apply to a page reports `–` with the reason and
 * is counted separately. Silent skipping is how a suite comes to certify what it never looked
 * at — the exact fail-open pattern this file exists to avoid.
 *
 *   node site/tools/page-checks.mjs                    every page, default viewport set
 *   node site/tools/page-checks.mjs <url> [<url>…]     specific pages
 *   node site/tools/page-checks.mjs --full             15-viewport sweep instead of 8
 *   node site/tools/page-checks.mjs --self-test        run the controls
 *
 * Exit 0 = every applicable check passed. 1 = a check failed. 2 = the harness could not run,
 * which is not a pass.
 */
import { createRequire } from 'node:module';

const ARGS = process.argv.slice(2);
const SELF_TEST = ARGS.includes('--self-test');
const FULL = ARGS.includes('--full');
const ORIGIN = process.env.SITE_ORIGIN || 'http://localhost:8740';
const DEFAULT_PAGES = [
  'index-scroll.html', 'index.html', 'how.html', 'methods.html',
  'pricing.html', 'pool.html', 'sample-audit.html', '404.html',
].map((p) => `${ORIGIN}/${p}`);
const URLS = ARGS.filter((a) => !a.startsWith('--'));
const PAGES = URLS.length ? URLS : DEFAULT_PAGES;

let puppeteer;
try {
  puppeteer = createRequire('/Users/angus/skills/package.json')('puppeteer-core');
} catch {
  console.error('✗ cannot load puppeteer-core from ~/skills — harness unavailable, not a pass');
  process.exit(2);
}
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* Eight sizes rather than the full fifteen by default: the two real defects this found were at
 * 1440x700 and 320x568, so the set keeps short viewports and both extremes. --full runs all. */
const VIEWPORTS_QUICK = [[1920, 1080], [1440, 900], [1440, 700], [1024, 768], [900, 600], [390, 844], [360, 740], [320, 568]];
const VIEWPORTS_FULL = [[1920, 1080], [1600, 900], [1440, 900], [1440, 700], [1280, 800], [1180, 820],
  [1024, 768], [900, 600], [820, 1180], [768, 1024], [430, 932], [390, 844], [375, 667], [360, 740], [320, 568]];
const VIEWPORTS = FULL ? VIEWPORTS_FULL : VIEWPORTS_QUICK;

const PASS = (detail) => ({ ok: true, detail });
const FAIL = (detail) => ({ ok: false, detail });
const SKIP = (reason) => ({ skip: reason });

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
/** Not every page mounts something; a page with no __ready is settled once loaded. */
const settle = async (page) => {
  try { await page.waitForFunction(() => window.__ready === true, { timeout: 9000 }); }
  catch { /* static page — nothing declares readiness */ }
  await new Promise((r) => setTimeout(r, 350));
};

/* ── checks ──────────────────────────────────────────────────────────────────────────────── */

/** Overlap pairs are page-specific; the count actually checked is reported so a green line
 *  never implies more coverage than it had. */
const PAIRS = [
  ['#hero-marquee', '#h1', 'ticker overlaps the headline'],
  ['.reg', '.hud-rail', 'register overlaps the rail'],
  ['.reg', '.hero-sub', 'register overlaps the lede'],
  ['.hero-act-note', '.hud-rail', 'note overlaps the rail'],
];

async function checkViewports(browser, url, breakIt) {
  const bad = [];
  let pairsPresent = 0;
  for (const [w, h] of VIEWPORTS) {
    const page = await newPage(browser, { width: w, height: h });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await settle(page);
    if (breakIt) {
      await page.evaluate(() => {
        const d = document.createElement('div');
        d.style.cssText = 'width:120vw;height:4px';
        (document.querySelector('main') || document.body).appendChild(d);
      });
      await new Promise((r) => setTimeout(r, 120));
    }
    const r = await page.evaluate((pairs) => {
      const R = (s) => { const e = document.querySelector(s); if (!e) return null;
        const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
      const hits = [], present = [];
      for (const [a, c, msg] of pairs) {
        const A = R(a), C = R(c);
        if (!A || !C) continue;
        present.push(msg);
        if (Math.min(A.r, C.r) - Math.max(A.l, C.l) > 0 && Math.min(A.b, C.b) - Math.max(A.t, C.t) > 0) hits.push(msg);
      }
      return { hscroll: Math.round(document.documentElement.scrollWidth - innerWidth), hits, present: present.length };
    }, PAIRS);
    pairsPresent = Math.max(pairsPresent, r.present);
    const issues = [r.hscroll > 0 && `${r.hscroll}px horizontal scroll`, ...r.hits].filter(Boolean);
    if (issues.length) bad.push(`${w}x${h}: ${issues.join(', ')}`);
    await page.close();
  }
  const scope = `${VIEWPORTS.length} viewports, h-scroll + ${pairsPresent}/${PAIRS.length} overlap pairs present here`;
  return bad.length ? FAIL(`${bad.join(' · ')} [${scope}]`) : PASS(`clear — ${scope}`);
}

/** Every way a visitor can arrive at a section must leave its heading painted. */
async function checkNavigation(browser, url, breakIt) {
  const probe = await newPage(browser);
  await probe.goto(url, { waitUntil: 'networkidle0' });
  await settle(probe);
  const shape = await probe.evaluate(() => ({
    acts: [...document.querySelectorAll('main > section[id]')].filter((s) => s.querySelector('h2')).map((s) => s.id),
    heroLink: !!document.querySelector('.hero-act a[href^="#"]'),
    chips: document.querySelectorAll('#hud button').length,
  }));
  await probe.close();
  if (!shape.acts.length) return SKIP('no id-bearing <section> with an h2 to navigate to');

  const bad = [];
  const opacityOf = (page, id) => page.evaluate((i) => {
    const a = document.getElementById(i);
    const o = (n) => (n ? Number(getComputedStyle(n).opacity) : 1);
    return Math.min(o(a.querySelector('h2')), o(a.querySelector('.eyebrow')));
  }, id);

  for (const id of shape.acts.slice(0, 3)) {
    const page = await newPage(browser, { width: 390, height: 844 });
    await page.goto(`${url}#${id}`, { waitUntil: 'networkidle0' });
    await settle(page);
    if (breakIt) await page.evaluate((i) => { document.getElementById(i).querySelector('h2').style.opacity = '0'; }, id);
    await new Promise((r) => setTimeout(r, 1300));
    const o = await opacityOf(page, id);
    if (o < 0.9) bad.push(`deep link #${id} arrived at opacity ${o.toFixed(2)}`);
    await page.close();
  }
  if (shape.heroLink) {
    for (const reduced of [false, true]) {
      const page = await newPage(browser, { width: 390, height: 844, reduced });
      await page.goto(url, { waitUntil: 'networkidle0' });
      await settle(page);
      const target = await page.evaluate(() => {
        const a = document.querySelector('.hero-act a[href^="#"]'); a.click(); return a.getAttribute('href').slice(1);
      });
      await new Promise((r) => setTimeout(r, 1300));
      const o = await opacityOf(page, target);
      if (o < 0.9) bad.push(`hero link (${reduced ? 'reduced' : 'normal'}) arrived at opacity ${o.toFixed(2)}`);
      await page.close();
    }
  }
  if (shape.chips > 1) {
    const page = await newPage(browser, { width: 390, height: 844, reduced: true });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await settle(page);
    const chips = await page.$$('#hud button');
    for (let i = 1; i < chips.length; i++) {
      await chips[i].click();
      await new Promise((r) => setTimeout(r, 850));
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
  const scope = `${Math.min(3, shape.acts.length)} deep links${shape.heroLink ? ', hero link x2' : ''}${shape.chips > 1 ? `, ${shape.chips - 1} chips` : ''}`;
  return bad.length ? FAIL(bad.join(' · ')) : PASS(`all land painted — ${scope}`);
}

async function checkKeyboard(browser, url, breakIt) {
  const page = await newPage(browser);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await settle(page);
  if (breakIt) {
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = 'a:focus-visible,button:focus-visible,input:focus-visible{outline:none !important}';
      document.head.appendChild(s);
    });
  }
  const bad = [];
  let first = null, stops = 0;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().split(' ')[0],
               ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0,
               label: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 26) };
    });
    if (!r) break;
    stops++;
    if (i === 0) first = r;
    if (!r.ring) bad.push(`no focus ring on <${r.tag}> "${r.label}"`);
  }
  if (!stops) { await page.close(); return SKIP('no focusable elements on this page'); }

  if (first.cls !== 'skip') {
    bad.push('the first focus stop is not a skip link');
  } else {
    await page.evaluate(() => { document.activeElement.blur?.(); window.scrollTo(0, 0); });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 400));
    const landed = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    // A fragment link only moves focus to something focusable; without that the next Tab
    // returns to the very nav the link exists to bypass.
    if (!landed || landed === 'BODY') bad.push('skip link left focus on <body>, so Tab returns to the chrome');
  }
  await page.close();
  return bad.length ? FAIL([...new Set(bad)].join(' · ')) : PASS(`${stops} stops, all ringed; skip link first and moves focus`);
}

async function checkNoJs(browser, url, breakIt) {
  const page = await newPage(browser, { js: false });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  const r = await page.evaluate(() => ({
    words: (document.body.innerText || '').trim().split(/\s+/).filter(Boolean).length,
    hidden: [...document.querySelectorAll('body *')]
      .filter((e) => Number(getComputedStyle(e).opacity) < 0.05 && e.textContent.trim().length > 10).length,
    headings: [...document.querySelectorAll('h1,h2')].filter((e) => getComputedStyle(e).opacity !== '0').length,
    total: document.querySelectorAll('h1,h2').length,
    twinChars: document.querySelector('[data-twin-out]')?.textContent.trim().length ?? null,
    meter: document.querySelector('[data-twin-cost]')?.textContent ?? null,
  }));
  await page.close();
  const bad = [];
  // With scripting off the control cannot inject; it moves the threshold instead.
  if (r.words < (breakIt ? 1e6 : 40)) bad.push(`only ${r.words} words readable`);
  if (r.hidden > 0) bad.push(`${r.hidden} element(s) with copy at opacity 0`);
  if (r.headings !== r.total) bad.push(`${r.total - r.headings} of ${r.total} headings unpainted`);
  if (r.twinChars !== null && r.twinChars < 200) bad.push(`terminal ships ${r.twinChars} chars`);
  if (r.meter !== null && !/^\$\d/.test(r.meter)) bad.push(`meter reads "${r.meter}"`);
  return bad.length ? FAIL(bad.join(' · '))
    : PASS(`${r.words} words, ${r.headings}/${r.total} headings, 0 hidden${r.twinChars !== null ? `, terminal ${r.twinChars} chars at ${r.meter}` : ''}`);
}

/**
 * Console errors, uncaught exceptions and failed requests.
 *
 * verify.mjs already asserts all three — but it asserts them AFTER waiting for window.__ready,
 * and it exits on the timeout without ever reaching them. sample-audit.html has zero <script>
 * tags on purpose, because the product's claim about the audit is that it is one static file that
 * opens offline. So it can never set the flag, gate 1 never gets past the wait, and nothing in
 * this harness was checking the deliverable for a broken asset or a page error. Measured
 * 2026-08-12: gate 1 returns NOT_READY on that page and always has.
 *
 * Adding the flag to the document would satisfy the gate by contradicting the thing the document
 * is supposed to demonstrate. Checking the property directly, with no readiness handshake, works
 * on every page including the script-free one.
 */
async function checkConsole(browser, url, breakIt) {
  const page = await newPage(browser);
  const errs = [], bad = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 80)); });
  page.on('pageerror', (e) => errs.push(`uncaught ${e.message.slice(0, 70)}`));
  page.on('requestfailed', (r) => bad.push(`${r.failure()?.errorText ?? 'failed'} ${r.url().split('/').pop()}`));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().split('/').pop()}`); });

  await page.goto(url, { waitUntil: 'networkidle0' });
  // Puppeteer evaluates in a page with no scripts of its own, so the control works everywhere.
  if (breakIt) await page.evaluate(() => { console.error('control'); return fetch('/control-404').catch(() => {}); });
  await new Promise((r) => setTimeout(r, 800));
  await page.close();

  const all = [...errs, ...bad];
  return all.length ? FAIL(all.slice(0, 3).join(' · ') + (all.length > 3 ? ` (+${all.length - 3} more)` : ''))
    : PASS('no console errors, no failed requests');
}

async function checkFonts(browser, url, breakIt) {
  const page = await newPage(browser, { blockFonts: true });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'networkidle0' });
  const loadMs = Date.now() - t0;
  let declared = true;
  try { await page.waitForFunction(() => window.__ready === true, { timeout: 9000 }); } catch { declared = false; }
  // A page that never declares readiness is settled once loaded, so timing it to the END of the
  // wait measures the timeout rather than the page. sample-audit.html has zero <script> tags on
  // purpose and this check reported it as a 9988ms load — the instrument was wrong, not the page.
  const ms = declared ? Date.now() - t0 : loadMs;
  const r = await page.evaluate(() => ({
    hscroll: Math.round(document.documentElement.scrollWidth - innerWidth),
    hasReady: typeof window.__ready !== 'undefined',
  }));
  await page.close();
  const bad = [];
  if (r.hasReady && !declared) bad.push('window.__ready never became true with the fonts blocked');
  if (ms > (breakIt ? 1 : 9000)) bad.push(`ready took ${ms}ms`);
  if (r.hscroll > 0) bad.push(`${r.hscroll}px horizontal scroll on fallback metrics`);
  return bad.length ? FAIL(bad.join(' · '))
    : PASS(`${ms}ms on fallback fonts, no overflow${r.hasReady ? '' : ' (static page, no __ready)'}`);
}

async function checkTwin(browser, url, breakIt) {
  const page = await newPage(browser);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await settle(page);
  const present = await page.evaluate(() => document.querySelectorAll('[data-twin-out]').length);
  if (present < 2) { await page.close(); return SKIP('no twin terminals on this page'); }
  await page.evaluate(() => document.querySelector('[data-twin]').scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 5200));
  if (breakIt) await page.evaluate(() => { document.querySelectorAll('[data-twin-out]')[1].textContent += ' '; });
  const r = await page.evaluate(() => {
    const panes = [...document.querySelectorAll('[data-twin-out]')].map((x) => x.textContent);
    return { identical: panes[0] === panes[1], len: panes[0].length,
             meters: [...document.querySelectorAll('[data-twin-cost]')].map((m) => m.textContent) };
  });
  await page.close();
  const bad = [];
  if (!r.identical) bad.push('the two panes are NOT byte-identical');
  if (r.len < 200) bad.push(`panes hold ${r.len} chars`);
  if (r.meters[0] !== '$0.2075' || r.meters[1] !== '$0.0275') bad.push(`meters read ${r.meters.join(' / ')}`);
  return bad.length ? FAIL(bad.join(' · ')) : PASS(`byte-identical, ${r.len} chars, ${r.meters.join(' against ')}`);
}

/* ── run ─────────────────────────────────────────────────────────────────────────────────── */

const CHECKS = [
  ['viewports', checkViewports], ['navigation', checkNavigation], ['keyboard', checkKeyboard],
  ['nojs', checkNoJs], ['fonts', checkFonts], ['twin', checkTwin], ['console', checkConsole],
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
let failed = 0, passed = 0, skipped = 0, controlsMissed = 0;

if (SELF_TEST) {
  // One page is enough to prove a check CAN fail; the controls are page-independent.
  const url = PAGES[0];
  console.log(`self-test on ${url}\neach control breaks the property; the check must report it\n`);
  for (const [name, fn] of CHECKS) {
    let r;
    try { r = await fn(browser, url, true); } catch (e) { r = FAIL(`threw: ${e.message.slice(0, 50)}`); }
    const caught = r.ok === false;
    if (r.skip) { console.log(`  – ${name.padEnd(11)} not applicable here, control not exercised`); skipped++; continue; }
    if (!caught) controlsMissed++;
    console.log(`  ${caught ? '✓' : '✗'} ${name.padEnd(11)} ${caught ? 'caught the control' : 'CONTROL PASSED — this check cannot fail'}`);
  }
  console.log(controlsMissed ? `\n${controlsMissed} check(s) cannot fail and are worthless`
    : `\nevery exercised control was caught${skipped ? `; ${skipped} not applicable on this page` : ''}`);
  await browser.close();
  process.exit(controlsMissed ? 1 : 0);
}

console.log(`page checks — ${PAGES.length} page(s), ${VIEWPORTS.length} viewports${FULL ? ' (full sweep)' : ''}\n`);
for (const url of PAGES) {
  console.log(url.replace(`${ORIGIN}/`, ''));
  for (const [name, fn] of CHECKS) {
    let r;
    try { r = await fn(browser, url, false); } catch (e) { r = FAIL(`threw: ${e.message.slice(0, 70)}`); }
    if (r.skip) { skipped++; console.log(`  – ${name.padEnd(11)} SKIPPED: ${r.skip}`); continue; }
    if (r.ok) passed++; else failed++;
    console.log(`  ${r.ok ? '✓' : '✗'} ${name.padEnd(11)} ${r.detail}`);
  }
  console.log('');
}
console.log(`${passed} passed · ${skipped} skipped · ${failed} failed`);
if (skipped) console.log(`skips are NOT passes — ${skipped} property/page pair(s) went unchecked, listed above with why.`);
console.log(`not covered anywhere: real-device touch, a real screen reader, real-GPU performance,`);
console.log(`and anything a human has to judge.`);

await browser.close();
process.exit(failed ? 1 : 0);
