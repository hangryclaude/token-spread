/**
 * card-grammar — two card grammars, one feature row, and a row that grows as you pass it.
 * ─────────────────────────────────────────────────────────────────────────
 * Derived from corpus clip 6 (ZOI ICE TEA). Four VERIFIED techniques that are really one
 * component, quoted from `corpus/clips-deep.json`:
 *
 *   tech 6  @8.0s   "Two distinct card grammars for two distinct jobs" — "Same site, opposite
 *                   treatments, chosen by whether the thing is meant to be an object or a
 *                   container."
 *   tech 12 @15s    "Feature row whose cards are structurally different from each other" —
 *                   "Card 1: pale-blue product macro… bleeding off the bottom-left edge with
 *                   huge negative space top-right, no text at all. Card 2: near-black, heading
 *                   'smoothness / and aftertaste' set lowercase and top-left, splash imagery
 *                   filling the middle edge-to-edge, and a 4-line body paragraph anchored to
 *                   the bottom — a three-zone card. Card 3: pale-blue… no text. Only the middle
 *                   card carries copy. The row still reads as a system because THE GEOMETRY IS
 *                   IDENTICAL WHILE THE CONTENTS ARE NOT."
 *   tech 13 @15.5s  "Card row scales up as it is scrolled past" — "Between f-060 and f-063 the
 *                   three-card row grows from occupying ~62% of viewport width to ~72%, and
 *                   taller in proportion, while the giant 'THE REST .' headline behind it stays
 *                   put. So the cards and the type are on different scroll rates."
 *   tech 9  @4.75s  "Packaging pictograms reused verbatim as web attribute chips" — three
 *                   icon+label pairs off the back of the can (a pause-bar mark with "Served
 *                   Cold", an asterisk/snowflake with "Shake Well", a triple-bar with "No Added
 *                   Sugar") reappear as a chip row on the web page. "Nothing is invented for the
 *                   web; the site is quoting the can."
 *
 * The idea underneath all four: a page that uses ONE card component everywhere reads as a
 * template. So there are two grammars here, named and separate, and they are separate at the
 * level of INTERNAL LAYOUT rather than surface:
 *
 *   'plate'   a full-bleed colour field with the copy laid OVER it. Editorial beats. The field's
 *             hotspot bleeds off one corner and the opposite corner is left almost empty, which
 *             is clip 6's craft note verbatim: "Card imagery is cropped to bleed off card edges
 *             rather than sit politely inside them… while the opposite corner is left almost
 *             entirely empty."
 *   'ledger'  a bordered box of label/value rows, marked up as a <dl>. Specification beats.
 *
 * WHERE THIS DEPARTS FROM THE REFERENCE, AND WHY. Technique 6's *observed* axis is corners and
 * shadow: square + drop shadow for gallery photographs (objects), rounded ~10px + no shadow for
 * the feature row (containers). That axis is already owned by `cluster-scatter`, which
 * implements it as `grammar: 'object' | 'container'` on a plate's surface. Splitting the two
 * grammars in THIS row along the same axis would be wrong twice over: it would duplicate that
 * engine, and it would contradict technique 12, which is explicit that the row reads as a system
 * *because* the geometry is identical. So both grammars here share one surface — 10px radius, no
 * shadow, the container treatment the reference's row actually has — and differ only inside.
 * Radius and shadow remain configurable for the page that wants objects instead.
 *
 * The ledger grammar itself is the honest extrapolation in this file. Clip 6 has no label/value
 * card; what it has is a PRINCIPLE ("two distinct card grammars for two distinct jobs") plus one
 * observed grammar and one observed job. The specification beat is the second job every product
 * page has, and a bordered rule-separated list is what the reference's own back-of-pack
 * pictogram block is in print. Stated here rather than dressed up as a measurement.
 *
 * Zero dependencies, one file, DOM + CSS transforms. Not WebGL and not canvas, and that is a
 * requirement rather than frugality: a card here carries a heading, a paragraph and a definition
 * list, and all three have to stay selectable, linkable, translatable and readable by a screen
 * reader. Painting them into a canvas would cost all four.
 *
 *   import { initCardGrammar } from './engine.js'
 *   const row = initCardGrammar(document.querySelector('[data-row]'), {
 *     cols: 4, rows: 2,
 *     cards: [
 *       { grammar: 'plate',  col: 1, row: 1, rowSpan: 2, heading: 'sixteen hours' },
 *       { grammar: 'ledger', col: 2, row: 1, entries: [{ label: 'Leaf', value: 'Assam' }] },
 *       { grammar: 'ledger', col: 2, row: 2, entries: [{ label: 'Serve', value: '2–4 °C' }] },
 *       { grammar: 'plate',  col: 3, row: 1, colSpan: 2, rowSpan: 2, heading: 'lime mint' },
 *     ],
 *   })
 *   row.setProgress(howFarThroughTheViewportTheRowIs)   // CONTRACT §3 — the PAGE owns scroll
 *   row.destroy()
 *
 * CONTRACT §3: this engine never listens for `scroll`. It exposes `setProgress(0..1)` and the
 * page decides what that 0..1 means. The default mapping the demo uses is "where the row's own
 * box is in the viewport", which is what technique 13 is measuring — the scale is a function of
 * the ROW's position, not of the document's.
 *
 * CONTRACT §5 has nothing to bite on: there is no backing store here, no canvas, no allocation
 * to cap. Stated rather than silently skipped.
 *
 * prefers-reduced-motion, and CONTRACT §4's distinction is load-bearing in both directions:
 *   CONTINUES — the scale response to `setProgress()`. That is the visitor's own scrolling
 *               answered back, and flattening it answers a question nobody asked.
 *   STOPS     — the settling lerp (motion the page invents AFTER the visitor has stopped), the
 *               staggered entrance transition, and the hover float. There is no idle drift to
 *               stop, by construction: clip 6's craft note is that "motion is deliberately
 *               ABSENT in three places and it is what makes the rest land."
 * Read with matchMedia, re-read inside the frame callback and on `change`, never cached at init —
 * and never TRUSTING the `change` event either. Measured across 20 runs, an instance whose rAF
 * loop is open when the preference flips loses that event every time, so the attribute the sheet
 * keys off went stale. `motionAllowed()` is now the single read point and syncs the attribute
 * itself; see the note on it.
 */

const RM_QUERY = '(prefers-reduced-motion: reduce)';
const NS = 'card-grammar';
const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULTS = {
  /**
   * The row, as an array. This is the whole point of the component: the structural mix is DATA,
   * so "one tall plate, two stacked ledgers, one wide plate" is four lines of config rather than
   * a bespoke layout. Empty → inert handle, because a row with no cards is a caller bug.
   *
   * Per card:
   *   grammar   'plate' | 'ledger'                       ('ledger' if unrecognised, with a warn)
   *   col,row   1-based explicit grid placement. Omit both for auto-flow. Explicit is what buys
   *             you two ledgers STACKED in one column — auto-flow would put the second one in
   *             the next column, which is a different row entirely.
   *   colSpan   1   rowSpan 1
   *   kicker    small uppercase label above the heading
   *   heading   '\n' becomes a <br>. Set as a real heading element (see headingLevel).
   *   body      one paragraph
   *   entries   [{ label, value }] — ledger only, rendered as <dl><div><dt><dd>
   *   chips     [{ icon, label }] — see ICONS for the drawn set
   *   chipStyle 'pill' | 'bare' — per card, overrides the top-level default
   *   tone      0..1 position within `grade`, plate only. Omit for an even spread across the set.
   *   bleed     'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'centre'
   *   align     'end' (copy at the foot, default) | 'start' (copy at the head)
   *   level     override headingLevel for this card
   */
  cards: [],

  /** Grid columns in wide mode. Four is what "one tall + two stacked + one wide" needs. */
  cols: 4,
  /** Grid rows in wide mode. */
  rows: 2,
  /** Gutter in px. Corpus: "Three equal-height, equal-width cards, ~18px gutters." */
  gap: 18,

  /**
   * Row width as a fraction of the CONTAINER at progress 0. 0.62 is not a taste call — technique
   * 13 measured the reference's row "occupying ~62% of viewport width" before the scale-up.
   */
  width: 0.62,
  /**
   * Row block width ÷ height in wide mode. The corpus gives the row's width but not its height;
   * 1.9 is a two-row block that stays wider than tall at four columns, and it is a DESIGN choice
   * rather than a measurement. Ignored in narrow mode, where the cards size to their content.
   */
  ratio: 1.9,

  /**
   * Scale at progress 0 and at progress 1. 1.161 is 0.72 ÷ 0.62 — the measured growth in
   * technique 13, "from occupying ~62% of viewport width to ~72%, and taller in proportion".
   * Keep `width * scale[1] <= 1` or the row grows past its container; the engine warns once if
   * you do not, because the symptom (a horizontally scrolling page on a phone) shows up three
   * gates later and never points back here.
   */
  scale: [1, 1.161],
  /**
   * transform-origin for the scale. Centre means the row advances toward the viewer evenly,
   * which is what "the cards advance toward the viewer while the headline holds" looks like.
   * A row sitting under a clipped headline sometimes wants '50% 62%' so it grows downward into
   * empty page rather than upward into type.
   */
  origin: '50% 50%',

  /**
   * Settling lerp per frame toward the value setProgress() asked for. AUTONOMOUS MOTION — it
   * keeps moving after the visitor has stopped — so it is bypassed entirely under
   * prefers-reduced-motion, and 0 disables it for everyone (setProgress then lands immediately
   * and no animation frame is ever requested).
   */
  ease: 0.16,

  /** Corner radius in px. Corpus, technique 6: the feature row's cards are "ROUNDED (~10px)". */
  radius: 10,
  /**
   * CSS box-shadow, or null. Null by default and that is the corpus reading, not laziness:
   * technique 6 is explicit that the feature row has "no shadow — flat UI panels sitting in the
   * page", and that a radius AND a shadow together is the combination nobody chose. If you want
   * objects rather than containers, set a shadow and set `radius: 0`, and consider whether you
   * actually want `cluster-scatter` instead.
   */
  shadow: null,

  /** Heading element level for card headings. 3 assumes the section around it owns the h2. */
  headingLevel: 3,

  /**
   * The one grade every plate field is built from — clip 6, technique 7: "Sources are visibly
   * different shoots; the grade is what makes them a set." Only `tone` varies between plates;
   * hue never does. `lift` raises the floor so no plate crushes to black, because a graded set
   * never contains a true black and that is most of why an ungraded set looks like stock.
   */
  grade: { base: '#8fc3d8', floor: 0.34, ceil: 1.02, lift: 0.045 },
  /**
   * The colour the plate's copy scrim fades to. It is a SEPARATE element from the copy, never a
   * ::before on the text — `visibility:hidden` takes an element's pseudo-elements with it, so a
   * scrim painted into the text layer is invisible to every instrument that measures what is
   * behind text, including tools/contrast-check.mjs. A scrim you cannot measure is not evidence
   * of legibility, it is a way of hiding from the question.
   */
  scrim: '#070d16',

  /**
   * Text colours. SOLID, no alpha, and that is deliberate: contrast-check reads the computed
   * `color` and ignores its alpha channel, so `rgba(255,255,255,.6)` measures as if it were
   * white and every number the gate prints about it is optimistic. Pre-mix instead.
   */
  ink: '#eef3f8',
  deck: '#c5d3e0',
  muted: '#93a6ba',

  /** The ledger surface. Bordered and structured is the whole grammar. */
  ledger: { bg: '#0b1420', line: 'rgba(255,255,255,.13)' },

  /**
   * Staggered entrance. AUTONOMOUS — it plays whether or not the visitor did anything — so under
   * prefers-reduced-motion it does not run at all and the cards mount already in place. `false`
   * (or `null`) disables it. `rise` is px of upward travel; `stagger` is ms between adjacent cards.
   */
  entrance: { rise: 14, ms: 520, stagger: 70 },
  /**
   * Hover float, in px of lift. AUTONOMOUS in the sense §4 cares about — it is a decorative
   * animation the page invents — so it is skipped under the preference, both the transition and
   * the lift itself. 0 disables it.
   */
  hoverLift: 3,

  /**
   * 'pill' draws a stadium outline round each chip; 'bare' is icon + label with nothing round
   * it. The DEFAULT here is 'pill' and the corpus says 'bare': clip 6's craft note is that the
   * chips are "icon + label with big gaps between the trios and small gaps within each pair, so
   * the eye groups them correctly WITHOUT any dividers, borders, or background pills." Use
   * 'bare' when you are quoting the reference; 'pill' is for a chip row inside a bordered ledger,
   * where a bare row loses its edge against the rules above and below it.
   */
  chipStyle: 'pill',

  /**
   * CONTAINER width in px below which `narrow` merges in — container, not viewport, so a row in
   * a sidebar behaves like a row on a phone. 0 disables the narrow mode entirely.
   *
   * Narrow mode drops explicit placement and stacks every card in one column in DOM order. That
   * is a real behavioural difference and it is why `cards` order should be the reading order:
   * four cards at a quarter of a 390px phone are 84px wide, which is not a small version of the
   * row, it is a different thing that happens to have four boxes in it.
   */
  narrowAt: 720,
  narrow: {
    width: 0.94,
    gap: 12,
    /** Plate cards need a height of their own once the grid stops supplying one. width ÷ height. */
    plateRatio: 1.3,
    scale: [1, 1.06],
  },
};

/**
 * Pictograms, drawn in code. No image files, no icon font, no sprite sheet — a decorative layer
 * that 404s is a decorative layer that took a gate down with it.
 *
 * The first three are clip 6, technique 9, VERIFIED: "a pause-bar mark with 'Served Cold', an
 * asterisk/snowflake with 'Shake Well', a triple-bar with 'No Added Sugar'." They are drawn to
 * that description and nothing more — two bars, six spokes, three decreasing rules. The last
 * three are the same drawing grammar extended to the attributes a tea has that a can back does
 * not spell out, and they are not claimed as observed.
 *
 * One 24×24 box, stroke-only, `currentColor`, so a chip inherits the colour of the text beside
 * it and there is no second palette to keep in sync.
 */
const ICONS = {
  cold: ['M9 4.6V19.4', 'M15 4.6V19.4'],
  shake: ['M12 3.2V20.8', 'M4.4 7.6 19.6 16.4', 'M4.4 16.4 19.6 7.6'],
  sugar: ['M4.8 8H19.2', 'M4.8 12H15', 'M4.8 16H10.8'],
  leaf: ['M19.4 4.6c0 8.2-5.6 14.8-14.8 14.8 0-8.2 5.6-14.8 14.8-14.8Z', 'M5.4 18.6 16.2 7.8'],
  drop: ['M12 3.4s6.6 7.4 6.6 11.1a6.6 6.6 0 1 1-13.2 0C5.4 10.8 12 3.4 12 3.4Z'],
  clock: ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z', 'M12 7.4V12l3.3 2'],
};
/** Unknown name → a visible mark plus a warning, never a hole and never a throw (CONTRACT §6). */
const ICON_FALLBACK = ['M5.6 5.6h12.8v12.8H5.6z'];

/* The hotspot the plate's colour field bleeds from. The OPPOSITE corner is left empty, which is
 * the corpus craft note: "generous asymmetric negative space inside each card". */
const BLEED = {
  'top-left': '16% 10%',
  'top-right': '84% 12%',
  'bottom-left': '18% 88%',
  'bottom-right': '82% 86%',
  centre: '50% 50%',
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
/* Smootherstep, not linear. A row that changes size at a constant rate through the pass reads as
 * a slider being dragged; the reference's growth is a camera move, and a camera move has ends. */
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const hexToRgb = (hex) => {
  const h = String(hex).replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0];
};

/**
 * One plate's field. Two layers sharing a fixed geometry across the whole set — a hotspot at the
 * bleed corner over a 158° ramp — with only `tone` changing between plates. Same construction as
 * cluster-scatter's plateBackground, deliberately, so a page that mounts both engines gets one
 * grade rather than two that nearly match.
 */
function fieldBackground(C, tone, bleed) {
  const [r, g, b] = C.grade.rgb;
  const at = (m) => {
    const l = C.grade.lift * 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(c * m + l)));
    return `${f(r)},${f(g)},${f(b)}`;
  };
  const lvl = lerp(C.grade.floor, C.grade.ceil, clamp01(tone));
  const hot = at(lvl * 1.2);
  const pos = BLEED[bleed] || BLEED['bottom-left'];
  return `radial-gradient(118% 104% at ${pos}, rgba(${hot},.95) 0%, rgba(${hot},0) 64%),`
    + `linear-gradient(158deg, rgb(${at(lvl * 0.92)}) 0%, rgb(${at(lvl * 0.46)}) 100%)`;
}

/**
 * The scrim behind a plate's copy.
 *
 * Sized to the COPY, not to the card — it is the element the copy lives inside, and its fade
 * zone is a padding above (or below) the first line. The first version was an absolutely
 * positioned slice of the whole card fading out at 82% of the card's height, and swept at 21
 * scroll positions it FAILED: the tall plate's 9px "Cold brew" kicker sat 73% up its own card,
 * where that gradient is at roughly 0.1 alpha, so on mobile it measured 2.08:1 against a
 * required 4.5 with 100% of its backdrop under threshold. A scrim expressed as a fraction of the
 * card cannot know where the copy is; a scrim that IS the copy's box always does.
 *
 * The stops are in absolute lengths from the fade edge rather than percentages, so the plateau
 * starts exactly where the padding ends and every line of copy sits on ≥0.95 alpha whatever the
 * copy's height. Composited over the brightest field this grade can produce, 0.95 leaves the
 * muted kicker colour at ~7:1.
 */
function scrimBackground(C, align) {
  const [r, g, b] = hexToRgb(C.scrim);
  const s = (a) => `rgba(${r},${g},${b},${a})`;
  const to = align === 'start' ? 'to top' : 'to bottom';
  return `linear-gradient(${to},${s(0)} 0,${s(0.95)} var(--sc-cg-fade),${s(0.975)} 100%)`;
}

/**
 * The stylesheet. Static text: everything that varies is a `--sc-cg-*` custom property on the
 * root or an inline style on the card, so `configure()` never has to regenerate this.
 *
 * One <style> PER INSTANCE rather than a module-level refcounted sheet. Two instances on a page
 * means two identical sheets, which costs about 2KB and buys a destroy() that is trivially
 * correct — a refcount is one early-return away from leaking a <style> forever, and CONTRACT §1
 * says the page must be indistinguishable afterwards.
 *
 * Every rule is scoped under [data-sc="card-grammar"], per CONTRACT §7, so nothing here can
 * reach a host page's own .card.
 */
const SHEET = `
[data-sc="${NS}"]{box-sizing:border-box;margin:0;padding:0}
[data-sc="${NS}"][data-sc-part="root"]{
  position:relative;display:grid;flex:0 0 auto;margin:0 auto;
  transform-origin:var(--sc-cg-origin,50% 50%);
  color:var(--sc-cg-ink,#eef3f8);
  font:inherit;
}
[data-sc="${NS}"][data-sc-part="card"]{
  position:relative;overflow:hidden;min-width:0;min-height:0;
  display:flex;flex-direction:column;
  border-radius:var(--sc-cg-radius,10px);
  box-shadow:var(--sc-cg-shadow,none);
  transform:translateY(var(--sc-cg-card-y,0px));
  /* Cards size their own type. A wide plate spanning two columns gets bigger copy than a ledger
     in one, which is what stops a mixed row reading as one component at two zoom levels. */
  container-type:inline-size;
}
[data-sc="${NS}"][data-sc-grammar="ledger"]{
  background:var(--sc-cg-ledger-bg,#0b1420);
  border:1px solid var(--sc-cg-ledger-line,rgba(255,255,255,.13));
}
/* Transitions exist ONLY while the root says motion is allowed. One attribute, flipped live from
   the matchMedia listener, switches off the entrance, the hover float and nothing else.

   NO var() ANYWHERE IN THIS RULE, and that is a measured constraint rather than a style choice.
   The first version wrote the duration and the per-card stagger as
   "transition: opacity var(--sc-cg-enter-ms) ... var(--sc-cg-delay)", with the variables set on
   the root and on each card. The computed style read back correctly — 0.6s duration, 1.5s delay
   on card four — and NO TRANSITION EVER RAN: element.getAnimations() returned 0, and opacity
   was already 1 at t=27ms. A "transition" shorthand containing var() is a
   pending-substitution value, and Chrome will not start a transition off a before-change style
   whose own transition declaration still needs substituting from an inherited custom property.
   Isolated: the identical flush pattern on a plain <div> with a literal transition starts
   normally, and with an inline var() on the same element it also starts; only the inherited case
   fails. So the duration and delay are written as concrete inline values per card instead. */
[data-sc="${NS}"][data-sc-part="root"][data-sc-motion="on"] [data-sc-part="card"]{
  transition-property:transform,opacity,box-shadow;
  transition-timing-function:cubic-bezier(.22,.61,.36,1),cubic-bezier(.22,.61,.36,1),ease;
  transition-duration:240ms,240ms,220ms;
  transition-delay:0ms,0ms,0ms;
}
/* The entrance's from-state is committed with transitions OFF. Without this the from-write is a
   change away from a style the card has ALREADY had resolved (layout() reads container width at
   mount, which resolves every card at opacity 1), so it starts a 1→0 transition that the
   to-write half a millisecond later simply reverses — from a current value of ~1 back to 1,
   i.e. nothing. Measured: getAnimations() empty, opacity 1 at t=27ms, no entrance at all. */
[data-sc="${NS}"][data-sc-part="root"][data-sc-enter="pending"] [data-sc-part="card"]{
  transition:none!important;
}
[data-sc="${NS}"][data-sc-part="field"]{position:absolute;inset:0;pointer-events:none}
/* Above the field, below the scrim (z-index:2) — so the copy stays legible over the photograph
   by the same measurable scrim that protects it over the colour field. */
[data-sc="${NS}"][data-sc-part="image"]{position:absolute;inset:0;z-index:1;
  width:100%;height:100%;object-fit:cover;pointer-events:none}
/* The scrim WRAPS the plate's copy rather than covering the card, so its fade always lands
   immediately above the first line of type. --sc-cg-fade is both the padding and the gradient's
   plateau start, which is what keeps the two in register at any card size. */
[data-sc="${NS}"][data-sc-part="scrim"]{position:relative;z-index:2;--sc-cg-fade:34px}
@supports (padding:1cqw){
  [data-sc="${NS}"][data-sc-part="scrim"]{--sc-cg-fade:clamp(28px,15cqw,84px)}
}
[data-sc="${NS}"][data-sc-part="scrim"][data-sc-align="end"]{margin-top:auto;padding-top:var(--sc-cg-fade)}
[data-sc="${NS}"][data-sc-part="scrim"][data-sc-align="start"]{margin-bottom:auto;padding-bottom:var(--sc-cg-fade)}
[data-sc="${NS}"][data-sc-part="copy"]{
  position:relative;z-index:2;display:flex;flex-direction:column;
  padding:20px;
  font-size:14px;
  line-height:1.5;
  gap:.62em;
}
@supports (padding:1cqw){
  [data-sc="${NS}"][data-sc-part="copy"]{
    padding:clamp(15px,6.2cqw,30px);
    font-size:clamp(11.6px,3.5cqw,15.5px);
  }
}
[data-sc="${NS}"][data-sc-part="copy"][data-sc-align="end"]{margin-top:auto}
[data-sc="${NS}"][data-sc-part="copy"][data-sc-align="start"]{margin-bottom:auto}
/* The two grammars anchor their copy differently, and it is not a style preference. A plate is
   an image with a caption, so its copy sits against one edge and the field keeps the rest. A
   ledger is a DOCUMENT: it reads top-down, so its head goes to the top, its rows go to the foot,
   and the void lands in the middle where the reference's three-zone card puts its imagery.
   Bottom-anchoring a ledger the way a plate is bottom-anchored leaves a spec sheet floating in
   the lower third of its own box, which is what this rule was written to fix. */
[data-sc="${NS}"][data-sc-grammar="ledger"] [data-sc-part="copy"]{flex:1 1 auto;margin:0}
/* A plate's copy is anchored by its scrim wrapper, so it must not also anchor itself. */
[data-sc="${NS}"][data-sc-part="scrim"] [data-sc="${NS}"][data-sc-part="copy"]{margin:0}
[data-sc="${NS}"][data-sc-part="kicker"]{
  font-size:.74em;letter-spacing:.26em;text-transform:uppercase;font-weight:600;
  color:var(--sc-cg-muted,#93a6ba);margin-bottom:.15em;
}
[data-sc="${NS}"][data-sc-part="heading"]{
  font-size:1.62em;line-height:1.02;letter-spacing:-.02em;font-weight:300;
  color:var(--sc-cg-ink,#eef3f8);
}
[data-sc="${NS}"][data-sc-part="body"]{
  color:var(--sc-cg-deck,#c5d3e0);max-width:34ch;
}
[data-sc="${NS}"][data-sc-part="entries"]{margin-top:auto;padding-top:.5em}
[data-sc="${NS}"][data-sc-part="entry"]{
  display:flex;align-items:baseline;justify-content:space-between;gap:1.2em;
  padding:.52em 0;border-top:1px solid var(--sc-cg-ledger-line,rgba(255,255,255,.13));
}
[data-sc="${NS}"][data-sc-part="entry-label"]{
  font-size:.8em;letter-spacing:.12em;text-transform:uppercase;
  color:var(--sc-cg-muted,#93a6ba);
}
[data-sc="${NS}"][data-sc-part="entry-value"]{
  text-align:right;color:var(--sc-cg-ink,#eef3f8);font-variant-numeric:tabular-nums;
}
[data-sc="${NS}"][data-sc-part="chips"]{
  display:flex;flex-wrap:wrap;align-items:center;list-style:none;margin-top:.35em;
}
/* Corpus craft note: "big gaps between the trios and small gaps within each pair, so the eye
   groups them correctly without any dividers". The bare row leans on that gap ratio entirely;
   the pill row has its own edge, so it does not need the space. */
[data-sc="${NS}"][data-sc-part="chips"][data-sc-chipstyle="bare"]{gap:.5em 1.55em}
[data-sc="${NS}"][data-sc-part="chips"][data-sc-chipstyle="pill"]{gap:.45em}
[data-sc="${NS}"][data-sc-part="chip"]{
  display:inline-flex;align-items:center;gap:.48em;white-space:nowrap;
  font-size:.82em;letter-spacing:.015em;color:var(--sc-cg-ink,#eef3f8);
}
[data-sc="${NS}"][data-sc-part="chip"][data-sc-chipstyle="pill"]{
  border:1px solid var(--sc-cg-ledger-line,rgba(255,255,255,.13));
  border-radius:999px;padding:.32em .72em;
}
[data-sc="${NS}"][data-sc-part="chip"] svg{width:1.18em;height:1.18em;flex:0 0 auto}
`;

const warned = { icon: false, overflow: false, grammar: false };

const inert = () => ({
  root: null,
  cards: [],
  supported: false,
  get progress() { return 0; },
  get scale() { return 1; },
  setProgress() {},
  configure() {},
  relayout() {},
  destroy() {},
});

/** Merge config over defaults, one nested level deep, and pre-compute what render() needs. */
function normalise(config) {
  /* `config = {}` in the signature only covers `undefined`. An explicit null is a caller passing
   * through a variable that was not set, and it used to throw on `config.grade` — a decorative
   * layer taking the page down, which is exactly what CONTRACT §6 forbids. */
  config = config || {};
  const C = Object.assign({}, DEFAULTS, config);
  C.grade = Object.assign({}, DEFAULTS.grade, config.grade);
  C.ledger = Object.assign({}, DEFAULTS.ledger, config.ledger);
  C.narrow = Object.assign({}, DEFAULTS.narrow, config.narrow);
  /* `null` disables as well as `false`, and that is what makes `entrance: false` survive
   * configure(). configure() re-normalises the ALREADY-normalised config, where a disabled
   * entrance is stored as null; treating null as "unset" merged the defaults back in and the
   * entrance the caller switched off played on the next configure(). Measured: opacity 0 on every
   * card and 6 running animations, on a row built with entrance:false. */
  C.entrance = (config.entrance === false || config.entrance === null)
    ? null : Object.assign({}, DEFAULTS.entrance, config.entrance);
  C.grade.rgb = hexToRgb(C.grade.base);
  C.scale = Array.isArray(C.scale) && C.scale.length === 2 ? C.scale.map(Number) : DEFAULTS.scale;
  C.narrow.scale = Array.isArray(C.narrow.scale) && C.narrow.scale.length === 2
    ? C.narrow.scale.map(Number) : DEFAULTS.narrow.scale;
  return C;
}

/** '\n' in a heading is a deliberate line break, and never innerHTML — config is caller data. */
function setLines(el, text) {
  const parts = String(text == null ? '' : text).split('\n');
  parts.forEach((p, i) => {
    if (i) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(p));
  });
}

function el(tag, part, attrs) {
  const n = document.createElement(tag);
  n.setAttribute('data-sc', NS);
  if (part) n.setAttribute('data-sc-part', part);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function buildIcon(name) {
  const paths = ICONS[name];
  if (!paths && !warned.icon) {
    warned.icon = true;
    console.warn(`[${NS}] unknown icon "${name}" — drawing the fallback mark. Known: ${Object.keys(ICONS).join(', ')}`);
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  /* One of the two aria-hidden in this file (the other is the plate's empty field div), and it is
   * the correct one: the pictogram sits next to its own label, so announcing it would read the
   * attribute twice. Everything else the engine injects is content — headings are headings, the
   * spec rows are a <dl> — and CONTRACT §7's aria-hidden clause is about decoration, not about
   * hiding a card's copy to satisfy a rule. */
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('data-sc', NS);
  for (const d of paths || ICON_FALLBACK) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

function buildChips(list, style) {
  const ul = el('ul', 'chips', { 'data-sc-chipstyle': style });
  for (const c of list) {
    const li = el('li', 'chip', { 'data-sc-chipstyle': style });
    li.appendChild(buildIcon(c && c.icon));
    li.appendChild(document.createTextNode(String(c && c.label != null ? c.label : '')));
    ul.appendChild(li);
  }
  return ul;
}

/** Build one card's DOM. Returns the <article>; geometry is applied separately in layout(). */
function buildCard(C, spec, index, total) {
  let grammar = spec.grammar === 'plate' || spec.grammar === 'ledger' ? spec.grammar : null;
  if (!grammar) {
    if (!warned.grammar) {
      warned.grammar = true;
      console.warn(`[${NS}] card ${index} has grammar "${spec.grammar}" — falling back to 'ledger'. Valid: 'plate', 'ledger'.`);
    }
    grammar = 'ledger';
  }

  const card = el('article', 'card', { 'data-sc-grammar': grammar });
  const align = spec.align === 'start' ? 'start' : 'end';

  const copy = el('div', 'copy', { 'data-sc-align': align });
  let mount = copy;

  if (grammar === 'plate') {
    /* Tone spreads evenly across the plates when the card does not name one, so a set of plates
     * is a set rather than four copies of the same swatch — technique 7's uniform grade with a
     * varying level, which is what makes unrelated sources cohere. */
    const tone = spec.tone != null ? Number(spec.tone) : (total > 1 ? index / (total - 1) : 0.5);
    const field = el('div', 'field', { 'aria-hidden': 'true' });
    field.style.background = fieldBackground(C, tone, spec.bleed || 'bottom-left');
    card.appendChild(field);

    /* clip 6's craft note, verbatim: "Card imagery is cropped to bleed off card edges." The
     * field alone can only ever be a colour, so a plate whose job is to carry a photograph was
     * the one thing this engine could not express — the reference's own card row (f_16) is
     * three photographs, not three swatches.
     *
     * The field stays UNDERNEATH rather than being replaced: if the image 404s the card still
     * reads as a graded plate instead of as a hole, and the grade still does technique 7's work
     * of making the set cohere. object-fit:cover is what "cropped to bleed off card edges"
     * means in CSS.
     *
     * Decorative by default — the card's meaning lives in its heading and body, and the field
     * it sits in is already aria-hidden. A caller who has a genuinely informative image passes
     * `imageAlt`, and then it is exposed. */
    if (spec.image) {
      const informative = typeof spec.imageAlt === 'string' && spec.imageAlt.trim() !== '';
      const img = el('img', 'image',
        informative ? { alt: spec.imageAlt } : { alt: '', 'aria-hidden': 'true' });
      img.src = spec.image;
      img.loading = 'lazy';
      img.decoding = 'async';
      card.appendChild(img);
    }

    /* The scrim WRAPS the copy. It is deliberately NOT aria-hidden — it holds the card's real
     * copy, and hiding a heading from a screen reader to satisfy a namespacing rule would be
     * reading CONTRACT §7 against its own purpose. It also has to survive `visibility:hidden`
     * on the text elements, which is how contrast-check.mjs isolates the backdrop; a wrapper
     * that carries no text of its own does. */
    const scrim = el('div', 'scrim', { 'data-sc-align': align });
    scrim.style.background = scrimBackground(C, align);
    scrim.appendChild(copy);
    mount = scrim;
  }

  if (spec.kicker) {
    const k = el('p', 'kicker');
    k.textContent = String(spec.kicker);
    copy.appendChild(k);
  }
  if (spec.heading) {
    const lvl = Math.min(6, Math.max(1, (spec.level || C.headingLevel) | 0));
    const h = el('h' + lvl, 'heading');
    setLines(h, spec.heading);
    copy.appendChild(h);
  }
  if (spec.body) {
    const p = el('p', 'body');
    p.textContent = String(spec.body);
    copy.appendChild(p);
  }
  if (grammar === 'ledger' && Array.isArray(spec.entries) && spec.entries.length) {
    /* <dl> with a <div> per pair. Valid HTML5 since the div-in-dl grouping was standardised, and
     * the only markup that says "these are name/value pairs" rather than "these are two columns
     * of text that happen to line up." A spec table read aloud as a run-on sentence is the exact
     * failure this grammar exists to avoid. */
    const dl = el('dl', 'entries');
    for (const e of spec.entries) {
      const row = el('div', 'entry');
      const dt = el('dt', 'entry-label');
      dt.textContent = String(e && e.label != null ? e.label : '');
      const dd = el('dd', 'entry-value');
      dd.textContent = String(e && e.value != null ? e.value : '');
      row.appendChild(dt);
      row.appendChild(dd);
      dl.appendChild(row);
    }
    copy.appendChild(dl);
  }
  if (Array.isArray(spec.chips) && spec.chips.length) {
    copy.appendChild(buildChips(spec.chips, spec.chipStyle === 'bare' ? 'bare' : spec.chipStyle === 'pill' ? 'pill' : C.chipStyle));
  }

  card.appendChild(mount);
  return { el: card, grammar, spec, index };
}

export function initCardGrammar(container, config = {}) {
  if (typeof window === 'undefined' || !container) {
    /* CONTRACT §6: log the reason, never take the page down for a decorative layer. This branch
     * used to return silently, so a page whose selector had gone stale got a missing row and no
     * explanation anywhere. */
    if (typeof console !== 'undefined') console.warn(`[${NS}] no container — nothing to mount into`);
    return inert();
  }

  let C = normalise(config);
  if (!Array.isArray(C.cards) || !C.cards.length) {
    console.warn(`[${NS}] no cards — nothing to lay out`);
    return inert();
  }

  const style = document.createElement('style');
  style.setAttribute('data-sc', NS);
  style.textContent = SHEET;
  document.head.appendChild(style);

  const root = el('div', 'root');
  let cards = [];

  function buildCards() {
    while (root.firstChild) root.removeChild(root.firstChild);
    cards = C.cards.map((spec, i) => buildCard(C, spec || {}, i, C.cards.length));
    for (const c of cards) root.appendChild(c.el);
  }

  /* Colours and other surface values live as custom properties so configure() can change them
   * without touching the sheet or rebuilding a single node. */
  function applyVars() {
    const s = root.style;
    s.setProperty('--sc-cg-ink', C.ink);
    s.setProperty('--sc-cg-deck', C.deck);
    s.setProperty('--sc-cg-muted', C.muted);
    s.setProperty('--sc-cg-ledger-bg', C.ledger.bg);
    s.setProperty('--sc-cg-ledger-line', C.ledger.line);
    s.setProperty('--sc-cg-radius', C.radius + 'px');
    s.setProperty('--sc-cg-shadow', C.shadow || 'none');
    s.setProperty('--sc-cg-origin', C.origin);
  }

  let narrow = false;
  let activeScale = C.scale;

  function layout() {
    const cw = container.clientWidth || 1;
    narrow = C.narrowAt > 0 && cw < C.narrowAt;
    const n = narrow ? C.narrow : C;
    activeScale = narrow ? C.narrow.scale : C.scale;

    if (n.width * activeScale[1] > 1.001 && !warned.overflow) {
      warned.overflow = true;
      console.warn(`[${NS}] width ${n.width} × max scale ${activeScale[1]} = `
        + `${(n.width * activeScale[1]).toFixed(3)} of the container — the row will grow past its `
        + 'own box at full progress. Clip the container or lower one of the two.');
    }

    const s = root.style;
    s.width = (n.width * 100).toFixed(3) + '%';
    s.gap = n.gap + 'px';
    root.setAttribute('data-sc-mode', narrow ? 'narrow' : 'wide');

    if (narrow) {
      s.aspectRatio = '';
      s.gridTemplateColumns = 'minmax(0,1fr)';
      s.gridTemplateRows = '';
      s.gridAutoRows = 'auto';
    } else {
      s.aspectRatio = String(C.ratio);
      s.gridTemplateColumns = `repeat(${Math.max(1, C.cols | 0)},minmax(0,1fr))`;
      s.gridTemplateRows = `repeat(${Math.max(1, C.rows | 0)},minmax(0,1fr))`;
      s.gridAutoRows = '';
    }

    for (const c of cards) {
      const st = c.el.style;
      if (narrow) {
        /* Explicit placement is DROPPED on a narrow container, not scaled down. Two ledgers
         * stacked in column 2 of a four-column grid is a composition; the same two ledgers in
         * column 2 of a one-column grid is an empty first column and a broken row. */
        st.gridColumn = '';
        st.gridRow = '';
        st.aspectRatio = c.grammar === 'plate' ? String(C.narrow.plateRatio) : '';
        /* The sheet's `min-height:0` exists to stop a card blowing out a fixed-height grid. In
         * narrow mode there is no fixed-height grid to protect, so the automatic content-based
         * minimum comes back and `plateRatio` becomes a preferred height rather than a ceiling.
         * Without this, a plate whose copy is one line taller than its ratio allows silently
         * loses that line to `overflow:hidden` — and a card that eats its own last sentence is
         * worse than a card that is slightly the wrong shape. */
        st.minHeight = 'auto';
      } else {
        st.aspectRatio = '';
        st.minHeight = '';
        const colSpan = Math.max(1, (c.spec.colSpan | 0) || 1);
        const rowSpan = Math.max(1, (c.spec.rowSpan | 0) || 1);
        st.gridColumn = c.spec.col ? `${c.spec.col | 0} / span ${colSpan}` : `span ${colSpan}`;
        st.gridRow = c.spec.row ? `${c.spec.row | 0} / span ${rowSpan}` : `span ${rowSpan}`;
      }
    }
  }

  let destroyed = false;
  let raf = 0;
  let target = 0;
  let current = 0;
  let enterTimer = 0;
  const rmq = window.matchMedia(RM_QUERY);

  function render() {
    const k = lerp(activeScale[0], activeScale[1], smoother(clamp01(current)));
    root.style.transform = `scale(${k.toFixed(4)})`;
  }

  /**
   * will-change is a promise to the compositor, not a decoration. Held permanently on a scaled
   * root it pins a GPU layer for the life of the page AND rasterises the card text once at the
   * scale it was promoted at, so every glyph in the row is a resampled texture from then on.
   * Promote only while the lerp is actually running; at rest the row is a plain transform and
   * Chrome re-rasterises it crisply.
   */
  function compositorLayer(on) {
    root.style.willChange = on ? 'transform' : 'auto';
  }

  /**
   * The ONE place the preference is read, and it syncs `data-sc-motion` as a side effect.
   *
   * That side effect is a measured requirement, not tidiness. The attribute used to be written
   * only from the `change` listener, and MEASURED ACROSS 20 RUNS the listener does not always
   * fire: an instance whose rAF loop is open at the moment the preference flips loses its own
   * change event every single time (5/5 with the loop on row A, 5/5 on row B, 5/5 on both — and
   * with both looping, NO handler fires at all), while an idle instance gets it 5/5. The
   * behavioural fact is airtight even though the Chrome internal behind it is not: polling
   * `.matches` from a bare rAF loop does NOT reproduce it, so it is not simply "a getter read
   * swallows the notification".
   *
   * The consequence of the stale attribute was narrow but real — the sheet's card transition rule
   * stayed armed under `prefers-reduced-motion: reduce`, so a pointer leaving a card animated its
   * way back instead of snapping. Autonomous motion still stopped correctly, because `frame()` and
   * `setProgress()` re-read the query rather than trusting the attribute. Syncing here means every
   * path that consults the preference also corrects the attribute, so the engine never depends on
   * the change event alone. The listener stays: it is what covers an idle instance.
   */
  function motionAllowed() {
    const ok = !rmq.matches;
    const want = ok ? 'on' : 'off';
    if (root.getAttribute('data-sc-motion') !== want) root.setAttribute('data-sc-motion', want);
    return ok;
  }

  /** Land the entrance immediately, from wherever it is. Idempotent. */
  function finaliseEntrance() {
    if (enterTimer) { clearTimeout(enterTimer); enterTimer = 0; }
    for (const c of cards) {
      c.el.style.opacity = '';
      c.el.style.transitionDuration = '';
      c.el.style.transitionDelay = '';
      c.el.style.setProperty('--sc-cg-card-y', '0px');
    }
    root.setAttribute('data-sc-enter', 'done');
  }

  function startEntrance() {
    /* Under the preference there is no entrance at all — not a fast one, not a fade. An entrance
     * animation is the purest case of autonomous motion: it plays because the page loaded, not
     * because anybody did anything. */
    if (!C.entrance || !motionAllowed()) { finaliseEntrance(); return; }
    root.setAttribute('data-sc-enter', 'pending');
    const ms = C.entrance.ms;
    cards.forEach((c, i) => {
      const d = i * C.entrance.stagger;
      // Concrete values, in the same order as transition-property in the sheet. See the note
      // there for why these cannot be custom properties.
      c.el.style.transitionDuration = `${ms}ms,${ms}ms,220ms`;
      c.el.style.transitionDelay = `${d}ms,${d}ms,0ms`;
      c.el.style.opacity = '0';
      c.el.style.setProperty('--sc-cg-card-y', C.entrance.rise + 'px');
    });

    /* Commit the FROM state, then turn transitions back on and write the TO state. Three things
     * had to be true before the entrance ran at all, and every one of them was found by watching
     * a positive control PASS a gate it was built to fail:
     *   1. the from-state must be committed by a forced style resolution — deferring the second
     *      write to a requestAnimationFrame does not do it, because rAF callbacks run BEFORE the
     *      frame's style step, so both writes land in one resolution;
     *   2. the read must resolve the CARD's style, not an ancestor's box metric;
     *   3. the from-state must be committed with transitions OFF (see the sheet), or the write
     *      merely starts a transition the to-write instantly reverses.
     * It costs one synchronous style resolution at mount, next to the layout() already does. */
    getComputedStyle(cards[0].el).opacity;

    root.setAttribute('data-sc-enter', 'run');
    for (const c of cards) {
      c.el.style.opacity = '1';
      c.el.style.setProperty('--sc-cg-card-y', '0px');
    }

    /* Hand the transition back to the sheet's short default once the entrance is over, so a
     * hover float does not inherit a lead-in of up to stagger×(n-1) on the last card. A timeout
     * rather than a transitionend listener per card: one handle to cancel in destroy() instead
     * of N, and it fires even if the transition never runs because the tab was backgrounded. */
    enterTimer = setTimeout(() => {
      enterTimer = 0;
      if (destroyed) return;
      for (const c of cards) { c.el.style.transitionDuration = ''; c.el.style.transitionDelay = ''; }
      root.setAttribute('data-sc-enter', 'done');
    }, C.entrance.ms + C.entrance.stagger * cards.length + 60);
  }

  function ensureLoop() {
    if (raf || destroyed) return;
    compositorLayer(true);
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    compositorLayer(false);
  }

  /**
   * The ONE rAF loop in this file. It exists for the settling lerp and nothing else — the
   * entrance is a CSS transition and opens no animation frame of its own, which is what keeps
   * CONTRACT §3's "one rAF per effect" literally true rather than nearly true.
   * It runs while the lerp is catching up, then closes itself.
   */
  function frame() {
    if (destroyed) return;
    raf = 0;

    /* Re-read the preference HERE, every frame, through motionAllowed() so the attribute is
     * corrected too. A visitor who enables it mid-scroll gets the lerp dropped on the next frame
     * and lands exactly where their scroll says they are — the scale keeps answering them, the
     * settling does not. This is also the path that repairs the swallowed change event: the loop
     * that costs the instance its event is the same loop that notices. */
    if (!motionAllowed()) {
      finaliseEntrance();
      current = target;
      render();
      compositorLayer(false);
      return;
    }

    if (C.ease > 0) current += (target - current) * C.ease;
    else current = target;

    if (Math.abs(target - current) < 0.0002) {
      current = target;
      render();
      compositorLayer(false);
      return;
    }
    render();
    raf = requestAnimationFrame(frame);
  }

  const onEnter = (e) => {
    if (destroyed || !C.hoverLift || !motionAllowed()) return;
    e.currentTarget.style.setProperty('--sc-cg-card-y', -C.hoverLift + 'px');
  };
  const onLeave = (e) => {
    if (destroyed) return;
    e.currentTarget.style.setProperty('--sc-cg-card-y', '0px');
  };

  function bindHover() {
    for (const c of cards) {
      c.el.addEventListener('pointerenter', onEnter);
      c.el.addEventListener('pointerleave', onLeave);
    }
  }

  buildCards();
  applyVars();
  motionAllowed();          // writes data-sc-motion for the first time
  container.appendChild(root);
  layout();
  render();
  bindHover();
  startEntrance();

  /* ResizeObserver rather than window.resize: the row is usually inside a section whose width
   * changes with a sidebar, a zoom, or mobile browser chrome collapsing, none of which fire a
   * resize event reliably. Writes here only touch the root's own width and its children's grid
   * placement; the root's size cannot feed back into the container's, so this cannot trip the
   * observer-loop error. */
  let ro = null;
  const onWinResize = () => { if (!destroyed) { layout(); render(); } };
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => { if (!destroyed) { layout(); render(); } });
    ro.observe(container);
  } else {
    window.addEventListener('resize', onWinResize, { passive: true });
  }

  /* The frame callback returns without re-arming when the preference is on, so switching it back
   * off needs something to restart the loop. Turning it ON needs to land the entrance now rather
   * than at the end of a transition the visitor just asked not to see. */
  const onPrefChange = () => {
    if (destroyed) return;
    if (!motionAllowed()) {
      stopLoop();
      finaliseEntrance();
      current = target;
      render();
    } else if (current !== target) {
      ensureLoop();
    }
  };
  if (rmq.addEventListener) rmq.addEventListener('change', onPrefChange);
  else if (rmq.addListener) rmq.addListener(onPrefChange);

  return {
    /** The injected wrapper. Everything this engine made lives inside it. */
    root,
    /**
     * [{ el, grammar, spec, index }] in config order.
     *
     * A GETTER, not a captured property. `configure()` rebuilds every card and REASSIGNS the
     * internal array, so a plain `cards,` would hand the caller the pre-configure nodes forever —
     * still reachable through the handle, no longer in the document. `destroy()` empties it the
     * same way.
     */
    get cards() { return cards; },
    supported: true,

    /** The eased progress actually on screen this frame, not the value setProgress asked for. */
    get progress() { return current; },
    /** The scale multiplier currently applied to the row. */
    get scale() { return lerp(activeScale[0], activeScale[1], smoother(clamp01(current))); },

    /**
     * 0..1, clamped. 0 = the row at its base width, 1 = fully scaled up. What that maps to is the
     * PAGE's decision (CONTRACT §3) — the mapping technique 13 describes is "where the row's own
     * box is in the viewport", which is a function of the ROW, not of the document.
     */
    setProgress(p) {
      if (destroyed) return;
      target = clamp01(Number(p) || 0);
      // With the preference on, or the lerp disabled, there is no loop to ease it — land now.
      // This is the path that keeps a reduced-motion visitor's own scrolling answered.
      if (!motionAllowed() || C.ease <= 0) { current = target; render(); return; }
      ensureLoop();
    },

    /**
     * Merge new config and rebuild. The cards are rebuilt from scratch because their CONTENT is
     * config here — there is no adopted markup to preserve — so a changed `cards` array is a
     * changed row, not a re-styled one. Progress survives.
     */
    configure(next = {}) {
      if (destroyed) return;
      C = normalise(Object.assign({}, C, next));
      buildCards();
      applyVars();
      motionAllowed();
      layout();
      render();
      bindHover();
      // A rebuild replaces every node, so the entrance state went with them. Replay it only if
      // one was configured and motion is allowed; otherwise the new cards are simply there.
      finaliseEntrance();
      if (C.entrance && motionAllowed()) startEntrance();
    },

    /** Force a re-measure. Only needed if the container resizes without the observer noticing. */
    relayout() { if (!destroyed) { layout(); render(); } },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      if (enterTimer) { clearTimeout(enterTimer); enterTimer = 0; }
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', onWinResize);
      if (rmq.removeEventListener) rmq.removeEventListener('change', onPrefChange);
      else if (rmq.removeListener) rmq.removeListener(onPrefChange);
      // Every listener this engine bound is on a node it created, so removing the root takes
      // them with it. The style tag is ours alone — one per instance, exactly so this line can
      // be unconditional.
      root.remove();
      style.remove();
      cards = [];
    },
  };
}

export default initCardGrammar;
