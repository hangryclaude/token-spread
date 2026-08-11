/**
 * fixed-hud — the overlay that never changes state.
 * ─────────────────────────────────────────────────────────────────────────
 * Derived from four corpus clips that all solve the same problem in different registers:
 * what stays on screen while everything underneath it changes.
 *
 *   clip 6  (ZOI ICE TEA, t=13.5s, tier INFERRED)
 *     "Fixed white UI over inverting backgrounds, held legible by a soft dark halo instead of a
 *      scroll-aware invert." The stacked wordmark and the two-bar burger never change colour,
 *      never gain a background plate and never move — across a near-black hero, a mid-blue
 *      section and a bright orange one. On orange each white letter carries a soft dark halo
 *      roughly its own size.
 *
 *      THE CORPUS IS AMBIGUOUS HERE AND SAYS SO: at 576p it could not separate a deliberate
 *      text-shadow or radial scrim from video codec ringing around a high-contrast edge. What is
 *      unambiguous is the absence — no flicker, no colour swap, no plate appearing at a section
 *      boundary. So the halo in this file is a DECISION, not a reconstruction. It is built
 *      deliberately because the alternative (a scroll-aware invert) is the thing the reference
 *      demonstrably did not do.
 *
 *   clip 13 (Emons, t=0.25s, VERIFIED)
 *     "Numbered chapter rail where only the active chip expands." Five soft-rect capsules
 *      bottom-left, each a two-digit number plus a small square icon tile. The active chip does
 *      two things at once: the tile flips from tint to solid accent, and the capsule widens to
 *      admit a text label. At rest the rail is five tiny chips and exactly one word wide. It is a
 *      progress bar, a table of contents and a jump nav in one component.
 *
 *   clip 10 (IGLOO, t=4.67s and t=3.33s, VERIFIED)
 *     "Sampled numeric block callouts" — only 4–6 of roughly 40 anchors carry a label at any
 *      moment: a two-digit number in ~9px mono, connected by a 1px white hairline that runs a
 *      short distance then kinks once to a small dot. The labelled set changes over time.
 *      Labelling everything is clutter; labelling a rotating subset reads as live instrumentation.
 *     "Legal and utility text folded into the fixed corner HUD" — a full-viewport canvas site has
 *      no footer, so the copyright/utility lines live under the logotype in ~10px mono.
 *
 *   clip 8  (LOFT THIRTY ONE, t=8.75s and t=7.25s, VERIFIED)
 *     "Architectural drafting annotation drawn in hairline SVG over a live plate" — extension
 *      lines with tick terminators, leader lines, small-caps tracked labels, all in ~1px white
 *      directly over moving footage.
 *     "Hairline scroll-progress rail with no track" — a 1px rule pinned to the bottom edge that
 *      grows rightward. No unfilled track: on a dark ground the remainder is simply invisible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE HALO IS A SEPARATE LAYER AND NOT A text-shadow
 *
 * This is the one implementation detail that decides whether the effect is real or theatre.
 *
 * `tools/contrast-check.mjs` measures pixels, not CSS. It sets `visibility:hidden` on every
 * text-bearing element and screenshots again, so the second shot is the genuine backdrop with
 * the glyphs removed. A text-shadow is part of the glyph's own rendering, so it disappears with
 * the text — the checker would measure white UI against raw shader and fail it, and it would be
 * RIGHT to, because a shadow that thin does very little over a saturated field anyway.
 *
 * So the halo is a `::before` on a wrapper that carries no text of its own: a blurred, rounded
 * black rect sitting behind the glyphs. It survives the hide pass because it belongs to a
 * different element, and it survives it honestly — it really is what is behind the text.
 *
 * The corollary is a trap worth stating out loud: if a haloed slot holds a bare text node, that
 * text node's parent IS the slot, the checker hides the slot, and the ::before goes with it
 * (visibility is inherited by pseudo-elements). init() therefore wraps loose text in a span.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEPARTURES FROM THE CONTRACT AND FROM THE REFERENCE, STATED
 *
 *  · CONTRACT §7 asks that injected elements be aria-hidden. Every DECORATIVE layer here obeys
 *    that — halos, annotation SVG, progress rail. The chapter rail does not: it is navigation,
 *    and a nav hidden from assistive tech is a bug wearing a contract as a costume. Chips are
 *    real <button>s with real accessible names and aria-current, inside a host-authored <nav>.
 *    They still carry data-sc="fixed-hud" so they are identifiable and removable.
 *  · Clip 13's chips are a pale-pink tint on a near-white world. That inverts to unreadable the
 *    moment the ground goes bright, which is the whole premise of clip 6. So the chips here are a
 *    dark translucent capsule instead of a light one. The GRAMMAR is kept (soft-rect = navigate,
 *    fill alone carries emphasis, active tile flips to solid accent); the value is flipped.
 *  · The corpus callouts label 3D blocks. There is no 3D here, so the anchors are seeded points in
 *    a configurable band of the viewport and the telemetry line is the anchor's real normalised
 *    coordinate. Made-up numbers would have been easier and would have been a lie.
 *  · Clip 8's progress rail is white on dark drone footage and never meets a bright ground, so the
 *    corpus has nothing to say about what it should do over one. Measured on the flat #ff9a3c
 *    control, 1px of rgba(255,255,255,.9) sits at about 2.1:1 — technically drawn, practically a
 *    rumour. It gets the same halo as everything else. This is the one element contrast-check
 *    structurally cannot grade, because it carries no text, which is exactly why it needed
 *    looking at rather than measuring.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *   import { initFixedHud } from './engine.js'
 *   const hud = initFixedHud(document.querySelector('[data-hud]'), {
 *     chapters: [{ at: 0.00, num: '01', label: 'Ground', glyph: 'horizon' }, …],
 *     onSelect: (i, ch) => document.getElementById(ch.target)?.scrollIntoView(),
 *   })
 *   hud.setProgress(scrollTop / (scrollHeight - innerHeight))   // 0..1
 *   hud.destroy()
 *
 * Zero dependencies. No three.js — there is no scene graph here, it is DOM and one SVG.
 *
 * prefers-reduced-motion: the callout sample stops rotating and the rAF loop closes; chip
 * expansion and the progress rule snap instead of easing. Both keep responding to setProgress(),
 * because advancing the rail as the visitor scrolls is answering them, not animating at them.
 * Re-read every frame via matchMedia plus a change listener, so toggling the OS setting mid-
 * session takes effect without a reload.
 */

const RM_QUERY = '(prefers-reduced-motion: reduce)';
const NAME = 'fixed-hud';
const STYLE_ID = 'sc-fixed-hud-style';

const DEFAULTS = {
  /**
   * Chapter rail. `at` is the scroll progress (0..1) at which this chapter becomes active and
   * must ascend. `target` is an element id the host can use in onSelect. `glyph` names one of
   * the built-in 14px marks below; anything unknown falls back to a filled square.
   */
  chapters: [],
  /** Called with (index, chapter) when a chip is activated. The engine never scrolls anything. */
  onSelect: null,

  /** Fill of the ACTIVE chip's icon tile. Clip 13's only emphasis mechanism is fill. */
  accent: '#ff6a1f',

  /* --- the halo, i.e. the whole point ------------------------------------- */
  /** Opacity of the dark halo behind every [data-hud-halo] slot. */
  haloAlpha: 0.64,
  /** Halo colour before alpha. Black reads as a shadow; a hue reads as a plate. */
  haloColor: '0,0,0',
  /**
   * How far the halo shape extends past the text box, px. This is a RATIO to haloBlur, not a
   * free number: CSS blur(N) is a Gaussian of standard deviation N, so the shape's own edge is
   * smeared roughly +/-2N. At pad 24 / blur 16 the last line of a multi-line slot sat 1.5 sigma
   * from the edge, came out at ~93% of peak alpha, and contrast-check put the utility line at
   * exactly 4.50:1 — passing by nothing. Just under 2 sigma is the number that holds.
   */
  haloPad: 28,
  /**
   * CSS blur() standard deviation, px. This is the number that decides whether the thing reads as
   * a halo or as a plate, and 12 was visibly a plate at 1440 — a soft-cornered rectangle you
   * could trace with a finger. Raise this and haloPad together or the text falls off the core.
   */
  haloBlur: 15,

  /* --- drafting annotation ------------------------------------------------ */
  /** Draw the hairline annotation layer at all. */
  annotations: true,
  /** Where to mount it. It has to sit BELOW page content, so it cannot live inside the HUD. */
  annotationMount: null,
  /** z-index for that layer. Page content should be above it, the background below. */
  annotationZ: 2,
  /** Anchor pool size. Clip 10 has ~40 blocks and labels 4–6 of them. */
  pool: 26,
  /** How many callouts are lit at once. Clip 10 counts 4–6 of ~40. */
  sample: 5,
  /**
   * Same, below `narrowAt`. Zero on purpose, and it is a design decision rather than a budget one.
   * Numbered callouts need a gutter to live in. A phone has none — the copy column IS the
   * viewport — so on the first build they landed on top of the body text, and because the plate
   * sits under page content they showed through the gaps BETWEEN lines, which reads as a
   * rendering fault rather than as instrumentation. Both corpus sources for this device (clips 8
   * and 10) are desktop captures. The dimension lines below survive on a phone because they are
   * pinned to the margins by construction.
   */
  sampleNarrow: 0,
  /** Seconds between retiring one callout and promoting another. */
  sampleEvery: 2.6,
  /** Normalised band the anchors are seeded into: [x0, y0, x1, y1]. Keep it out of the copy. */
  band: [0.56, 0.14, 0.84, 0.86],
  /** Same, for viewports narrower than `narrowAt`. */
  bandNarrow: [0.3, 0.16, 0.6, 0.84],
  narrowAt: 640,
  /** Seed for the anchor LCG. Fixed so screenshots are reproducible run to run. */
  seed: 20250807,
  /** Draw the two viewport dimension lines (clip 8's extension lines with tick terminators). */
  dimensions: true,

  /* --- progress rule ------------------------------------------------------ */
  /** Clip 8's 1px rule pinned to the bottom edge with no unfilled track. */
  progress: true,
  /** Left inset the rule starts from, matching the page's content margin. */
  progressInset: '6vw',
  /**
   * Blur radius, px, of the rule's own halo — the same device as the corner slots at hairline
   * scale. Clip 8's rail is white on dark drone footage and never has to survive anything else, so
   * this is an extension rather than a reconstruction. It was measured: 1px of rgba(255,255,255,.9)
   * over the flat #ff9a3c control sits at about 2.1:1, which is visible only if you already know
   * it is there. contrast-check never looks at it — the rule carries no text — so this is exactly
   * the kind of element that passes every gate and is invisible in the product.
   */
  progressHalo: 7,
};

/* 14px glyphs for the chip tiles. Deliberately abstract marks rather than pictograms — clip 13's
 * truck/plane/ship read instantly because the site sells freight; borrowed literally into a
 * different page they would be noise. Stroke-only, 1px, so they sit in the same hairline family
 * as the annotation layer. */
const GLYPHS = {
  horizon: '<path d="M2 9h10M2 5.5h6"/>',
  stack: '<path d="M2 4h10M2 7h10M2 10h10"/>',
  ring: '<circle cx="7" cy="7" r="4.2"/>',
  chevron: '<path d="M5 3l4 4-4 4"/>',
  grid: '<path d="M2 2h4v4H2zM8 2h4v4H8zM2 8h4v4H2zM8 8h4v4H8z"/>',
  node: '<path d="M7 2v10M2 7h10"/><circle cx="7" cy="7" r="2"/>',
};
/* hasOwn, not a bare lookup: glyph:'constructor' would otherwise inherit Object.prototype and
 * stringify a native function into the tile instead of falling back. */
const glyph = (n) =>
  (Object.hasOwn(GLYPHS, n) && GLYPHS[n]) || '<rect x="4" y="4" width="6" height="6"/>';

/* Namespaced, injected once, refcounted, removed when the last instance is destroyed. Everything
 * configurable arrives as a --sc- custom property set on the container, so a second HUD on the
 * same page with a different halo does not need a second stylesheet. */
const CSS = `
[data-sc="${NAME}"] { pointer-events: none; }
[data-sc="${NAME}"] button,
[data-sc="${NAME}"] a { pointer-events: auto; }

/* ---- the halo ---------------------------------------------------------- *
 * A blurred rounded rect on a wrapper that carries no text of its own, so a pixel-sampling
 * contrast checker measures it as backdrop instead of losing it with the glyphs.
 *
 * NOTE the absence of a [data-hud-halo] position rule here. It was here, and it cost a round:
 * an attribute selector and a class selector have identical specificity, the injected
 * sheet lands after the host's, so it silently beat .slot{position:absolute} and dropped
 * three of four fixed slots into normal flow — a HUD that positions itself is worse than no HUD.
 * The containing block is established in JS instead, and only when the host left it static.   */
[data-hud-halo] > * { position: relative; z-index: 1; }
[data-hud-halo]::before {
  content: '';
  position: absolute;
  inset: calc(-1 * var(--sc-hud-halo-pad));
  border-radius: calc(var(--sc-hud-halo-pad) * 1.6);
  background: rgba(var(--sc-hud-halo-color), var(--sc-hud-halo-alpha));
  filter: blur(var(--sc-hud-halo-blur));
  z-index: 0;
  pointer-events: none;
}

/* ---- chapter rail ------------------------------------------------------- */
.sc-hud-rail { display: flex; align-items: center; gap: 6px; }
.sc-hud-chip {
  display: flex; align-items: center; gap: 7px;
  margin: 0; padding: 6px 8px;
  font: inherit; color: var(--sc-hud-ink, #f4f4f1);
  background: rgba(8, 9, 12, 0.56);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;                    /* soft-rect = navigate, per clip 13 */
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.sc-hud-chip:focus-visible { outline: 2px solid var(--sc-hud-accent); outline-offset: 2px; }
/* Solid colours, never a translucent white. contrast-check reads the CSS color property and
 * ignores its alpha, so rgba(255,255,255,.7) measures as pure white and draws as something
 * dimmer — a gate that grades a colour nobody sees is worse than no gate. */
.sc-hud-num {
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.06em; font-variant-numeric: tabular-nums;
  color: #cbcbc6;
}
.sc-hud-tile {
  display: grid; place-items: center;
  width: 16px; height: 16px; border-radius: 3px;
  background: rgba(255, 255, 255, 0.13);
}
.sc-hud-tile svg { display: block; width: 14px; height: 14px; fill: none;
  stroke: rgba(244, 244, 241, 0.8); stroke-width: 1; stroke-linecap: square; }
.sc-hud-lab {
  overflow: hidden; white-space: nowrap;
  max-width: 0; opacity: 0;
  font: 600 10px/1 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.2em; text-transform: uppercase;
  transition: max-width 320ms cubic-bezier(.2,.7,.2,1), opacity 200ms linear;
}
.sc-hud-chip[aria-current="true"] { background: rgba(8, 9, 12, 0.72); border-color: rgba(255,255,255,0.3); }
.sc-hud-chip[aria-current="true"] .sc-hud-num { color: #f4f4f1; }
.sc-hud-chip[aria-current="true"] .sc-hud-tile { background: var(--sc-hud-accent); }
.sc-hud-chip[aria-current="true"] .sc-hud-tile svg { stroke: #fff; }
.sc-hud-chip[aria-current="true"] .sc-hud-lab { max-width: 14ch; opacity: 1; }

/* The rail's own responsive step lives here rather than in the host page. It was in the demo
 * first, where '.sc-hud-chip' tied on specificity with this sheet's own rule and lost on source
 * order, so a phone got desktop chips and the rail ran into the bottom-right slot. A component
 * that ships its own class names has to ship their breakpoints too. */
@media (max-width: 560px) {
  .sc-hud-rail { gap: 5px; }
  .sc-hud-chip { padding: 5px 6px; gap: 5px; }
  .sc-hud-tile { width: 14px; height: 14px; }
  .sc-hud-tile svg { width: 12px; height: 12px; }
  .sc-hud-num { font-size: 10px; }
  .sc-hud-lab { font-size: 9px; letter-spacing: 0.14em; }
}

/* ---- progress rule: filled part only, no track (clip 8) ----------------- *
 * Two pseudo-elements rather than a background on the element itself, and the reason is z-order,
 * not tidiness. The halo has to sit UNDER the white rule; a z-index:-1 pseudo would do that only
 * as long as the host gave the HUD container a stacking context, and a component that renders
 * correctly on one host and inside-out on another is worse than one that never tries. ::before
 * and ::after are both child boxes at the same level, so tree order alone puts the rule on top.
 *
 * The halo's box is inset 0 horizontally on purpose: at progress 0 the rule is zero pixels wide,
 * and a halo that bled sideways would leave a dark smudge parked at the left margin of a page
 * nobody has scrolled yet.                                                                     */
.sc-hud-progress {
  position: fixed; left: var(--sc-hud-progress-inset); bottom: 0;
  height: 1px; width: 0;
  transition: width 180ms linear;
}
/* Box height == blur radius, deliberately. A 14px-tall box under a 7px blur keeps its core at
 * roughly full alpha and draws a dark bar with a traceable top edge — built that way first, looked
 * at it on the flat orange control, and it was a plate. At height == sigma the whole box lives
 * inside the falloff and peaks near 0.24 effective alpha, which lifts the rule from about 2.1:1 to
 * about 3.6:1 against #ff9a3c while still reading as shadow. */
.sc-hud-progress::before {
  content: '';
  position: absolute; left: 0; right: 0; bottom: 0;
  height: var(--sc-hud-rule-halo);
  background: rgba(var(--sc-hud-halo-color), var(--sc-hud-halo-alpha));
  filter: blur(var(--sc-hud-rule-halo));
}
.sc-hud-progress::after {
  content: '';
  position: absolute; inset: 0;
  background: rgba(255, 255, 255, 0.9);
}

/* ---- hairline annotation ------------------------------------------------ */
.sc-hud-plate {
  position: fixed; inset: 0; width: 100%; height: 100%;
  pointer-events: none; overflow: hidden;
}
.sc-hud-cal { opacity: 0; transition: opacity 480ms linear; }
.sc-hud-cal.is-on { opacity: 1; }
.sc-hud-plate .ink { fill: none; stroke: rgba(255,255,255,0.88); stroke-width: 1;
  vector-effect: non-scaling-stroke; }
.sc-hud-plate .ink text { fill: rgba(255,255,255,0.94); stroke: none; }
.sc-hud-plate .dot { fill: rgba(255,255,255,0.94); stroke: none; }
/* Same halo idea at hairline scale: a fatter, darker copy of every shape drawn underneath.
 * Without it a 1px white rule over a saturated field is a rumour, not a line. */
.sc-hud-plate .halo { fill: none; stroke: rgba(0,0,0,0.55); stroke-width: 3.4;
  stroke-linejoin: round; stroke-linecap: round; }
.sc-hud-plate .halo text { fill: rgba(0,0,0,0.62); stroke: rgba(0,0,0,0.62); stroke-width: 3;
  paint-order: stroke; stroke-linejoin: round; }
.sc-hud-plate .halo .dot { fill: rgba(0,0,0,0.55); stroke: rgba(0,0,0,0.55); }
.sc-hud-plate text {
  font: 500 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.sc-hud-plate text.big { font-size: 9.5px; letter-spacing: 0.24em; }

/* Reduced motion: everything that eases on a clock of its own snaps instead. The rail and the
 * rule still MOVE — they are answering the visitor's scrolling — they just stop interpolating. */
[data-sc-hud-rm="1"] .sc-hud-lab,
[data-sc-hud-rm="1"] .sc-hud-progress,
[data-sc-hud-rm="1"] .sc-hud-cal { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .sc-hud-lab, .sc-hud-progress, .sc-hud-cal { transition: none; }
}
`;

let styleRefs = 0;
function mountStyle() {
  styleRefs++;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.setAttribute('data-sc', NAME);
  el.textContent = CSS;
  document.head.appendChild(el);
}
function unmountStyle() {
  styleRefs = Math.max(0, styleRefs - 1);
  if (styleRefs === 0) document.getElementById(STYLE_ID)?.remove();
}

/** Numerical Recipes LCG. Seeded on purpose: the same viewport must produce the same anchors, or
 *  every reduced-motion screenshot comparison in the harness becomes a coin toss. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/**
 * Drop `style` only if the engine emptied it, and actually get it dropped.
 *
 * Chrome serialises a mutated inline-style declaration back onto the attribute LAZILY, and the
 * flush can land after a removeAttribute() issued in the same task — so `removeProperty(x)` then
 * `removeAttribute('style')` reliably leaves `style=""` behind. Measured, not assumed:
 * setProperty → removeProperty → removeAttribute → outerHTML gives `<div style="">`, while the
 * same sequence with an attribute read wedged before the second removeAttribute gives `<div>`.
 *
 * This mattered here because the first destroy on a page looked clean (the prober read the
 * attribute, which flushed it) and the second one did not, so a mount→destroy→mount→destroy round
 * trip failed the "indistinguishable from never-initialised" clause of CONTRACT §1 while a single
 * cycle passed. A residual empty attribute renders nothing; it is still a difference, and a
 * teardown that is only clean when someone is watching is not a clean teardown.
 *
 * The length guard is the part that must not be dropped: a host that wrote its own inline styles
 * on the container keeps them.
 */
function dropEmptyStyle(el) {
  if (el.style.length) return;
  el.removeAttribute('style');
  if (el.getAttribute('style') === '') el.removeAttribute('style');
}

const inert = () => ({
  destroy() {}, setProgress() {}, setAnnotations() {}, element: null, supported: false,
});

export function initFixedHud(container, config = {}) {
  if (typeof window === 'undefined' || !container) return inert();
  const C = Object.assign({}, DEFAULTS, config);

  mountStyle();
  container.setAttribute('data-sc', NAME);
  container.style.setProperty('--sc-hud-accent', C.accent);
  container.style.setProperty('--sc-hud-halo-alpha', String(C.haloAlpha));
  container.style.setProperty('--sc-hud-halo-color', C.haloColor);
  container.style.setProperty('--sc-hud-halo-pad', `${C.haloPad}px`);
  container.style.setProperty('--sc-hud-halo-blur', `${C.haloBlur}px`);
  container.style.setProperty('--sc-hud-progress-inset', C.progressInset);
  container.style.setProperty('--sc-hud-rule-halo', `${C.progressHalo}px`);

  /* A haloed slot holding a bare text node would be hidden whole by contrast-check.mjs, taking
   * the ::before halo with it — the backdrop shot would then measure raw shader and the run would
   * fail for a reason that has nothing to do with what a visitor sees. Wrapping is cheap and it
   * makes the mistake unavailable. */
  const wrapped = [];
  const positioned = [];
  for (const slot of container.querySelectorAll('[data-hud-halo]')) {
    // The halo is an absolutely-positioned pseudo-element, so it needs a containing block — but
    // taking one from a slot the host already positioned would move the HUD. Only claim static.
    if (getComputedStyle(slot).position === 'static') {
      slot.style.position = 'relative';
      positioned.push(slot);
    }
    for (const node of [...slot.childNodes]) {
      if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
      const span = document.createElement('span');
      span.setAttribute('data-sc', NAME);
      node.replaceWith(span);
      span.appendChild(node);
      wrapped.push(span);
    }
  }

  /* ---- chapter rail --------------------------------------------------- */
  const railHost = container.querySelector('[data-hud-rail]');
  const chapters = [...C.chapters].sort((a, b) => a.at - b.at);
  const chips = [];
  if (railHost && chapters.length) {
    railHost.classList.add('sc-hud-rail');
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sc-hud-chip';
      b.setAttribute('data-sc', NAME);
      // The label is clipped to zero width on every inactive chip, so textContent alone would
      // name four of five buttons after a two-digit number. An explicit label is the whole name.
      b.setAttribute('aria-label', `${ch.num} ${ch.label}`);
      b.innerHTML =
        `<span class="sc-hud-num">${esc(ch.num)}</span>`
        + `<span class="sc-hud-tile"><svg viewBox="0 0 14 14" aria-hidden="true">${glyph(ch.glyph)}</svg></span>`
        + `<span class="sc-hud-lab">${esc(ch.label)}</span>`;
      b.addEventListener('click', () => C.onSelect?.(i, ch));
      railHost.appendChild(b);
      chips.push(b);
    }
  }

  /* ---- progress rule --------------------------------------------------- */
  let rule = null;
  if (C.progress) {
    rule = document.createElement('div');
    rule.className = 'sc-hud-progress';
    rule.setAttribute('data-sc', NAME);
    rule.setAttribute('aria-hidden', 'true');
    container.appendChild(rule);
  }

  /* ---- hairline annotation plate --------------------------------------- */
  const plateMount = C.annotationMount || document.body;
  let plate = null;
  if (C.annotations) {
    plate = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    plate.setAttribute('data-sc', NAME);
    plate.setAttribute('aria-hidden', 'true');
    plate.setAttribute('class', 'sc-hud-plate');
    plate.style.zIndex = String(C.annotationZ);
    plateMount.appendChild(plate);
  }

  let destroyed = false;
  let raf = 0;
  let lastSwap = 0;
  let progress = 0;
  let active = -1;
  let live = [];          // indices of the callouts currently lit
  let liveN = C.sample;   // how many that should be at this viewport width
  let anchors = [];
  let showAnnotations = C.annotations;
  const rmq = window.matchMedia(RM_QUERY);

  const applyRm = () => container.setAttribute('data-sc-hud-rm', rmq.matches ? '1' : '0');
  applyRm();

  /**
   * Lay out the plate: seed the anchors for this viewport and emit the whole SVG in one go.
   * Rebuilt on resize only — the rotation below just toggles a class, so a running page does no
   * markup work at all between swaps.
   */
  function layoutPlate() {
    if (!plate) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    plate.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const narrow = w < C.narrowAt;
    liveN = Math.min(narrow ? C.sampleNarrow : C.sample, C.pool);
    const [bx0, by0, bx1, by1] = narrow ? C.bandNarrow : C.band;
    const rnd = lcg(C.seed);
    const lead = narrow ? 20 : 26;      // 45° kink run
    const arm = narrow ? 22 : 32;       // horizontal run to the label

    anchors = [];
    for (let i = 0; i < C.pool; i++) {
      const x = (bx0 + rnd() * (bx1 - bx0)) * w;
      const y = (by0 + rnd() * (by1 - by0)) * h;
      // Two-digit ids, because clip 10's are two-digit and a three-digit label changes the
      // rhythm of the whole layer.
      anchors.push({ x, y, id: String(10 + Math.floor(rnd() * 89)), anchored: rnd() < 0.5 });
    }

    const shapes = anchors.map((a, i) => {
      const kx = a.x - lead;
      const ky = a.y - lead;
      const lx = kx - arm;
      if (!a.anchored) {
        /* Clip 10's rule, kept exactly: free telemetry gets no leader and no underline; only
         * ANCHORED labels are joined to their object. Two registers, not one decorated one. */
        return `<g class="sc-hud-cal" data-i="${i}">`
          + `<circle class="dot" cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="1.6"/>`
          + `<text x="${(a.x + 8).toFixed(1)}" y="${(a.y - 1).toFixed(1)}">${a.id}</text>`
          + `<text x="${(a.x + 8).toFixed(1)}" y="${(a.y + 9).toFixed(1)}">`
          + `X ${(a.x / w).toFixed(3).slice(1)} Y ${(a.y / h).toFixed(3).slice(1)}</text>`
          + `</g>`;
      }
      return `<g class="sc-hud-cal" data-i="${i}">`
        + `<circle class="dot" cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="1.6"/>`
        + `<path d="M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${kx.toFixed(1)} ${ky.toFixed(1)} `
        + `L${lx.toFixed(1)} ${ky.toFixed(1)}"/>`
        + `<text x="${lx.toFixed(1)}" y="${(ky - 5).toFixed(1)}">${a.id}</text>`
        + `</g>`;
    }).join('');

    /* Clip 8's drafting furniture: extension lines with tick terminators, dimensioning the one
     * thing on the page that is genuinely measurable — the viewport. Parked in the margins so the
     * rules never cross the copy. */
    /* Both rules are parked clear of the fixed chrome. The first pass ran the horizontal one at
     * h-30, straight through the chapter rail, and the vertical one from the top margin, straight
     * through the menu cap — drafting furniture is supposed to sit in the margins, and a hairline
     * crossing a line box is a real contrast finding as well as an ugly one. */
    const m = narrow ? 14 : 30;
    const hy = h - m - (narrow ? 34 : 46);       // above the rail, above the progress rule
    const vy0 = m + (narrow ? 60 : 86);          // below the top-right slot
    const vy1 = h - m - (narrow ? 60 : 86);
    const dims = C.dimensions
      ? `<g>`
        + `<path d="M${m} ${hy + 3.5}v-7M${m} ${hy}h${w - m * 2}M${w - m} ${hy + 3.5}v-7"/>`
        + `<text class="big" x="${(w / 2).toFixed(0)}" y="${(hy - 6).toFixed(0)}" `
        + `text-anchor="middle">${w} PX</text>`
        + `<path d="M${w - m - 3.5} ${vy0}h7M${w - m} ${vy0}v${vy1 - vy0}M${w - m - 3.5} ${vy1}h7"/>`
        + `<text class="big" x="${(w - m - 6).toFixed(0)}" y="${((vy0 + vy1) / 2).toFixed(0)}" `
        + `transform="rotate(-90 ${w - m - 6} ${((vy0 + vy1) / 2).toFixed(0)})" `
        + `text-anchor="middle">${h} PX</text>`
        + `</g>`
      : '';

    // One descriptor list, rendered twice: a fat dark copy underneath, the hairline on top.
    plate.innerHTML = `<g class="halo">${dims}${shapes}</g><g class="ink">${dims}${shapes}</g>`;

    live = [];
    for (let i = 0; i < liveN; i++) live.push(i);
    paintLive();
  }

  function paintLive() {
    if (!plate) return;
    const on = new Set(live);
    for (const g of plate.querySelectorAll('.sc-hud-cal')) {
      g.classList.toggle('is-on', showAnnotations && on.has(+g.dataset.i));
    }
  }

  /** Retire the oldest lit callout, promote one that is not already lit. */
  function swap() {
    // liveN 0 is a real configuration (see sampleNarrow), and without this guard the shift/push
    // pair below would promote index 0 and light a callout on a viewport that asked for none.
    if (liveN <= 0 || C.pool <= liveN) return;
    live.shift();
    let next = live.length ? (live[live.length - 1] + 1) % C.pool : 0;
    let guard = 0;
    while (live.includes(next) && guard++ < C.pool) next = (next + 1) % C.pool;
    live.push(next);
    paintLive();
  }

  function frame(now) {
    if (destroyed) return;
    // Re-read every frame rather than caching at init. A visitor who turns the preference ON
    // mid-session gets the sample frozen where it stands, with no reload and no half-faded
    // callout left hanging.
    if (rmq.matches) { raf = 0; applyRm(); return; }
    if (!lastSwap) lastSwap = now;
    if (now - lastSwap >= C.sampleEvery * 1000) { lastSwap = now; swap(); }
    raf = requestAnimationFrame(frame);
  }

  layoutPlate();
  if (!rmq.matches) raf = requestAnimationFrame(frame);

  /* One resize handler for the whole HUD. The plate is the only thing that needs relaying out —
   * the chrome is CSS-positioned and the halo is a pseudo-element that resizes with its slot. */
  let resizeRaf = 0;
  const onResize = () => {
    if (destroyed || resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; layoutPlate(); });
  };
  window.addEventListener('resize', onResize, { passive: true });

  const onPrefChange = () => {
    if (destroyed) return;
    applyRm();
    if (!rmq.matches && !raf) { lastSwap = 0; raf = requestAnimationFrame(frame); }
  };
  rmq.addEventListener?.('change', onPrefChange);

  const api = {
    element: container,
    supported: true,

    /** Drive the rail and the rule. 0..1; anything else is clamped rather than wrapped. */
    setProgress(p) {
      if (destroyed) return;
      progress = Math.max(0, Math.min(1, Number(p) || 0));
      if (rule) rule.style.width = `calc((100% - ${C.progressInset}) * ${progress.toFixed(4)})`;
      if (!chips.length) return;
      let i = 0;
      while (i + 1 < chapters.length && progress >= chapters[i + 1].at) i++;
      if (i === active) return;
      active = i;
      for (let k = 0; k < chips.length; k++) {
        // aria-current does double duty: it is the styling hook for "only the active chip
        // expands" AND it is what a screen reader announces. One attribute, no data-active twin.
        if (k === active) chips[k].setAttribute('aria-current', 'true');
        else chips[k].removeAttribute('aria-current');
      }
    },

    /** Turn the drafting layer on or off. Real control, not a decoration — see demo.html. */
    setAnnotations(on) {
      showAnnotations = !!on && !!plate;
      paintLive();
    },

    get chapter() { return active; },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      window.removeEventListener('resize', onResize);
      rmq.removeEventListener?.('change', onPrefChange);
      for (const c of chips) c.remove();
      if (railHost) {
        railHost.classList.remove('sc-hud-rail');
        if (!railHost.classList.length) railHost.removeAttribute('class');
      }
      rule?.remove();
      plate?.remove();
      // Unwrap the spans put around loose text so the host DOM is byte-identical to before init.
      for (const span of wrapped) span.replaceWith(...span.childNodes);
      for (const slot of positioned) slot.style.removeProperty('position');
      container.removeAttribute('data-sc');
      container.removeAttribute('data-sc-hud-rm');
      for (const p of ['--sc-hud-accent', '--sc-hud-halo-alpha', '--sc-hud-halo-color',
        '--sc-hud-halo-pad', '--sc-hud-halo-blur', '--sc-hud-progress-inset',
        '--sc-hud-rule-halo']) {
        container.style.removeProperty(p);
      }
      dropEmptyStyle(container);
      for (const slot of positioned) dropEmptyStyle(slot);
      unmountStyle();
    },
  };

  return api;
}

export default initFixedHud;
