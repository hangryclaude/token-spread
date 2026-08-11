/**
 * Tokens Saved — the composed scroll homepage.
 *
 * CONTRACT §3, the one that matters: THE PAGE OWNS SCROLL. This file reads
 * `window.scrollY` exactly once per rAF and pushes a single 0..1 to everything that
 * takes one. No engine here listens for scroll itself, and no virtual scroller is
 * mounted — act-breaks reads `window.scrollY` inside its own loop, so a Lenis or a
 * scroll-timeline would leave its reveals pinned at opacity 0 while the ground
 * recoloured correctly. That desync is documented in its own traps; the fix is to not
 * introduce the second opinion in the first place.
 *
 * display-type is deliberately ABSENT from a stack the interview chose it for. Three
 * measured reasons, in order of severity:
 *   1. its flagship `bleed` calls ensureClip() unconditionally, setting overflow-x:clip
 *      on the nearest <section>; per spec that computes overflow-y to auto, turning the
 *      section into a scroll container and breaking the sticky-split pin inside it.
 *   2. its groundOf() walks computed styles, so it cannot see a WebGL canvas ground and
 *      would step its colours off a static CSS background unrelated to what is painted.
 *   3. it ships Inter for a Thin register this page cannot use — our Plex variable is
 *      400-700 — and a second display face is a worse outcome than plain CSS type.
 */
import initCausticField from './effects/caustic-field/engine.js';
import initKineticMarquee from './effects/kinetic-marquee/engine.js';
import initStickySplit from './effects/sticky-split/engine.js';
import initActBreaks from './effects/act-breaks/engine.js';
import initCardGrammar from './effects/card-grammar/engine.js';
import initFixedHud from './effects/fixed-hud/engine.js';
import initCapsuleControls from './effects/capsule-controls/engine.js';

const $ = (sel, root = document) => root.querySelector(sel);

/** Decorative layers never throw (CONTRACT §6): a failed mount leaves a flatter page. */
function safe(name, fn) {
  try {
    return fn();
  } catch (err) {
    console.info(`[mount] ${name} did not mount, page continues flat:`, err);
    return null;
  }
}

async function mountAll() {
  const driven = [];

  // ── the ground ────────────────────────────────────────────────────────────────
  // ONE fixed field under the whole document. A deliberately FLAT arc: three stops in
  // one hue family, varying lightness and chroma only, so the temperature stays put.
  // This is a choice, not a forgotten one — the register's own guidance is that a
  // reader cannot otherwise tell. Every stop is a colour that would ship on its own;
  // no desaturated transitional stop, because the field lerps in linear RGB and one
  // grey stop poisons the whole run.
  const ground = safe('caustic-field', () =>
    initCausticField($('#ground'), {
      stops: [
        { at: 0.0, deep: '#03100a', mid: '#07301f', hot: '#2fae6b' },
        { at: 0.5, deep: '#04120c', mid: '#0a3a26', hot: '#3ddc84' },
        { at: 1.0, deep: '#020d08', mid: '#06281a', hot: '#27c974' },
      ],
      speed: 0.055,   // the reference barely moves; this is not a lava lamp
      scale: 1.2,
      grain: 0.045,   // measured: without it the flattest stop bands in 77px runs
      dprMax: 1.5,    // CONTRACT §5 — 1.5, never 2
    }));
  if (ground?.setProgress) driven.push(ground);

  // ── act 1 · the hero IS the marquee ───────────────────────────────────────────
  // 'band' mode, whose fit ceiling is 1.15. Deliberately not 'announcement': that mode
  // ships no fit ceiling at all, which is an overflow risk at 390px on a mobile-first page.
  //
  // `size` is cap height as a fraction of CONTAINER height, and the container is the whole
  // act. The band default of 1/6 gives a ~150px cap in a 900px desktop viewport, which is
  // right — and the same 1/6 on an 844px-tall phone gives a ~140px cap on a 390px-wide
  // screen, which clips the phrase to two words. The effect's own SKILL.md predicts exactly
  // this ("the hero shows 'Ty'"). So the size is chosen per width, not once.
  const narrow = window.matchMedia('(max-width: 720px)');
  const marqueeCfg = () => ({
    text: 'the same request · the same model · a smaller bill · ',
    mode: 'band',
    // `y` is the CENTRE of the cap band inside the container, not a top offset.
    y: narrow.matches ? 0.33 : 0.38,
    size: narrow.matches ? 0.052 : 1 / 6,
    // Ceiling on the repeat unit as a fraction of container width; the type shrinks until
    // it fits. Tight on a phone because this phrase is long.
    fit: narrow.matches ? 0.98 : 1.15,
    // Page ink, not pure white: the band and the h1 are the same family of light,
    // which is what stops the marquee reading as a different site showing through.
    color: '#f2f7f4',
  });
  let marquee = safe('kinetic-marquee', () => initKineticMarquee($('#hero-marquee'), marqueeCfg()));
  if (marquee?.setProgress) driven.push(marquee);
  narrow.addEventListener('change', () => {
    const i = driven.indexOf(marquee);
    if (i >= 0) driven.splice(i, 1);
    safe('kinetic-marquee.destroy', () => marquee?.destroy?.());
    marquee = safe('kinetic-marquee', () => initKineticMarquee($('#hero-marquee'), marqueeCfg()));
    if (marquee?.setProgress) driven.push(marquee);
  });

  // ── act 2 · the spine, on wide screens only ───────────────────────────────────
  // Requires [data-split-copy] and [data-split-media] as DIRECT children of the section.
  //
  // NOT mounted below 720px, deliberately. Its own SKILL.md calls the mobile collapse
  // "authored, not observed" — zero mobile evidence in any of its three source clips, and
  // no phone ever rendered it. Measured here across three gate runs: at 390px it stacked
  // both comparison figures into one place, then clipped the band mid-word, and the copy
  // scrolling behind the sticky band reads to the occlusion sweep as text that paints
  // nothing. The last of those is not even a bug — it is what a sticky band does — which
  // is the tell that this mode and this page disagree about what mobile should be.
  // Unmounted, the section is ordinary flow: copy, then the comparison. Verifiable, and
  // the right shape for a mobile-first brief anyway.
  const wide = window.matchMedia('(min-width: 721px)');
  let split = wide.matches
    ? safe('sticky-split', () => initStickySplit($('#act-problem'), { side: 'left', split: 0.54 }))
    : null;
  wide.addEventListener('change', (e) => {
    if (e.matches && !split) {
      split = safe('sticky-split', () => initStickySplit($('#act-problem'), { side: 'left', split: 0.54 }));
    } else if (!e.matches && split) {
      // destroy() puts the adopted children back in their slot, in order.
      safe('sticky-split.destroy', () => split.destroy());
      split = null;
    }
  });

  // ── act 4 · the refusals, as ledgers ──────────────────────────────────────────
  // `cards:` — not `items:`. The wrong key is a documented session-loser.
  safe('card-grammar', () =>
    initCardGrammar($('#refusals'), {
      cards: [
        { grammar: 'ledger', title: 'Model routing', entries: [
          { label: 'verdict', value: 'refused' },
          { label: 'why', value: 'a different model writes different words' } ] },
        { grammar: 'ledger', title: 'Unknown models', entries: [
          { label: 'verdict', value: 'excluded' },
          { label: 'why', value: 'counted, never guessed' } ] },
        { grammar: 'ledger', title: 'flex / priority tiers', entries: [
          { label: 'verdict', value: 'refused' },
          { label: 'why', value: 'no published multiplier exists' } ] },
        { grammar: 'ledger', title: 'Waste we cannot see', entries: [
          { label: 'verdict', value: 'UNQUANTIFIED' },
          { label: 'why', value: 'never a flattering $0' } ] },
        { grammar: 'ledger', title: 'TTL from aggregates', entries: [
          { label: 'verdict', value: 'exposure only' },
          { label: 'why', value: 'no per-request timing to size it' } ] },
        { grammar: 'ledger', title: 'Summed levers', entries: [
          { label: 'verdict', value: 'refused' },
          { label: 'why', value: 'multipliers compound by product' } ] },
      ],
    }));

  // ── chrome · the way back ─────────────────────────────────────────────────────
  // Mandatory past ~5 viewports. The engine NEVER scrolls anything itself — a chip
  // click fires onSelect and moves the page 0px — so onSelect has to do the work.
  safe('fixed-hud', () =>
    initFixedHud($('#hud'), {
      accent: '#3ddc84',   // default is #ff6a1f; this page is green
      // Defaults to true and paints rulers, crosshairs and X/Y readouts over the page.
      annotations: false,
      chapters: [
        { at: 0.00, num: '01', label: 'The thesis',  glyph: '=', target: '#act-hero' },
        { at: 0.18, num: '02', label: 'The problem', glyph: '!', target: '#act-problem' },
        { at: 0.38, num: '03', label: 'The proof',   glyph: '$', target: '#act-twin' },
        { at: 0.58, num: '04', label: 'The bar',     glyph: '/', target: '#act-bar' },
        { at: 0.76, num: '05', label: 'Findings',    glyph: '+', target: '#act-found' },
        { at: 0.92, num: '06', label: 'The audit',   glyph: '>', target: '#act-close' },
      ],
      onSelect: (_i, chapter) => {
        const el = chapter?.target && $(chapter.target);
        if (!el) return;
        // Honour the visitor's preference for the scroll itself, not just for decoration.
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      },
    }));

  safe('capsule-controls', () => initCapsuleControls(document.body));

  // ── act rhythm ────────────────────────────────────────────────────────────────
  // ZERO backdrops: a ground already exists, and a second full-viewport ground layer is
  // exactly what puts a seam between acts. Breaths give the silence instead.
  safe('act-breaks', () => initActBreaks(document.querySelector('main'), { backdrops: null }));

  // ── the one clock ─────────────────────────────────────────────────────────────
  let last = -1;
  const tick = () => {
    const doc = document.documentElement;
    const range = doc.scrollHeight - window.innerHeight;
    // A zero range would make progress NaN; caustic-field snaps NaN to 0, which reads as
    // a real visual regression masking a quiet upstream bug. Guard it here instead.
    const p = range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0;
    if (p !== last) {
      last = p;
      for (const engine of driven) {
        try { engine.setProgress(p); } catch { /* a dead engine must not stop the page */ }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Fonts settle before the harness is told the page is built, or it screenshots
  // mid-reflow and the type metrics in the shot are not the ones a visitor sees.
  if (document.fonts?.ready) await document.fonts.ready;
}

mountAll()
  .catch((err) => console.info('mount failed, page continues flat:', err))
  // .finally, not .then — CONTRACT §6: a flatter page has still finished loading, and
  // hiding that from the harness turns a graceful degradation into a seven-second hang.
  .finally(() => { window.__ready = true; });
