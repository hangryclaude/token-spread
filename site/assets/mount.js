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

/**
 * Force act-breaks to recompute after an INSTANT jump.
 *
 * It bounds its per-frame rect reads with an IntersectionObserver and its loop early-returns
 * when scrollY is unchanged, so on a jump the observer's callback lands on a frame where the
 * scroll has already settled: elements that just came on screen keep the opacity they had
 * while they were far below. Measured on the twin act at 390x844 — heading stuck at opacity 0
 * for three seconds at scrollY 3590, then reading 1 at that same 3590 after a one-pixel nudge.
 * The same position giving two answers is the tell that it is stale state, not the design.
 *
 * Smooth scrolling hides it, because the intermediate positions keep the loop working, and so
 * does reduced motion, where act-breaks clears the reveal styles outright rather than animating
 * them. What is left is the case that matters most: a #fragment link under normal motion —
 * which is precisely the hero's own "See the same answer billed twice" landing on the proof.
 *
 * One pixel out and back on the next frame is the smallest change that makes it recompute.
 */
const settleReveals = () => requestAnimationFrame(() => {
  window.scrollBy(0, 1);
  // The -1 must land on the NEXT frame. Both in one frame nets to zero change, the loop's
  // early-return never lifts, and nothing recomputes — which is exactly how the first version
  // of this helper failed while appearing to work, because reduced motion passes it for an
  // unrelated reason (act-breaks clears opacity outright under the preference, engine.js:364).
  requestAnimationFrame(() => window.scrollBy(0, -1));
});

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

  // ── act 1 · the hero ticker ───────────────────────────────────────────────────
  // The marquee was the headline, per the interview. It is now a ticker beneath a real h1,
  // for a reason that no config could fix: a band loop has no phase control, so at rest it
  // opened mid-phrase on the CONCLUSION — "a smaller bill · the same request · the same m" —
  // arguing backwards and clipped mid-word. A ticker is a form that is supposed to run past
  // both edges, so the same pixels stop being a defect once the h1 carries the sentence.
  //
  // The container is now a fixed 2.6rem band rather than the whole act, and that is the
  // load-bearing part. `size` is cap height as a fraction of CONTAINER height, so a constant
  // container gives a constant cap on every viewport — which is what actually retires the
  // 140px-cap-on-a-390px-phone defect that all three gates certified, instead of patching it
  // per breakpoint. With fit:0 there is no width-dependent term left in the config at all.
  const marqueeCfg = {
    text: 'the same request · the same model · a smaller bill · ',
    mode: 'band',
    y: 0.5,          // centred in its own band, which is all the container now is
    size: 0.42,      // a fraction of a 2.6rem band ≈ a 17px cap, at every width
    fit: 0,          // no ceiling: a ticker is MEANT to run past both edges
    color: '#f2f7f4',
  };
  const marquee = safe('kinetic-marquee', () => initKineticMarquee($('#hero-marquee'), marqueeCfg));
  if (marquee?.setProgress) driven.push(marquee);

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
      // Six cards in the default 4×2 left two cells empty and squeezed each card to ~150px
      // wide, where `overflow:hidden` ate the last line of five of the six — the engine's own
      // "a card that eats its own last sentence". 3×2 is exactly six cells with no ragged row.
      cols: 3,
      rows: 2,
      // `width` 0.62 is measured (technique 13) against a THREE-card row of short labels; these
      // carry a heading and a sentence. 0.84 is the widest the engine allows without warning,
      // since it asserts width × scale[1] ≤ 1 and scale[1] is 1.161. `ratio` is width ÷ height
      // and the engine calls it a design choice, not a measurement: 2.0 buys the rows the
      // height the copy actually needs.
      width: 0.84,
      ratio: 2.0,
      cards: [
        { grammar: 'ledger', heading: 'Model routing', entries: [
          { label: 'verdict', value: 'refused' },
          { label: 'why', value: 'a different model writes different words' } ] },
        { grammar: 'ledger', heading: 'Unknown models', entries: [
          { label: 'verdict', value: 'excluded' },
          { label: 'why', value: 'counted, never guessed' } ] },
        { grammar: 'ledger', heading: 'flex / priority tiers', entries: [
          { label: 'verdict', value: 'refused' },
          { label: 'why', value: 'no published multiplier exists' } ] },
        { grammar: 'ledger', heading: 'Waste we cannot see', entries: [
          { label: 'verdict', value: 'unquantified' },
          { label: 'why', value: 'never a flattering $0' } ] },
        { grammar: 'ledger', heading: 'TTL from aggregates', entries: [
          { label: 'verdict', value: 'exposure only' },
          { label: 'why', value: 'no per-request timing to size it' } ] },
        { grammar: 'ledger', heading: 'Summed levers', entries: [
          { label: 'verdict', value: 'refused' },
          { label: 'why', value: 'multipliers compound by product' } ] },
      ],
    }));

  // ── chrome · the way back ─────────────────────────────────────────────────────
  // Mandatory past ~5 viewports. The engine NEVER scrolls anything itself — a chip
  // click fires onSelect and moves the page 0px — so onSelect has to do the work.
  const hud = safe('fixed-hud', () =>
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
        // Only the instant branch needs it, but a smooth scroll that is already at its target
        // is instant too, so this runs either way rather than guessing which one happened.
        settleReveals();
      },
    }));
  // The return value was discarded until 2026-08-12, so the hud never joined `driven` and
  // setProgress never reached it: the chapter rail and the progress hairline sat frozen at
  // chapter 01 for the whole document, on the one piece of chrome whose entire job is telling
  // the reader where they are.
  if (hud?.setProgress) driven.push(hud);

  safe('capsule-controls', () => initCapsuleControls(document.body));

  // The hero's link to the proof is a plain #fragment, so the browser jumps without asking
  // anything here. hashchange fires once the jump has landed, which is when the reveals need
  // the nudge. Skipped when the preference is honoured elsewhere — this is not motion, it is
  // a one-pixel correction, so it runs under reduced motion too.
  window.addEventListener('hashchange', settleReveals);

  // ── act rhythm ────────────────────────────────────────────────────────────────
  // ZERO backdrops: a ground already exists, and a second full-viewport ground layer is
  // exactly what puts a seam between acts. Breaths give the silence instead.
  safe('act-breaks', () => initActBreaks(document.querySelector('main'), { backdrops: null }));

  // A hash present at LOAD never fires hashchange, so the listener above cannot see it, and
  // the browser has already restored the scroll before act-breaks mounted. Measured: loading
  // #act-twin, #act-bar or #act-close landed with the heading and eyebrow both at opacity 0.
  // That is the shared-link case — the first thing someone sees when the page is passed on —
  // so it is the one where an invisible heading costs the most.
  // getElementById, not querySelector: a hash like #1 is a valid fragment and an invalid
  // selector, and would throw here.
  if (location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)))) {
    settleReveals();
  }

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
