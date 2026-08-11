/**
 * capsule-controls — one capsule primitive doing nav, CTA and input.
 * ─────────────────────────────────────────────────────────────────────────
 * A MERGE of three corpus clips. Each owns a different half of a control, and a control with
 * geometry but no state — or state but no geometry — is half a component.
 *
 *   clip 3 (NomadaToast, VERIFIED) — THE GEOMETRY.
 *     @0s   "Cream pill fused to a dark circular icon button (top-right CTA)": a pale cream
 *           capsule holding a short label with a solid near-black circle butted into its RIGHT
 *           end carrying a white arrow. "The circle is inset by ~4px so the pill's fill forms a
 *           visible ring around it."
 *     @4.4s "Hero email/subscribe input as a wide rounded pill with an inset dark circular ↗
 *           submit": near-white capsule field, dark left-aligned placeholder inset ~14px,
 *           "height ~2.4x the cap-height of its text", dark circle carrying a white NORTH-EAST
 *           arrow (↗, not →) inset ~4px at the right, two lines of very low-opacity consent
 *           microcopy beneath, and NO label above — the placeholder does the labelling. The
 *           corpus draws the conclusion itself: "Same construction reappears as the hero's email
 *           input at 4.4s — ONE COMPONENT, TWO JOBS."
 *     @7.8s "Dark micro-caps eyebrow chip above the headline": "a soft ~4px radius, distinct
 *           from the capsule nav… height is barely taller than the type."
 *     @0s   "Floating charcoal pill nav, centre-top, four items" — the third job.
 *     Across eight seconds of that clip: not one drop shadow, gradient fill, border or hover
 *     glow on any element, and exactly TWO radius languages — fully-rounded for anything
 *     interactive or navigational, ~4px for the static chip. Nothing in between, nothing square.
 *
 *   clip 4 (uiverse.io, VERIFIED, frame-counted at 30fps) — THE STATE.
 *     @7.5s "Button hover that inverts fill→outline and never moves": rest is a solid fill with
 *           a dark label. On hover over ~5 frames at 30fps (≈165ms) the fill drops to
 *           TRANSPARENT revealing the canvas, the fill colour migrates to a ~1.5px border AND to
 *           the label, and a wide soft shadow blooms outward. "Critically the button does NOT
 *           translate, scale, or lift — it stays pinned to the pixel, so nothing around it
 *           reflows." Exit is symmetric (~150ms).
 *     @7.6s "Idle sparkle field on the hovered state, out of phase": ~5 four-point stars twinkle
 *           around a HELD hover, "no two peak on the same frame — so each has its own
 *           animation-delay and slightly different duration". The rest state is silent.
 *     @13.5s "Copy button confirms in place by swapping its own label": the icon stays put, the
 *           word 'Copy' is replaced by a checkmark, the pill contracts to fit. "No toast, no
 *           modal, no page-level notification."
 *     @4.5s "Day/night toggle: sun-to-moon crescent morph by occlusion" contributes its TIMING
 *           LAW and not its widget: four sub-animations at deliberately different rates — "~6
 *           tiny white star dots fade in on the left half and finish BEFORE the track finishes
 *           darkening". One shared duration is the tell of a machine-generated transition, and
 *           nothing in the whole clip takes longer than half a second.
 *
 *   clip 6 (ZOI ICE TEA, INFERRED) — THE SCARCITY AND THE PADDING.
 *     craft_details: "The ghost CTA is a fully-rounded stadium outline, ~1px stroke at maybe 40%
 *     white, transparent fill, with side padding roughly equal to the label's own width. It is
 *     bottom-right, small, and it is the only call to action in sixteen seconds of page."
 *     Padding derived from the label's own rendered width, never from a spacing token; and
 *     exactly ONE of them. `cta.max` is that second observation written as an assert.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS JAVASCRIPT AND NOT A STYLESHEET IN DISGUISE
 *
 * Every number above is a RATIO TO A CAP HEIGHT, and CSS cannot see a cap height. `font-size` is
 * the em box; the cap is a property of the FACE, and it moves by roughly a tenth between a
 * system stack and a webfont at the same font-size. Derive the 2.4x field height from font-size
 * and it is wrong for every face you did not test.
 *
 * So the cap is measured at the RENDERED size with canvas
 * `measureText().actualBoundingBoxAscent` against the element's own resolved font shorthand,
 * re-measured on `document.fonts.ready` and on ResizeObserver, and published as `--sc-cap`.
 * Everything else is calc() off that: the 2.4x height, the 4px ring, the leading inset, and the
 * ghost's label-derived padding all survive a webfont swap and a responsive clamp() because none
 * of them is a magic pixel.
 *
 * The second thing only JS can do here: report each control's LIVE contrast against whatever
 * ground it actually landed on. `resolveGround()` composites the ancestor chain's
 * background-colours; a transparent-filled control whose label falls under the required ratio —
 * or whose ground cannot be resolved at all — has a blurred backdrop plate engaged for it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONE PLACE THE CLIPS DISAGREE, AND WHICH ONE WINS
 *
 * Clip 4's button carries "one small drop shadow" AT REST. Clip 3 carries none, anywhere, on
 * anything, for eight seconds. Clip 3 wins: rest is flat. The bloom exists only while the
 * pointer is on the control — which is also the only reading under which clip 4's own sentence,
 * "the whole visual budget goes into colour and glow", describes a state change rather than a
 * decoration.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONTRACT NOTES, STATED RATHER THAN SILENTLY SKIPPED
 *
 *  · §3 (the page owns scroll). There is deliberately NO setProgress here: nothing in this
 *    effect is a function of scroll position, and a no-op setProgress would be theatre. What §3
 *    forbids is met absolutely — grep this file for 'scroll' and you find only this sentence.
 *  · §5 (clamp DPR before you allocate). Nothing is allocated. The one canvas is an offscreen
 *    measuring rig that is never painted, never appended and never sized; there is no backing
 *    store to cap.
 *  · §7 (namespace and aria-hide what you inject). CARVE-OUT, the same one fixed-hud made for
 *    its chapter rail: these are real buttons and real labelled inputs. Everything DECORATIVE
 *    this engine injects — arrow glyphs, sparkles, the backdrop plate — is aria-hidden. The
 *    label wrapper is not, because it carries the accessible name. Focus rings are left alone.
 *    A control hidden from assistive tech is a bug wearing a contract as a costume.
 *  · §1 (nothing on import). The stylesheet is injected by the first init() and refcounted out
 *    by the last destroy().
 *
 * ─────────────────────────────────────────────────────────────────────────
 *   import { initCapsuleControls } from './engine.js'
 *   const caps = initCapsuleControls(document.body, {
 *     radii: { interactive: 999, static: 4 },
 *     hoverMs: 165, exitMs: 150, morphMs: 320,
 *     cta: { max: 1, warn: true },
 *   })
 *   caps.report()            // measured cap, derived geometry, live contrast, per control
 *   caps.confirm(button)     // fire the in-place confirm without a click
 *   caps.destroy()
 *
 *   <button data-sc-capsule="cta" data-sc-confirm="Copied">Subscribe</button>
 *   <form   data-sc-capsule="field"><input …><button data-sc-capsule="submit" …></button></form>
 *   <span   data-sc-capsule="chip">UK based</span>
 *
 * prefers-reduced-motion, and the distinction IS the §4 argument:
 *   · The hover invert is a direct response to the visitor's own pointer. It KEEPS WORKING, at
 *     full speed, unchanged — and under the preference a hovered control rests on a REAL frame
 *     of itself: the hovered state as it actually looks, not the un-hovered one.
 *   · The in-place confirm is a response to a click. It continues, snapping rather than easing
 *     when it cannot land inside `rmSnapMs`.
 *   · What STOPS is everything autonomous: the idle sparkle field around a held hover, and with
 *     it the only rAF loop in the file.
 *   Live matchMedia — re-read inside the frame callback AND subscribed to 'change' — never a
 *   boot flag.
 */

const RM_QUERY = '(prefers-reduced-motion: reduce)';
const NAME = 'capsule-controls';
const STYLE_ID = 'sc-capsule-controls-style';

/** Roles that are a control rather than a shell or a static mark. */
const INTERACTIVE = new Set(['cta', 'navitem', 'ghost']);

const DEFAULTS = {
  /**
   * EXACTLY TWO radius languages, and report().radii proves it rather than claiming it. Clip 3
   * runs fully-rounded for everything interactive or navigational and a soft ~4px for the static
   * eyebrow chip, with nothing in between and nothing square. A third radius is the fastest way
   * to make a set of controls read as assembled rather than designed.
   */
  radii: { interactive: 999, static: 4 },

  /**
   * Frame-counted off clip 4 at 30fps: enter ~5 frames (165ms), exit ~150ms, the copy button's
   * morph 300-350ms. These are the BASE durations only. Every sub-property multiplies them by
   * its own fraction — see DESYNC in the stylesheet, which is where the craft actually lives.
   */
  hoverMs: 165,
  exitMs: 150,
  morphMs: 320,

  /**
   * Clip 6's scarcity, as an assert. One primary CTA per root. `warn:true` reports a violation
   * on console.ERROR and not console.warn, deliberately: verify.mjs fails a page on console
   * errors and ignores warnings, so a warn is an assert nobody ever sees, and an assert nobody
   * sees is not an assert. It never throws — a component rule that takes a page down would be
   * worse than the thing it is policing (§6).
   */
  cta: { max: 1, warn: true },

  /**
   * The ring, px. Clip 3's circle is "inset by ~4px so the pill's fill forms a visible ring
   * around it". This one number appears in three places by design: around the CTA's circle,
   * around the field's submit, and as the nav shell's padding around its items. That reuse is
   * what makes three different controls read as one primitive rather than three components.
   */
  ring: 4,

  /**
   * Clip 3 @4.4s: field height ≈ 2.4x the CAP HEIGHT of its own text. Not 2.4x font-size — see
   * the header. This is the headline measurement of the whole effect.
   */
  fieldRatio: 2.4,
  /** Clip 3 @7.8s: the chip is "barely taller than the type". */
  chipRatio: 1.6,

  /**
   * Leading inset, in CAP HEIGHTS. The corpus pins one point — "~14px" — and says nothing about
   * how it scales, so the multiple is this engine's interpolation, stated as one: 0.9 reproduces
   * 14px at a ~15.5px cap, the cap a ~21px neo-grotesque has. If your type is far from that,
   * this is the knob.
   */
  padLead: 0.9,
  /** Trailing inset for a capsule with NO circle, in cap heights. With a circle it is `ring`. */
  padTrail: 1.15,

  /**
   * A floor on the height of anything tappable, px. A DEPARTURE, stated: at 2.4x cap a 15px
   * label yields a 26px target, below every tap-size guideline there is. The corpus geometry is
   * preserved wherever the type is large enough to clear the floor, and report() says for each
   * control whether the ratio or the floor won. Set 0 to reproduce the reference exactly and
   * ship a control nobody can hit.
   */
  minTap: 44,

  /**
   * Clip 6's ghost: "side padding roughly equal to the label's own width". Measured off the
   * label's RENDERED width with the same canvas rig as the cap height — never a spacing token.
   * The clamp is a departure and it is here because the corpus ghost carries a SHORT label:
   * ratio 1.0 on 'Get early access now' would produce a pill three times the width of its own
   * text. Bounds are in cap heights: 8 caps is about a seven-character uppercase label at these
   * sizes, and past that the ratio is drawing a pill wider than the sentence it interrupts.
   */
  ghostPad: { ratio: 1.0, minCap: 1.0, maxCap: 8.0 },

  /**
   * Clip 4 @7.6s. Five four-point stars, each with its own delay and duration so no two peak on
   * the same frame. Autonomous, therefore silent under prefers-reduced-motion. 0 drops them
   * entirely; the invert does not depend on them.
   */
  sparkles: 5,

  /**
   * Where the plate goes for a control whose label fails the required contrast against its
   * resolved ground. 'auto' engages it only when the measurement says so; 'always' and 'never'
   * are the manual overrides, and 'never' is the positive control for contrast-check.
   *
   * It is a blurred rounded rect on a ::before of the CONTROL, which carries no text of its own
   * once its label is wrapped — so it survives contrast-check's visibility:hidden pass and is
   * measured as what it really is, the thing behind the text. A text-shadow would vanish with
   * the glyphs and measure as a lie. fixed-hud paid for this lesson already: 2.11:1 with a
   * text-shadow over an orange ground versus 9.21:1 with a real backdrop layer.
   */
  backdrop: 'auto',

  /** WCAG floors used by the contrast report and by backdrop:'auto'. */
  contrast: { text: 4.5, largeText: 3, stroke: 3 },

  /** Milliseconds the in-place confirm holds before reverting. 0 never reverts. */
  confirmHoldMs: 1500,
  /** Under reduced motion a morph longer than this snaps instead of easing. */
  rmSnapMs: 100,

  /** `(el, word) => void`, after the confirm has been applied. The engine shows no toast. */
  onConfirm: null,

  /** The glyph the CTA's circle carries. Clip 3's CTA is '→'; its FIELD is '↗', not '→'. */
  ctaGlyph: 'arrow-e',
  submitGlyph: 'arrow-ne',

  /** Character measured for the cap height. 'H' is a flat-topped cap in every Latin face. */
  probe: 'H',
};

/* ── the glyphs, drawn ────────────────────────────────────────────────────────
 * Stroked paths on a 24-box in currentColor, so they invert with the label and cost no request.
 * Nothing here can 404 and nothing needs an icon font. */
const PATHS = {
  'arrow-e': 'M4.5 12h13M12.5 7l5 5-5 5',
  'arrow-ne': 'M7.5 16.5 16.5 7.5M8.5 7.5h8v8',
  check: 'M5 12.5l4.5 4.5L19 7',
};
/** Four-point star, filled. The concave sides are what separate a sparkle from a diamond. */
const SPARKLE_D = 'M12 0c.9 7.6 3.5 10.2 12 12-8.5 1.8-11.1 4.4-12 12-.9-7.6-3.5-10.2-12-12 8.5-1.8 11.1-4.4 12-12z';

/**
 * The five sparkles of clip 4 @7.6s, read off the frame: "one large outside top-left, one small
 * on the top-left border, one small right of the label, one medium outside right, one tiny under
 * the label." x/y are fractions of the control's own box, so they follow it at any size. `dur`
 * and `off` are deliberately incommensurate — the corpus note is that no two peak on the same
 * frame, and equal durations at equal offsets is the failure mode this exists to avoid.
 */
const SPARKLE_SEATS = [
  { x: -0.055, y: -0.28, size: 15, dur: 1.34, off: 0.00 },
  { x: 0.06, y: 0.04, size: 8, dur: 0.97, off: 0.41 },
  { x: 0.74, y: 0.12, size: 7, dur: 1.13, off: 0.66 },
  { x: 1.03, y: 0.44, size: 11, dur: 1.51, off: 0.19 },
  { x: 0.5, y: 0.94, size: 6, dur: 0.86, off: 0.84 },
];

/* ── the stylesheet ───────────────────────────────────────────────────────────
 * Shared by every instance and refcounted, so two roots on one page share one <style>. Nothing
 * per-instance is baked in: durations, radii and geometry arrive as custom properties on the
 * root and on each control, which is also what lets a host restyle from its own sheet.
 *
 * Defaults live on the root so that a host setting --sc-cap-fill anywhere closer — on body, on a
 * section, on the control — wins by ordinary inheritance. Baking them into the
 * [data-sc-capsule] rule instead would out-specify every host override.
 *
 * :where(:root), NOT :root. Inheritance only settles ties between DIFFERENT elements; a host
 * that declares the palette on :root too is declaring on the SAME element, and there the
 * ordinary cascade decides. Bare :root is (0,1,0) and this sheet is appended to <head> at
 * init, so it landed last and beat the host's identical (0,1,0) on source order — silently
 * discarding the whole palette. Measured on sites/ledger before this line changed: its
 * :root --sc-cap-fill:#eaf1fb computed to the engine's #f2ece1 and its --sc-cap-ground:#070b12
 * computed to #0b0c0e, brand palette entirely inert, nothing logged. sites/kiln's author hit
 * the same wall and worked around it by moving everything to body. :where() drops this block
 * to specificity 0, so :root, html, body, a section and the control itself ALL beat it while
 * the author origin still beats the UA — which is what the paragraph above always claimed.
 * Same cascade argument as `font: inherit` below, which already had this protection.
 *
 * DESYNC — why this block is written longhand instead of `transition: all 200ms`.
 * Clip 4's toggle runs four sub-animations at deliberately different rates: the star dots finish
 * before the track finishes darkening. One shared duration is the tell of a machine-generated
 * transition. So every sub-property below gets its own multiple of the base and its own delay,
 * and enter and exit use DIFFERENT fraction sets: on the way in the outline arrives before the
 * fill has finished leaving; on the way out the bloom is the last thing to go.
 */
const CSS = `
:where(:root){
  --sc-cap-r-interactive:999px; --sc-cap-r-static:4px;
  --sc-cap-hover:165ms; --sc-cap-exit:150ms; --sc-cap-morph:320ms; --sc-cap-ring:4px;
  --sc-cap-stroke:1.5px;          /* clip 4: the border the fill migrates into */
  --sc-cap-stroke-hair:1px;       /* clip 6: the ghost's own, thinner, stroke */
  --sc-cap-ground:#0b0c0e;        /* what the invert reveals */
  --sc-cap-fill:#f2ece1;          /* clip 3's pale cream */
  --sc-cap-mark:var(--sc-cap-fill);   /* the colour that migrates to border AND label */
  --sc-cap-ink:#14161a;           /* label on the fill */
  /* The disc is its OWN pair, defaulting to the label's. It has to be: in the quiet register a
     navitem's --sc-cap-ink is the light LABEL colour, and a disc that inherited it came out a
     blank cream coin with an invisible arrow on it. Found by looking at a screenshot, which is
     the only instrument that catches a glyph the same colour as the thing under it. */
  --sc-cap-disc:var(--sc-cap-ink);
  --sc-cap-disc-ink:var(--sc-cap-fill);
  /* The quiet register's own pair. It has to be its own pair for the same reason the disc does:
     these resolve HERE, on :root, so a host recolouring --sc-cap-fill on a nav item cannot drag
     the quiet fill and the CTA's fill apart from each other by accident. 12% is the demo's
     measured value for "barely there" over the dark ground. */
  --sc-cap-quiet-fill:rgba(242,236,225,.12);
  --sc-cap-quiet-ink:var(--sc-cap-fill);
  --sc-cap-accent:#14161a;
  --sc-cap-bloom:rgba(242,236,225,.20);
  --sc-cap-bloom-blur:34px; --sc-cap-bloom-spread:1px;
  --sc-cap-nav-fill:rgba(20,22,26,.85);
  --sc-cap-field-fill:#f7f4ef; --sc-cap-field-ink:#14161a; --sc-cap-field-hint:#4a4d53;
  --sc-cap-chip-fill:#24272d; --sc-cap-chip-ink:#f2ece1;
  --sc-cap-ghost-ink:#efe7da; --sc-cap-ghost-stroke:rgba(255,255,255,.4); --sc-cap-ghost-on:#0b0c0e;
  /* 0.62, not 0.86. At 0.86 the plate stops reading as a halo and starts reading as a filled
     pill — which would quietly turn the ghost into the solid CTA it is supposed to be the
     opposite of. 0.62 over a saturated orange still measures 8.3:1 for a cream label, which is
     most of a stop of headroom over the 4.5 required. Measured, not guessed. */
  --sc-cap-plate:rgba(8,9,11,.62);
}
[data-sc-capsule]{box-sizing:border-box}

/* --- the primitive ------------------------------------------------------- */
/* The UA gives a <button> a font of its own, so the primitive has to reset it — but this sheet is
   appended to <head> at init and so beats every host declaration of the SAME specificity on
   source order alone. A host authoring [data-sc-capsule="ghost"]{font-size:13px} got 16px and no
   way to see why. :where() drops this declaration to specificity 0 so any host rule wins it,
   while the author origin still beats the UA. Same cascade argument as the palette block above,
   and these two :where()s are the only declarations in this sheet a host can beat without
   out-specifying it. Everything below is (0,1,0) and lands last — see SKILL.md, Failure 2. */
:where([data-sc-capsule="cta"],[data-sc-capsule="navitem"],[data-sc-capsule="ghost"]){font:inherit}
[data-sc-capsule="cta"],[data-sc-capsule="navitem"],[data-sc-capsule="ghost"]{
  position:relative;display:inline-flex;align-items:center;justify-content:center;
  height:var(--sc-cap-h);padding:0 var(--sc-cap-pad-trail) 0 var(--sc-cap-pad-lead);
  border:0;border-radius:var(--sc-cap-r-interactive);
  line-height:1;text-decoration:none;white-space:nowrap;cursor:pointer;
  -webkit-appearance:none;appearance:none;
  background-color:var(--sc-cap-fill);color:var(--sc-cap-ink);
  /* Declared at rest at zero size so the bloom has something to grow FROM. A box-shadow
     transitioning out of 'none' snaps instead of blooming. */
  box-shadow:0 0 0 0 rgba(0,0,0,0);
  /* EXIT timings — the base rule is what plays when the pointer leaves. */
  transition:
    background-color calc(var(--sc-cap-exit) * 1.00) ease-out calc(var(--sc-cap-exit) * 0.10),
    color            calc(var(--sc-cap-exit) * 0.72) ease-out 0ms,
    box-shadow       calc(var(--sc-cap-exit) * 1.45) ease-out calc(var(--sc-cap-exit) * 0.06);
}
/* The quiet register. Without this rule a navitem takes the CTA's fill and ink from the block
   above and renders IDENTICALLY to it — measured rgb(242,236,225) on rgb(20,22,26) for both — so
   a four-item nav reads as four primary buttons and the cta.max scarcity assert is defeated
   visually while its own count still passes. The role existed only in the demo's own stylesheet
   until this rule; it is now the engine's. */
[data-sc-capsule="navitem"]{
  background-color:var(--sc-cap-quiet-fill);color:var(--sc-cap-quiet-ink);
}
/* The stroke lives on an inset overlay, NOT on the border property. A real border appearing on
   hover moves the content box by its own width — 1.5px of jitter under the pointer, and every
   sibling in a flex row shifts with it. Failure mode (1), closed off at the source: there is no
   geometry left to change, only a colour. */
[data-sc-capsule="cta"]::after,[data-sc-capsule="navitem"]::after,[data-sc-capsule="ghost"]::after{
  content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  border:var(--sc-cap-stroke) solid transparent;
  transition:border-color calc(var(--sc-cap-exit) * 0.60) ease-out calc(var(--sc-cap-exit) * 0.28);
}
[data-sc-capsule="cta"]:hover,[data-sc-capsule="navitem"]:hover,
[data-sc-capsule="cta"]:focus-visible,[data-sc-capsule="navitem"]:focus-visible{
  background-color:transparent;
  color:var(--sc-cap-mark);
  box-shadow:0 0 var(--sc-cap-bloom-blur) var(--sc-cap-bloom-spread) var(--sc-cap-bloom);
  /* ENTER timings. Different fractions from the exit set, and the FILL is the slowest of the
     three colour moves, so the label has already changed hands by the time the ground shows. */
  transition:
    background-color calc(var(--sc-cap-hover) * 1.00) ease-in-out 0ms,
    color            calc(var(--sc-cap-hover) * 0.79) ease-out calc(var(--sc-cap-hover) * 0.12),
    box-shadow       calc(var(--sc-cap-hover) * 1.58) ease-out calc(var(--sc-cap-hover) * 0.24);
}
[data-sc-capsule="cta"]:hover::after,[data-sc-capsule="navitem"]:hover::after,
[data-sc-capsule="cta"]:focus-visible::after,[data-sc-capsule="navitem"]:focus-visible::after{
  border-color:var(--sc-cap-mark);
  transition:border-color calc(var(--sc-cap-hover) * 0.67) ease-out 0ms;
}

/* --- the ghost: the same grammar resting at the other end of the invert ---- */
[data-sc-capsule="ghost"]{
  background-color:transparent;color:var(--sc-cap-ghost-ink);
  padding:0 var(--sc-cap-ghost-pad);
}
[data-sc-capsule="ghost"]::after{
  border-width:var(--sc-cap-stroke-hair);border-color:var(--sc-cap-ghost-stroke);
}
[data-sc-capsule="ghost"]:hover,[data-sc-capsule="ghost"]:focus-visible{
  background-color:var(--sc-cap-ghost-ink);color:var(--sc-cap-ghost-on);
  box-shadow:0 0 var(--sc-cap-bloom-blur) var(--sc-cap-bloom-spread) var(--sc-cap-bloom);
  transition:
    background-color calc(var(--sc-cap-hover) * 1.00) ease-in-out 0ms,
    color            calc(var(--sc-cap-hover) * 0.79) ease-out calc(var(--sc-cap-hover) * 0.12),
    box-shadow       calc(var(--sc-cap-hover) * 1.58) ease-out calc(var(--sc-cap-hover) * 0.24);
}
[data-sc-capsule="ghost"]:hover::after,[data-sc-capsule="ghost"]:focus-visible::after{
  border-color:transparent;
  transition:border-color calc(var(--sc-cap-hover) * 0.67) ease-out 0ms;
}

/* The backdrop plate. A ::before on the CONTROL, which carries no text once its label is
   wrapped, so contrast-check's visibility:hidden pass leaves it standing and measures it.
   z-index 0 rather than -1: the control is position:relative with no z-index of its own, so it
   creates no stacking context, and a -1 pseudo would sink behind the SECTION's background
   instead of sitting between the section and the label. */
[data-sc-capsule][data-sc-backdrop]::before{
  content:'';position:absolute;z-index:0;
  inset:calc(-1 * var(--sc-cap-plate-pad));
  border-radius:calc(var(--sc-cap-plate-pad) * 1.7 + var(--sc-cap-h) / 2);
  background:var(--sc-cap-plate);
  filter:blur(var(--sc-cap-plate-blur));
  pointer-events:none;
}
[data-sc-capsule][data-sc-backdrop] > *{position:relative;z-index:1}

/* --- the circle butted into the right end --------------------------------- */
[data-sc-circle]{
  flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
  width:var(--sc-cap-circle);height:var(--sc-cap-circle);border-radius:999px;
  margin-left:var(--sc-cap-circle-gap);
  background-color:var(--sc-cap-disc);color:var(--sc-cap-disc-ink);
  transition:
    background-color calc(var(--sc-cap-exit) * 1.20) ease-out calc(var(--sc-cap-exit) * 0.18),
    color            calc(var(--sc-cap-exit) * 0.55) ease-out 0ms;
}
[data-sc-capsule]:hover [data-sc-circle],[data-sc-capsule]:focus-visible [data-sc-circle]{
  background-color:var(--sc-cap-mark);color:var(--sc-cap-ground);
  transition:
    background-color calc(var(--sc-cap-hover) * 1.21) ease-out calc(var(--sc-cap-hover) * 0.18),
    color            calc(var(--sc-cap-hover) * 0.73) ease-out calc(var(--sc-cap-hover) * 0.36);
}
[data-sc-circle] svg{width:56%;height:56%;display:block;overflow:visible}

/* --- field: the identical construction doing the second job --------------- */
[data-sc-capsule="field"]{
  position:relative;display:flex;align-items:center;
  height:var(--sc-cap-h);border-radius:var(--sc-cap-r-interactive);
  background-color:var(--sc-cap-field-fill);
  padding:var(--sc-cap-ring);padding-left:var(--sc-cap-pad-lead);
}
[data-sc-capsule="field"] input,[data-sc-capsule="field"] textarea{
  flex:1 1 auto;min-width:0;height:100%;
  border:0;background:transparent;outline-offset:3px;
  font:inherit;line-height:1;color:var(--sc-cap-field-ink);
}
[data-sc-capsule="field"] input::placeholder{color:var(--sc-cap-field-hint);opacity:1}
[data-sc-capsule="submit"]{
  flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
  width:var(--sc-cap-circle);height:var(--sc-cap-circle);
  border:0;border-radius:999px;padding:0;margin-left:var(--sc-cap-circle-gap);cursor:pointer;
  -webkit-appearance:none;appearance:none;
  background-color:var(--sc-cap-disc);color:var(--sc-cap-field-fill);
  transition:
    background-color calc(var(--sc-cap-exit) * 1.20) ease-out calc(var(--sc-cap-exit) * 0.18),
    color            calc(var(--sc-cap-exit) * 0.55) ease-out 0ms;
}
[data-sc-capsule="submit"]:hover,[data-sc-capsule="submit"]:focus-visible{
  background-color:var(--sc-cap-accent);
  transition:background-color calc(var(--sc-cap-hover) * 1.10) ease-out 0ms;
}
[data-sc-capsule="submit"] svg{width:56%;height:56%;display:block;overflow:visible}

/* --- nav shell: the ring for a third time, this time as padding ----------- */
[data-sc-capsule="nav"]{
  display:inline-flex;align-items:center;gap:var(--sc-cap-ring);
  padding:var(--sc-cap-ring);border-radius:var(--sc-cap-r-interactive);
  background-color:var(--sc-cap-nav-fill);
}

/* --- chip: the ONLY element in the set that is not fully rounded ---------- */
[data-sc-capsule="chip"]{
  position:relative;display:inline-flex;align-items:center;height:var(--sc-cap-h);
  padding:0 calc(var(--sc-cap) * 0.62);border-radius:var(--sc-cap-r-static);
  background-color:var(--sc-cap-chip-fill);color:var(--sc-cap-chip-ink);
}

/* --- the label box: what makes the in-place confirm possible -------------- */
[data-sc-label]{
  position:relative;display:inline-grid;overflow:hidden;
  width:var(--sc-cap-label-w,auto);
  transition:width calc(var(--sc-cap-morph) * 1.00) cubic-bezier(.32,.72,.28,1) 0ms;
}
/* justify-self:center, and it is load-bearing rather than cosmetic. A stretched grid item is as
   wide as its column, so the confirm's checkmark measured the width of the word it was replacing
   and the pill "contracted" from 132px to 132px. Intrinsic width is the only measurement that
   can answer "contract to fit". */
[data-sc-label] > span{
  grid-area:1/1;justify-self:center;white-space:nowrap;
  display:inline-flex;align-items:center;justify-content:center;
}
/* Clip 4 @13.5s: "the clipboard icon stays put and the word 'Copy' is replaced by a checkmark".
   A child marked data-sc-keep is not moved into the label box, so it does not fade with the
   label and the pill contracts around it. There is no way to honour "the icon stays put" without
   a way for the host to say which child is the icon. */
[data-sc-capsule] > [data-sc-keep]{
  flex:0 0 auto;display:inline-flex;align-items:center;margin-right:calc(var(--sc-cap) * 0.46);
}
[data-sc-label] > [data-sc-face="rest"]{
  transition:opacity calc(var(--sc-cap-morph) * 0.28) linear 0ms;
}
[data-sc-label] > [data-sc-face="done"]{
  opacity:0;
  transition:opacity calc(var(--sc-cap-morph) * 0.44) linear calc(var(--sc-cap-morph) * 0.19);
}
/* 1.5em, not 1em. The check's own path spans 58% of its 24-box, so a 1em glyph draws a mark
   barely half the cap height and the confirmed pill reads as empty. Sized by eye against a
   screenshot of the settled state. */
[data-sc-label] > [data-sc-face="done"] svg{width:1.5em;height:1.5em;display:block;overflow:visible}
[data-sc-confirming] [data-sc-face="rest"]{opacity:0}
[data-sc-confirming] [data-sc-face="done"]{opacity:1}

/* --- sparkles ------------------------------------------------------------- */
[data-sc-sparkles]{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:2}
[data-sc-sparkles] svg{
  position:absolute;display:block;overflow:visible;opacity:0;
  color:var(--sc-cap-mark);fill:currentColor;
}

/* Visually-hidden live region. The confirmation happens INSIDE the control, which announces
   nothing on its own; this is how a screen reader is told, and it is still not a toast. */
.sc-cap-status{
  position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0;
}
`;

/* ── colour: sRGB, WCAG, and compositing an ancestor chain ────────────────── */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Parse any computed colour Chrome hands back — rgb(), rgba(), color(srgb …), transparent. */
function parseColour(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (s === 'transparent' || s === 'none') return [0, 0, 0, 0];
  const isColorFn = /^color\(/i.test(s);
  const m = s.match(/-?[\d.]+(?:e-?\d+)?%?/g);
  if (!m || m.length < 3) return null;
  // color(srgb 0 0 1 / .5) reports 0..1 components; rgb() reports 0..255. Told apart by the
  // function name rather than by guessing from magnitudes — rgb(0 0 1) is a legal near-black.
  const k = isColorFn ? 255 : 1;
  const n = m.map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v)));
  const [r, g, b] = [n[0] * k, n[1] * k, n[2] * k];
  const a = n.length > 3 ? n[3] : 1;
  if (![r, g, b, a].every(Number.isFinite)) return null;
  return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255), clamp(a, 0, 1)];
}

const srgbToLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
const ratio = (a, b) => {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** src over dst; dst is assumed opaque, which is true of everything resolveGround returns. */
const over = (src, dst) => [
  src[3] * src[0] + (1 - src[3]) * dst[0],
  src[3] * src[1] + (1 - src[3]) * dst[1],
  src[3] * src[2] + (1 - src[3]) * dst[2],
  1,
];
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * The ground a control actually landed on, by compositing the ancestor chain's background
 * colours until one is opaque. Returns null when nothing in the chain is opaque, or when a
 * background-IMAGE intervenes — which is the honest answer over a canvas, a photograph or a
 * gradient, and is treated by the backdrop decision as "unknown, assume the worst" rather than
 * being guessed at.
 */
function resolveGround(el) {
  const stack = [];
  for (let n = el.parentElement; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
    const c = parseColour(cs.backgroundColor);
    if (!c || c[3] === 0) continue;
    stack.push(c);
    if (c[3] >= 0.999) {
      let out = stack.pop();
      while (stack.length) out = over(stack.pop(), out);
      return out;
    }
  }
  return null;
}

/* ── cap-height measurement ───────────────────────────────────────────────── */

let measureCtx = null;
let capWarned = false;

function ctx2d() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

/**
 * The element's resolved font as a canvas shorthand. Line-height is omitted deliberately: it
 * changes nothing about glyph metrics and it is the token most likely to be rejected by the
 * canvas font parser.
 */
function fontShorthand(cs) {
  const style = cs.fontStyle && cs.fontStyle !== 'normal' ? cs.fontStyle + ' ' : '';
  return `${style}${cs.fontWeight || 400} ${cs.fontSize} ${cs.fontFamily}`;
}

function applyFont(c, cs) {
  c.font = fontShorthand(cs);
  // Chrome 99+. Tracking changes advance width, which the ghost's padding is derived from.
  if ('letterSpacing' in c) c.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
}

/**
 * Cap height in CSS px, measured at the RENDERED size. This is the whole reason the file is JS.
 * Falls back to 0.72 x font-size — the neo-grotesque estimate kinetic-marquee uses — and says so
 * once, because a silent fallback is the same bug as never measuring. §6: it never throws.
 */
function measureCap(cs) {
  const fs = parseFloat(cs.fontSize) || 16;
  try {
    const c = ctx2d();
    if (!c) throw new Error('no 2d context');
    applyFont(c, cs);
    c.textBaseline = 'alphabetic';
    const asc = c.measureText(DEFAULTS.probe).actualBoundingBoxAscent;
    if (Number.isFinite(asc) && asc > 0) return asc;
    throw new Error('no actualBoundingBoxAscent');
  } catch (err) {
    if (!capWarned) {
      capWarned = true;
      console.warn(`[${NAME}] cap height not measurable (${err.message}); falling back to 0.72 x font-size`);
    }
    return fs * 0.72;
  }
}

/** Rendered advance width of a string at the element's own font. Never a spacing token. */
function measureWidth(cs, text) {
  try {
    const c = ctx2d();
    if (!c) return 0;
    applyFont(c, cs);
    const t = cs.textTransform === 'uppercase' ? String(text).toUpperCase()
      : cs.textTransform === 'lowercase' ? String(text).toLowerCase() : String(text);
    return c.measureText(t).width;
  } catch { return 0; }
}

/* ── the shared stylesheet, refcounted ───────────────────────────────────── */

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

const SVGNS = 'http://www.w3.org/2000/svg';
function makeSvg(d) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('data-sc', NAME);              // §7: every injected node, not just the wrappers
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', d);
  s.appendChild(p);
  return { s, p };
}
function strokeGlyph(name) {
  const { s, p } = makeSvg(PATHS[name] || PATHS['arrow-e']);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  return s;
}

const inert = () => ({
  supported: false,
  controls: [],
  scarcity: null,
  report: () => ({ rows: [], radii: [], scarcity: null, reduced: false }),
  refresh() {},
  confirm() {},
  destroy() {},
});

export function initCapsuleControls(root, config = {}) {
  if (typeof window === 'undefined' || !root || !root.querySelectorAll) return inert();

  const C = {
    ...DEFAULTS, ...config,
    radii: { ...DEFAULTS.radii, ...(config.radii || {}) },
    cta: { ...DEFAULTS.cta, ...(config.cta || {}) },
    ghostPad: { ...DEFAULTS.ghostPad, ...(config.ghostPad || {}) },
    contrast: { ...DEFAULTS.contrast, ...(config.contrast || {}) },
  };

  const nodes = [...root.querySelectorAll('[data-sc-capsule]')];
  if (!nodes.length) {
    console.warn(`[${NAME}] no [data-sc-capsule] elements under the given root — nothing to enhance`);
    return inert();
  }

  mountStyle();

  const rmq = window.matchMedia(RM_QUERY);
  let destroyed = false;
  let raf = 0;
  const records = [];

  /* Root-level custom properties. Per-instance config lives HERE and not in the shared sheet,
   * which is what lets two roots on one page run different timings off one <style>. */
  const rootStyleWas = root.getAttribute('style');
  for (const [k, v] of Object.entries({
    '--sc-cap-r-interactive': C.radii.interactive + 'px',
    '--sc-cap-r-static': C.radii.static + 'px',
    '--sc-cap-hover': C.hoverMs + 'ms',
    '--sc-cap-exit': C.exitMs + 'ms',
    '--sc-cap-morph': C.morphMs + 'ms',
    '--sc-cap-ring': C.ring + 'px',
  })) root.style.setProperty(k, v);

  /* One live region for the whole root. The in-place confirm changes a label silently; without
   * this a screen-reader user gets no confirmation at all, which would be a worse toast than a
   * toast. */
  const status = document.createElement('span');
  status.className = 'sc-cap-status';
  status.setAttribute('data-sc', NAME);
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.appendChild(status);

  /* ── enhance ──────────────────────────────────────────────────────────── */

  function wrapLabel(el, confirmWord) {
    /* Two jobs at once. (1) The confirm needs a box whose width it can animate with the glyph
     * pinned. (2) contrast-check hides the DIRECT PARENT of every text node — so a bare
     * <button>Label</button> is hidden entire, taking its own fill and its ::before plate with
     * it, and the tool then measures the label against whatever is behind the BUTTON. Wrapping
     * the text means the span is hidden and the capsule stays standing, which is the honest
     * measurement: the capsule's fill really is what is behind its label. */
    const rest = document.createElement('span');
    rest.setAttribute('data-sc-face', 'rest');
    rest.setAttribute('data-sc', NAME);
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3 && !n.nodeValue.trim()) { n.remove(); continue; }
      // data-sc-keep stays a direct child, in place: it is the icon that does not move.
      if (n.nodeType === 1 && n.hasAttribute('data-sc-keep')) continue;
      rest.appendChild(n);
    }

    const box = document.createElement('span');
    box.setAttribute('data-sc-label', '');
    box.setAttribute('data-sc', NAME);
    box.appendChild(rest);

    if (confirmWord) {
      const done = document.createElement('span');
      done.setAttribute('data-sc-face', 'done');
      done.setAttribute('data-sc', NAME);
      done.setAttribute('aria-hidden', 'true');
      done.appendChild(strokeGlyph('check'));
      box.appendChild(done);
    }
    el.appendChild(box);
    return box;
  }

  function enhance(el) {
    const role = el.getAttribute('data-sc-capsule');
    const rec = {
      el, role,
      innerWas: el.innerHTML,
      styleWas: el.getAttribute('style'),
      restored: false,
      hot: false, env: 0, painted: false, box: { w: 0, h: 0 },
      sparkles: [], label: null, faces: null, circle: null, sparkleHost: null,
      confirmWord: el.getAttribute('data-sc-confirm') || '',
      confirmTimer: 0, confirming: false,
      cap: 0, height: 0, tapFloored: false, labelText: '',
    };
    records.push(rec);

    if (role === 'field') {
      /* Both authoring forms work. A container carrying the attribute IS the shell; a bare
       * <input data-sc-capsule="field"> gets one, because the ring geometry needs a box that is
       * not the input. Wrapping is enhancement; generating a control would not be. */
      if (el.matches('input,textarea')) {
        const shell = document.createElement('span');
        shell.setAttribute('data-sc', NAME);
        shell.setAttribute('data-sc-capsule', 'field');
        el.parentNode.insertBefore(shell, el);
        const near = el.parentElement?.querySelector('[data-sc-capsule="submit"]');
        shell.appendChild(el);
        if (near) shell.appendChild(near);
        el.removeAttribute('data-sc-capsule');
        rec.shell = shell;
        rec.wrapped = true;
        rec.input = el;
      } else {
        rec.shell = el;
        rec.input = el.querySelector('input,textarea');
      }
      const submit = rec.shell.querySelector('[data-sc-capsule="submit"]');
      if (submit && !submit.querySelector('svg')) {
        submit.appendChild(strokeGlyph(el.getAttribute('data-sc-glyph') || C.submitGlyph));
        rec.submitGlyphAdded = submit;
      }
      if (!rec.input) console.warn(`[${NAME}] a [data-sc-capsule="field"] has no <input> inside it`);
      return rec;
    }

    if (!INTERACTIVE.has(role)) {             // submit / nav / chip: geometry and grading only
      // A shell's textContent is every label it contains concatenated, which is noise in a
      // report. Only the chip has a label of its own.
      if (role === 'chip') rec.labelText = (el.textContent || '').trim();
      return rec;
    }

    rec.label = wrapLabel(el, rec.confirmWord);
    rec.faces = {
      rest: rec.label.querySelector('[data-sc-face="rest"]'),
      done: rec.label.querySelector('[data-sc-face="done"]'),
    };
    // Read AFTER wrapping, so a kept icon's own text (there is rarely any) is not counted.
    rec.labelText = (rec.faces.rest.textContent || '').trim();

    const glyph = el.getAttribute('data-sc-glyph') || (role === 'cta' ? C.ctaGlyph : '');
    if (glyph && glyph !== 'none' && role !== 'ghost') {
      const circle = document.createElement('span');
      circle.setAttribute('data-sc-circle', '');
      circle.setAttribute('data-sc', NAME);
      circle.setAttribute('aria-hidden', 'true');   // §7: decorative; the label carries the name
      circle.appendChild(strokeGlyph(glyph));
      el.appendChild(circle);
      rec.circle = circle;
    }

    if (C.sparkles > 0) {
      const host = document.createElement('span');
      host.setAttribute('data-sc-sparkles', '');
      host.setAttribute('data-sc', NAME);
      host.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < Math.min(C.sparkles, SPARKLE_SEATS.length); i++) {
        const seat = SPARKLE_SEATS[i];
        const { s, p } = makeSvg(SPARKLE_D);
        p.setAttribute('fill', 'currentColor');
        s.style.width = seat.size + 'px';
        s.style.height = seat.size + 'px';
        host.appendChild(s);
        rec.sparkles.push({ node: s, seat });
      }
      el.appendChild(host);
      rec.sparkleHost = host;
    }
    return rec;
  }

  for (const el of nodes) enhance(el);

  /* ── the scarcity assert (clip 6) ─────────────────────────────────────── */
  const ctas = records.filter((r) => r.role === 'cta');
  const scarcity = { role: 'cta', count: ctas.length, max: C.cta.max, ok: ctas.length <= C.cta.max };
  if (!scarcity.ok) {
    for (const r of ctas.slice(C.cta.max)) r.el.setAttribute('data-sc-cta-excess', 'true');
    if (C.cta.warn) {
      const names = ctas.map((r) => `"${r.labelText || r.el.id || r.el.tagName.toLowerCase()}"`).join(', ');
      console.error(
        `[${NAME}] scarcity assert failed: ${ctas.length} [data-sc-capsule="cta"] under this root, max ${C.cta.max}. `
        + `Found ${names}. Clip 6 is sixteen seconds of page carrying exactly ONE call to action; a second primary `
        + `CTA does not add a second choice, it removes the first one. Demote one to "ghost" or "navitem", or raise `
        + `cta.max deliberately. The offenders carry data-sc-cta-excess.`);
    }
  }

  /* ── geometry, derived from the measured cap ──────────────────────────── */

  function applyGeometry(rec) {
    const { el, role } = rec;
    // The font that actually renders the label. For a field that is the INPUT's font, because
    // the placeholder is what sets the field's optical height — not the shell's inherited font.
    const target = role === 'field' ? (rec.input || el) : el;
    const host = rec.shell || el;
    const cs = getComputedStyle(target);
    const cap = measureCap(cs);
    rec.cap = cap;

    const set = (k, v) => host.style.setProperty(k, v);
    set('--sc-cap', cap.toFixed(2) + 'px');

    if (role === 'chip') {
      rec.height = cap * C.chipRatio;
      set('--sc-cap-h', rec.height.toFixed(2) + 'px');
      return;
    }
    // A shell and a submit disc take their size from what the engine gives their NEIGHBOURS, so
    // their own box is not readable yet — records run in document order and the nav shell is
    // reached before the items inside it. Measured in a second pass at the end of measureAll().
    if (role === 'nav' || role === 'submit') return;

    const wanted = cap * C.fieldRatio;
    rec.height = Math.max(wanted, C.minTap);
    rec.tapFloored = rec.height > wanted + 0.01;
    set('--sc-cap-h', rec.height.toFixed(2) + 'px');
    set('--sc-cap-pad-lead', (cap * C.padLead).toFixed(2) + 'px');
    // With a circle the trailing inset IS the ring — that is the whole "butted into the right
    // end" construction. Without one it is symmetric with the leading inset.
    set('--sc-cap-pad-trail', (rec.circle ? C.ring : cap * C.padTrail).toFixed(2) + 'px');
    // The circle sits inside the ring on all four sides; the ring is the ONE number.
    set('--sc-cap-circle', Math.max(0, rec.height - 2 * C.ring).toFixed(2) + 'px');
    // Gap between label and circle: the same leading inset, so the label is optically centred
    // between the two ends rather than crammed against the disc.
    set('--sc-cap-circle-gap', (cap * C.padLead).toFixed(2) + 'px');
    /* Pad and blur are a RATIO to each other, not two free numbers — the same relation fixed-hud
     * arrived at. blur(N) is a Gaussian of σ = N, so the plate's own edge smears about ±2σ; a
     * pad just under 2σ is what keeps the label sitting on the plate's core instead of on its
     * falloff. 2.2 : 1.1 holds that while spreading the shape wide enough to read as a halo. */
    set('--sc-cap-plate-pad', (cap * 2.2).toFixed(2) + 'px');
    set('--sc-cap-plate-blur', (cap * 1.1).toFixed(2) + 'px');

    if (role === 'ghost') {
      /* Clip 6: side padding derived from the label's OWN rendered width, measured on the canvas
       * rig at the element's resolved font, text-transform and tracking included. */
      const w = measureWidth(cs, rec.labelText || el.textContent || '');
      rec.labelWidth = w;
      rec.ghostPad = clamp(w * C.ghostPad.ratio, cap * C.ghostPad.minCap, cap * C.ghostPad.maxCap);
      set('--sc-cap-ghost-pad', rec.ghostPad.toFixed(2) + 'px');
    }

    if (rec.label && !rec.confirming) {
      /* Freeze the label box at its natural width so the confirm has something to animate FROM.
       * The transition is suppressed across the write: a resize that changes the type scale
       * would otherwise play a 320ms width animation nobody asked for, which is autonomous
       * motion arriving through the back door. */
      rec.label.style.transition = 'none';
      rec.label.style.setProperty('--sc-cap-label-w', 'auto');
      const natural = rec.faces.rest.getBoundingClientRect().width;
      rec.naturalW = natural;
      rec.label.style.setProperty('--sc-cap-label-w', natural.toFixed(2) + 'px');
      void rec.label.offsetWidth;               // flush, so the restore below cannot animate
      rec.label.style.transition = '';
    }
    rec.box = { w: el.offsetWidth, h: el.offsetHeight };
  }

  /* ── live contrast, and the backdrop decision ─────────────────────────── */

  function grade(rec) {
    const { el, role } = rec;
    const target = role === 'field' ? (rec.input || el) : el;
    const host = rec.shell || el;
    const cs = getComputedStyle(target);
    const fg = parseColour(cs.color);
    // A filled capsule and a chip are their OWN ground: the label sits on the fill, not on the
    // page. Only a transparent-filled control has to answer for what is underneath it.
    const own = parseColour(getComputedStyle(host).backgroundColor);
    const under = resolveGround(el);
    // A partly-transparent own fill is still part of what is behind the label — a navitem's
    // 12%-cream wash lifts its ground measurably. Composite it rather than discarding it.
    const ground = own && own[3] >= 0.999 ? own
      : own && own[3] > 0 && under ? over(own, under)
        : under;
    const fontSize = parseFloat(cs.fontSize) || 16;
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
    const need = large ? C.contrast.largeText : C.contrast.text;
    const r = fg && ground ? ratio(fg, ground) : null;

    rec.grade = {
      ink: fg ? hex(fg) : null,
      ground: ground ? hex(ground) : null,
      ratio: r === null ? null : Math.round(r * 100) / 100,
      need,
      ok: r === null ? null : r >= need,
    };

    if (role === 'field' && rec.input) {
      /* contrast-check.mjs walks TEXT NODES, and a placeholder is an attribute — no pixel-based
       * checker will ever see it. This is the only instrument that grades it, which is exactly
       * why the field publishes it rather than leaving it to be discovered. */
      const hint = parseColour(getComputedStyle(rec.input, '::placeholder').color);
      const fill = parseColour(getComputedStyle(host).backgroundColor);
      rec.grade.placeholder = hint && fill && hint[3] > 0
        ? Math.round(ratio(over(hint, fill), fill) * 100) / 100 : null;
    }

    /* The plate. Engaged for a transparent-filled control whose label falls short, or whose
     * ground could not be resolved at all — an unknown ground over a canvas or a photograph is
     * one you must assume the worst about, not one you may ignore. */
    if (role === 'ghost' || role === 'chip') {
      const want = C.backdrop === 'always' ? true
        : C.backdrop === 'never' ? false
          : rec.grade.ratio === null ? true : rec.grade.ratio < need;
      if (want) el.setAttribute('data-sc-backdrop', '');
      else el.removeAttribute('data-sc-backdrop');
      rec.grade.backdrop = want;
    }

    if (role === 'ghost') {
      /* The stroke is non-text and WCAG 1.4.11 asks 3:1 of it, which contrast-check cannot
       * grade because it grades text. Measured LAST, and against what the plate actually put
       * behind it when the plate is engaged — measuring a hairline against a ground that is no
       * longer there is the same class of error as measuring a text-shadow. */
      const strokeC = parseColour(getComputedStyle(el, '::after').borderTopColor);
      const raw = resolveGround(el);
      const plate = parseColour(getComputedStyle(el).getPropertyValue('--sc-cap-plate'));
      const behind = rec.grade.backdrop && plate && raw ? over(plate, raw) : raw;
      const sr = strokeC && behind ? ratio(over(strokeC, behind), behind) : null;
      rec.grade.stroke = sr === null ? null : Math.round(sr * 100) / 100;
      rec.grade.strokeNeed = C.contrast.stroke;
      rec.grade.strokeGround = behind ? hex(behind) : null;
    }
  }

  function measureAll() {
    if (destroyed) return;
    for (const rec of records) applyGeometry(rec);
    // Second pass: a shell's height is whatever its now-sized children made it.
    for (const rec of records) if (rec.role === 'nav' || rec.role === 'submit') rec.height = rec.el.offsetHeight;
    // Grade AFTER geometry: the plate decision reads colours that geometry can change.
    for (const rec of records) grade(rec);
  }

  /* ── the in-place confirm (clip 4 @13.5s) ─────────────────────────────── */

  function confirmMs() {
    // A response to a click continues under the preference (§4) — but it SNAPS rather than eases
    // when it cannot land inside rmSnapMs. "Fast easing" is still easing.
    return rmq.matches && C.morphMs > C.rmSnapMs ? 0 : C.morphMs;
  }

  function fireConfirm(rec) {
    if (!rec.label || !rec.confirmWord || rec.confirming) return;
    rec.confirming = true;
    rec.el.style.setProperty('--sc-cap-morph', confirmMs() + 'ms');
    // The pill contracts TO FIT: the target is the check's own measured box, not a guess.
    const doneW = rec.faces.done.getBoundingClientRect().width || rec.cap * 1.2;
    rec.label.style.setProperty('--sc-cap-label-w', doneW.toFixed(2) + 'px');
    rec.el.setAttribute('data-sc-confirming', '');
    status.textContent = rec.confirmWord;
    if (typeof C.onConfirm === 'function') C.onConfirm(rec.el, rec.confirmWord);
    if (C.confirmHoldMs > 0) {
      clearTimeout(rec.confirmTimer);
      rec.confirmTimer = setTimeout(() => {
        if (destroyed) return;
        rec.el.style.setProperty('--sc-cap-morph', confirmMs() + 'ms');
        rec.el.removeAttribute('data-sc-confirming');
        rec.label.style.setProperty('--sc-cap-label-w', (rec.naturalW || 0).toFixed(2) + 'px');
        rec.confirming = false;
        status.textContent = '';
      }, C.confirmHoldMs);
    }
  }

  /* ── sparkles: the ONE rAF loop ───────────────────────────────────────── */

  function paintSparkles(now) {
    const t = now / 1000;
    for (const rec of records) {
      if (!rec.sparkles.length) continue;
      if (rec.env <= 0.001) {
        if (rec.painted) {
          for (const sp of rec.sparkles) sp.node.style.opacity = '0';
          rec.painted = false;
        }
        continue;
      }
      rec.painted = true;
      const { w, h } = rec.box;
      for (const { seat, node } of rec.sparkles) {
        // Each star has its own period AND its own phase offset, so the peaks never coincide.
        const phase = (t / seat.dur + seat.off) % 1;
        const k = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
        node.style.opacity = (k * rec.env).toFixed(3);
        node.style.left = (seat.x * w - seat.size / 2).toFixed(1) + 'px';
        node.style.top = (seat.y * h - seat.size / 2).toFixed(1) + 'px';
        node.style.transform = `scale(${(0.55 + 0.45 * k).toFixed(3)})`;
      }
    }
  }

  let lastNow = 0;
  function frame(now) {
    if (destroyed) return;
    /* §4, read HERE and every frame: a visitor who turns the preference on mid-hover has the
     * sparkles gone on the next frame, with the hovered colours left exactly as they are. */
    const reduced = rmq.matches;
    const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 0;
    lastNow = now;

    let live = false;
    for (const rec of records) {
      if (!rec.sparkles.length) continue;
      if (reduced) rec.env = 0;
      else {
        const target = rec.hot ? 1 : 0;
        if (rec.env !== target) {
          const span = (rec.hot ? C.hoverMs : C.exitMs) / 1000;
          const step = span > 0 ? dt / span : 1;
          rec.env = target > rec.env ? Math.min(target, rec.env + step) : Math.max(target, rec.env - step);
        }
      }
      /* `hot` keeps the loop alive as well as `env`, and that is not belt-and-braces. On the very
       * first frame lastNow is 0, so dt is 0, so env is still 0 — and a liveness test that read
       * env alone closed the loop before the ramp had a single frame to run. The sparkles never
       * appeared once, and no gate could see it: verify.mjs screenshots a hover it never
       * triggered. Caught by taking a hover screenshot and looking at it. */
      if (!reduced && (rec.env > 0.001 || rec.hot)) live = true;
    }
    paintSparkles(now);

    if (!live) { raf = 0; lastNow = 0; return; }   // the loop closes itself
    raf = requestAnimationFrame(frame);
  }

  function ensureLoop() {
    if (raf || destroyed || rmq.matches) return;
    lastNow = 0;
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastNow = 0;
  }

  /* ── listeners ────────────────────────────────────────────────────────── */

  const recFor = (node) => {
    const el = node instanceof Element ? node.closest('[data-sc-capsule]') : null;
    return el ? records.find((r) => r.el === el) : null;
  };

  // pointerover/out rather than enter/leave: they bubble, so one delegated pair covers every
  // control under the root. `relatedTarget` inside the same control is a move BETWEEN the label
  // and the circle, not an exit.
  const onOver = (e) => {
    const rec = recFor(e.target);
    if (!rec || !rec.sparkles.length || rec.hot) return;
    rec.box = { w: rec.el.offsetWidth, h: rec.el.offsetHeight };
    rec.hot = true;
    ensureLoop();
  };
  const onOut = (e) => {
    const rec = recFor(e.target);
    if (!rec || !rec.hot) return;
    if (e.relatedTarget instanceof Node && rec.el.contains(e.relatedTarget)) return;
    rec.hot = false;
    ensureLoop();
  };
  const onClick = (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-sc-confirm]') : null;
    const rec = el ? records.find((r) => r.el === el) : null;
    if (rec) fireConfirm(rec);
  };
  root.addEventListener('pointerover', onOver);
  root.addEventListener('pointerout', onOut);
  root.addEventListener('focusin', onOver);
  root.addEventListener('focusout', onOut);
  root.addEventListener('click', onClick);

  const onPrefChange = () => {
    if (destroyed) return;
    if (rmq.matches) {
      stopLoop();
      for (const r of records) r.env = 0;
      paintSparkles(performance.now());
    } else if (records.some((r) => r.hot)) ensureLoop();
  };
  if (rmq.addEventListener) rmq.addEventListener('change', onPrefChange);
  else if (rmq.addListener) rmq.addListener(onPrefChange);

  /* A webfont landing changes the cap at the same font-size, and a clamp() type scale changes it
   * on every resize. Both re-run the SAME measurement; there is no second code path to drift.
   * Guarded against the observer's own writes by being idempotent: an unchanged font-size yields
   * an unchanged cap yields an unchanged height, so the observer converges in one pass. */
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { if (!destroyed) measureAll(); });
    ro.observe(root);
  }
  const onResize = () => { if (!destroyed) measureAll(); };
  if (!ro) window.addEventListener('resize', onResize, { passive: true });

  /* The primitive rule declares `color` AND `transition: color` together, so mounting the sheet
   * starts a 108ms colour transition out of whatever the UA had — for a ghost <a> that is link
   * blue. grade() reads getComputedStyle().color, so the first report would carry a frame of that
   * interpolation instead of the settled ink, and backdrop:'auto' decides from it. Suppress the
   * transition across the first measure and flush it: the colour lands instantly, there is
   * nothing in flight to sample, and handing the transition back changes no computed value. */
  for (const rec of records) rec.el.style.transition = 'none';
  void root.offsetWidth;
  measureAll();
  for (const rec of records) rec.el.style.transition = '';

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (!destroyed) measureAll(); }).catch(() => {});
  }

  return {
    supported: true,
    controls: records.map((r) => ({ el: r.el, role: r.role })),
    scarcity,

    /** Force a re-measure. The observers already do this; exposed for a host that swaps a font
     *  or a label imperatively. */
    refresh() { measureAll(); },

    /** Fire the in-place confirm without a click — for a host whose submit is async. */
    confirm(target) {
      const el = typeof target === 'string' ? root.querySelector(target) : target;
      const rec = records.find((r) => r.el === el);
      if (rec) fireConfirm(rec);
    },

    /**
     * Everything this engine measured, per control: the cap it read, the geometry it derived,
     * whether the tap floor overrode the corpus ratio, and the LIVE contrast against the ground
     * the control actually landed on. `radii` is the two-language assert PROVEN rather than
     * claimed — it lists the distinct computed radii in play, and there had better be two.
     */
    report() {
      const rows = records.map((r) => ({
        role: r.role,
        label: r.labelText || (r.input?.placeholder || '').trim() || '',
        cap: Math.round(r.cap * 100) / 100,
        height: Math.round(r.height * 100) / 100,
        tapFloored: r.tapFloored,
        labelWidth: r.labelWidth === undefined ? undefined : Math.round(r.labelWidth * 10) / 10,
        ghostPad: r.ghostPad === undefined ? undefined : Math.round(r.ghostPad * 10) / 10,
        ...r.grade,
      }));
      const radii = [...new Set(records.map((r) => getComputedStyle(r.shell || r.el).borderTopLeftRadius))];
      return { rows, radii, scarcity, reduced: rmq.matches };
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      root.removeEventListener('pointerover', onOver);
      root.removeEventListener('pointerout', onOut);
      root.removeEventListener('focusin', onOver);
      root.removeEventListener('focusout', onOut);
      root.removeEventListener('click', onClick);
      if (rmq.removeEventListener) rmq.removeEventListener('change', onPrefChange);
      else if (rmq.removeListener) rmq.removeListener(onPrefChange);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', onResize);

      for (const rec of records) {
        clearTimeout(rec.confirmTimer);
        if (rec.wrapped && rec.shell && rec.input) {
          // Put the input back where it was and take the generated shell away with us.
          rec.input.setAttribute('data-sc-capsule', 'field');
          const sub = rec.shell.querySelector('[data-sc-capsule="submit"]');
          rec.shell.parentNode?.insertBefore(rec.input, rec.shell);
          if (sub) rec.shell.parentNode?.insertBefore(sub, rec.shell);
          rec.shell.remove();
        }
        if (rec.submitGlyphAdded) rec.submitGlyphAdded.querySelector('svg')?.remove();
        // Only roles this engine actually rewrote get their markup put back; restoring innerHTML
        // on an untouched element would destroy host event listeners for no reason.
        if (rec.label || rec.circle || rec.sparkleHost) rec.el.innerHTML = rec.innerWas;
        for (const a of ['data-sc-confirming', 'data-sc-backdrop', 'data-sc-cta-excess']) rec.el.removeAttribute(a);
        const target = rec.shell && !rec.wrapped ? rec.shell : rec.el;
        if (rec.styleWas === null) target.removeAttribute('style');
        else target.setAttribute('style', rec.styleWas);
      }
      status.remove();
      if (rootStyleWas === null) root.removeAttribute('style');
      else root.setAttribute('style', rootStyleWas);
      unmountStyle();
      records.length = 0;
    },
  };
}

export default initCapsuleControls;
