/**
 * display-type — display type derived from MEASURED glyph metrics.
 * ─────────────────────────────────────────────────────────────────────────
 * Derived from corpus clip 9 @0s and @2.83s, clip 6's craft cluster, and clip 7's brand
 * reveal. Three techniques the corpus records separately are one mechanism, and the thing
 * that unifies them is that every number comes off the GLYPH, never off `font-size`:
 *
 *   clip 9 @0s     VERIFIED  "Tonal display type — headline hue within one step of its
 *                            background." Gold/amber on vermillion. Amber on oxblood. Dark
 *                            brown on saffron. Never white, never black, never a complementary
 *                            accent. "Value contrast … often below WCAG for body text, and they
 *                            know it, which is why it is only ever used at display size.
 *                            Legibility comes from three things instead of value: enormous
 *                            scale, a chunky extrusion/bevel (letters have a lighter top face
 *                            and a darker lower-right side face, roughly 4-6% of CAP HEIGHT
 *                            deep), and tight tracking that makes the word read as one solid
 *                            mass."                                      →  tonal() + bevel()
 *   clip 9 @2.83s  VERIFIED  "Display type flush to the viewport edge, bleeding off … start at
 *                            x=0 with ZERO left padding, and the first letter is partially cut
 *                            by the viewport edge … Body copy and images respect margins;
 *                            headlines do not. That asymmetry — one element class allowed to
 *                            break the grid — is the whole reason the layout reads as
 *                            art-directed."                              →  bleed()
 *   clip 6 craft   VERIFIED  "Wordmark as a 3x3 letter block: Z O I / I C E / T E A, monospaced
 *                            onto a strict grid with wide tracking, cap height around 10-12px.
 *                            It occupies a square, so it holds a corner without needing a
 *                            container or a lockup rule."                →  lockup()
 *   clip 6 craft   VERIFIED  "Headline case is chosen per section rather than globally … Five
 *                            registers, deliberate, each matched to how loud the moment is."
 *                            and "Display weight is Thin/ExtraLight at very large sizes with
 *                            leading tighter than the cap height (~0.85-0.9em)" and "a ~5.5:1
 *                            size ratio between headline and body. There is no mid-tier size
 *                            doing negotiation between them; the jump is the hierarchy."
 *                                                                        →  audit(), and the
 *                            demo's five registers. The engine refuses to impose a case.
 *   clip 7 craft   VERIFIED  "The 'YOS' wordmark is set in a light weight, not bold, in charcoal
 *                            rather than black … Restraint at the one moment where a brand
 *                            reveal invites shouting."                   →  the Thin register,
 *                            and thinCheck() below, which measures whether you actually got it.
 *   clip 5 @9.25s  VERIFIED  "letters rising into an overflow-hidden line mask … It is the only
 *                            text-entrance animation in the whole clip." and clip 9 @3.33s
 *                            "per-line rise … overflow-hidden per-line mask with the line
 *                            sliding up from below" (INFERRED mechanism)  →  splitLines()
 *
 * WHY THIS NEEDS CODE. CSS `letter-spacing` appends a space AFTER the final glyph, so a tracked
 * line is never actually centred or flush to its measure. This repo hand-patches that exactly
 * once — effects/entry-gate/engine.js:483 pairs `letter-spacing:.44em` with `text-indent:.44em`.
 * MEASURED here (effects/display-type/_probe.html, Chrome 1440x900), that patch is the wrong
 * generalisation twice over: `text-indent` corrects the FIRST LINE ONLY, and on a centred line
 * it corrects by a quarter of the tracking rather than a half, because the indent also widens
 * the line box that centring then re-divides. Four-line specimen, tracking 14px, ink centres
 * relative to the measure centre:
 *
 *     no compensation        -7.0  -7.0  -7.0  -7.0   px
 *     text-indent: 7px       -3.5  -7.0  -7.0  -7.0
 *     margin-inline-end:-14  +0.0  +0.0  +0.0  +0.0   ← every line, exactly
 *
 * So the compensation here is a negative `margin-inline-end` of one whole letter-space. It also
 * makes `text-align:right` land ink-flush (measured: ink right edge 890.0 → 900.0 against a
 * 900px measure) and leaves `text-align:left` untouched, which is correct — a left-flush line
 * never had the problem.
 *
 * CONTRACT §3. This effect has no scroll-varying state, so it exposes NO `setProgress`. A no-op
 * `setProgress` would advertise a scroll response that does not exist. What §3 is actually
 * protecting is untouched: nothing here listens for `scroll`, ever.
 *
 * CONTRACT §4. There is no autonomous motion to stop and no response-to-input motion to keep:
 * this is static type. `prefers-reduced-motion` therefore has exactly one thing to govern —
 * the optional splitLines() reveal, which is autonomous once triggered. Under the preference it
 * paints the RESOLVED state on frame one; it is not a faster animation. The query is re-read at
 * every solve and subscribed to `change`. There is no per-frame re-check because there is no
 * frame: this engine opens no rAF loop, only a single coalescing rAF callback that runs once and
 * is cancelled in destroy().
 *
 * CONTRACT §5. Nothing is allocated per device pixel — no canvas backing store is ever sized to
 * the viewport, no framebuffer, no texture. The one canvas is a detached 8x8 measuring device.
 * There is nothing to clamp. Stated rather than silently skipped.
 *
 * CONTRACT §7, and a DELIBERATE DEPARTURE. Injected custom properties are `--sc-`-prefixed and
 * the injected <style> carries data-sc="display-type". The per-line wrappers splitLines() builds
 * also carry data-sc="display-type" but they do NOT carry aria-hidden, and they must not: they
 * hold the page's own headline. §7's aria-hidden clause is written for decorative injected
 * nodes. Hiding a headline from a screen reader to satisfy it would be the letter of the rule
 * against its purpose.
 *
 * THE FONT (CONTRACT §8). Ships one asset: inter-latin-var.woff2, 48KB, Inter v20 latin subset,
 * variable weight 100–900, SIL OFL 1.1. It is here because the Thin/ExtraLight display register
 * silently degrades on a system stack — macOS resolves weight 100 to Helvetica Neue UltraLight,
 * Windows has no such face and hands back the regular. MEASURED on this Mac by rasterising
 * 'HAMBRG' at 140px and counting covered pixels: Inter 100/400/900 → 0.060 / 0.187 / 0.329 ink
 * fraction (a real Thin, 0.32x the regular); the system stack → 0.096 / 0.178 / 0.302 (0.54x —
 * a Thin exists HERE and would not on Windows). thinCheck() below runs that same probe at init
 * and warns by name when the register you asked for is not the one you got.
 *
 *   import { initDisplayType } from './engine.js'
 *   const type = initDisplayType(document.body)      // publishes --sc-cap, --sc-x per element
 *   type.solveTracking(h2, { toWidth: 0.86 })        // fraction of parent; trailing space paid
 *   type.bevel(h1, { depth: 0.05 })                  // 4-6% of MEASURED cap height
 *   type.tonal(h1)                                   // steps face + side from the section bg
 *   type.lockup(mark, { square: true })              // 3x3 wordmark, rows on identical widths
 *   type.audit()                                     // case registers + the headline:body jump
 *   type.destroy()
 *
 *   <h1 data-sc-display="bleed">   → negative inline-start inset + overflow-x:clip on the section
 */

const RM_QUERY = '(prefers-reduced-motion: reduce)';
const NS = 'display-type';

/**
 * The attribute that DECLARES an element a member of the display class. It is read here and it
 * is read again, independently, by tools/contrast-check.mjs, which is the whole point: the
 * element that opts out of the pixel contrast rule has to be the same element this engine is
 * paying for the exemption on. Changing `selector` changes what this engine manages; it does
 * not change what the gate will exempt.
 */
const ROLE_ATTR = 'data-sc-display';

/** Probe size for glyph metrics. Large enough that fractional bbox values stay meaningful. */
const PROBE_PX = 200;

/**
 * Per-channel byte difference at which `tools/contrast-check.mjs` counts a pixel as painted
 * (its `INK`, contrast-check.mjs:358). `tonal()` uses the same number so the engine's own
 * arithmetic and the tool's pixels agree about whether an extrusion exists at all — the band
 * just above it is thin, and the nearest ground measured passing is #101010 at 16/255.
 */
const INK_BYTES = 14;

const DEFAULTS = {
  /**
   * Which elements this instance manages. Every one of them gets --sc-cap / --sc-x published and
   * gets re-solved on resize and on font load. It is also the attribute the contrast gate reads
   * as the DECLARED display class — see tools/contrast-check.mjs. Keep them the same attribute
   * on purpose: an element that opts out of the pixel contrast rule must be the same element the
   * engine is paying for that exemption on.
   */
  selector: '[data-sc-display]',

  /**
   * Apply tonal() + bevel() to managed elements automatically. Turn it off and drive every
   * element by hand. `data-sc-display="plain"` opts a single element out without touching this.
   */
  auto: true,

  /**
   * What audit() takes a case-register census over. Headings plus the display class, because the
   * corpus claim is about how many CASE DECISIONS a page makes, and a decision lives on a
   * heading, not on every element an engine touches.
   */
  registerSelector: 'h1, h2, h3, h4, h5, h6, [data-sc-display]',

  /**
   * ONE STEP, in OKLab lightness, from the ground to the glyph face. This is the whole technique
   * and it is deliberately NOT expressed as a WCAG ratio, because a fixed ratio is a different
   * perceptual distance on every ground: 2:1 off a near-black oxblood is a colossal tonal jump
   * and 2:1 off a mid vermillion is a whisper.
   *
   * The corpus's three pairs, converted to OKLab here and reported as ΔL:
   *      vermillion #d6491c → gold      #e8a21c    ΔL +0.164   (WCAG 1.99:1)
   *      oxblood    #4a1010 → amber     #e8a21c    ΔL +0.486   (WCAG 7.00:1)
   *      saffron    #e8a81c → dk brown  #4a2a12    ΔL -0.452   (WCAG 6.16:1)
   * Those are not one number, because the reference is picking from a fixed two-colour brand
   * palette rather than generating a step. The first pair is the one the corpus singles out as
   * "below WCAG for body text, and they know it", so the default sits near that end. The WCAG
   * ratio is REPORTED as a consequence, never targeted.
   */
  step: 0.22,
  /** OKLab L above which a ground counts as light and the face steps DARKER. Corpus grounds sit
   *  at L 0.276 (oxblood), 0.597 (vermillion) and 0.772 (saffron); the first two take a lighter
   *  face and the third a darker one, so the pivot is somewhere in 0.60–0.77. Chosen, not derived. */
  lightPivot: 0.66,
  /** Floor on the face-vs-ground WCAG ratio. Below this the type is not one step away, it is gone.
   *  If the ΔL step cannot clear it (a near-white ground, a gamut wall) the step is widened. */
  minFaceRatio: 1.4,

  /** Further OKLab step, DOWN from the face, to the lower-right side plane of the extrusion. */
  sideStep: 0.24,
  /** The side must also be at least this much darker than the GROUND, or the extrusion is
   *  invisible against everything except the face it is attached to. */
  sideVsGround: 0.10,
  /** Floor on face-vs-side WCAG ratio — the contrast that carries the letterform when the fill
   *  does not, and the number tools/contrast-check.mjs measures back off real pixels. Its gate
   *  fails below 2.0; this leaves headroom rather than shipping to the edge of it. */
  minEdgeRatio: 2.4,

  /**
   * Degrees of hue rotation per step, in OKLCH. Corpus-measured rotations are +40°, +51° and
   * -25°, sign always following the lightness direction.
   */
  hueStep: 28,
  /** OKLCH hue the ramp bends toward when a step goes lighter (yellow) / darker (violet-blue). */
  hueWarm: 100,
  hueCool: 290,
  /** Chroma multiplier per step. 1.0 holds the ground's own saturation. */
  chromaStep: 1.0,

  /**
   * Extrusion depth as a fraction of MEASURED cap height. Corpus: "roughly 4-6% of cap height".
   * Scaling this off font-size instead is the first way to fake the whole effect — cap height
   * measured across 14 faces on this Mac spans 0.571 (Courier New) to 0.791 (Impact), a 38%
   * spread, and 0.708–0.791 across display-plausible sans faces alone.
   */
  bevelDepth: 0.05,
  /** Extrusion direction in degrees clockwise from +x. 45 puts the side face at lower-right. */
  bevelAngle: 45,
  /**
   * Fraction of the extrusion length painted in a third, darker tone at the far end. 0 keeps the
   * extrusion one flat colour. See SKILL.md for what this looked like when opened.
   */
  bevelEdge: 0,

  /** Fraction of the first glyph's INK that a `bleed` headline hides past the viewport edge. */
  bleedAmount: 0.10,
  /** Ancestor that gets overflow-x:clip so a bleed does not become page-level overflow. */
  clipSelector: 'section',

  /** Solver clamps, in em. A tracked lockup wants a lot; nothing wants glyphs overlapping. */
  minTracking: -0.09,
  maxTracking: 1.6,

  /** Fallback cap/x ratios if TextMetrics is unavailable. Loudly warned about, never silent. */
  fallbackCapRatio: 0.72,
  fallbackXRatio: 0.52,
};

/* ── colour ────────────────────────────────────────────────────────────────────────────────
 * sRGB ↔ OKLab (Ottosson). The steps have to happen in a perceptual space or "one step" means
 * something different on every hue: the same ΔL in sRGB is a large move on yellow and a small
 * one on blue, and the corpus pairs span both. WCAG relative luminance is a separate function
 * for a separate job — the ratio has to match the spec or the thresholds mean nothing.
 * ─────────────────────────────────────────────────────────────────────────────────────────── */

const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const toByte = (v) => {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(s * 255)));
};

const luminance = (r, g, b) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
const ratioOf = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

function rgbToOklab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

/** @returns {{rgb:number[], clipped:boolean}} — clipped is true when the colour left sRGB. */
function oklabToRgb(L, a, b) {
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
  ];
  const clipped = lin.some((v) => v < -0.0015 || v > 1.0015);
  return { rgb: lin.map(toByte), clipped };
}

/**
 * OKLCH → in-gamut sRGB. Out-of-gamut chroma is walked down rather than hard-clipped, because
 * clipping a linear channel rotates the hue: a step that leaves the gamut comes back as a
 * different colour from the one that was solved for, and the "within one step" relationship is
 * exactly what that breaks.
 */
function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  let c = C;
  for (let i = 0; i < 16; i++) {
    const out = oklabToRgb(L, c * Math.cos(h), c * Math.sin(h));
    if (!out.clipped || c < 1e-4) return out.rgb;
    c *= 0.88;
  }
  return oklabToRgb(L, 0, 0).rgb;
}

/** Shortest signed rotation from a to b, in degrees, in (-180, 180]. */
const arc = (a, b) => ((b - a) % 360 + 540) % 360 - 180;

/**
 * A tone at an absolute OKLab lightness, carried off `lab`'s own chroma and hue.
 *
 * `dir` picks which way the hue bends: toward the warm anchor on the way up, toward the cool
 * anchor on the way down. That is the ordinary painter's move and it is what the corpus pairs
 * actually do — MEASURED off the three reference pairs, hue travels +40°, +51° and -25°, with the
 * sign matching the lightness direction every time. Hold the hue fixed instead and the pair reads
 * as two colours; rotate it and it reads as one material under a light.
 */
function tone(lab, newL, dir, cfg) {
  const C = Math.hypot(lab.a, lab.b) * cfg.chromaStep;
  const h0 = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  const anchor = dir > 0 ? cfg.hueWarm : cfg.hueCool;
  const h = h0 + Math.sign(arc(h0, anchor) || 1) * cfg.hueStep;
  const L = Math.max(0.015, Math.min(0.995, newL));
  const rgb = oklchToRgb(L, C, h);
  return { rgb, L, C, h, lum: luminance(rgb[0], rgb[1], rgb[2]) };
}

const css = (rgb) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

/* ── inert handle (CONTRACT §6) ─────────────────────────────────────────────────────────── */

const inert = () => ({
  supported: false,
  metrics: null,
  elements: [],
  solveTracking: () => null,
  bevel: () => null,
  tonal: () => null,
  lockup: () => null,
  splitLines: () => null,
  bleed: () => null,
  audit: () => ({ registers: {}, sizes: [], ratio: 0, midTier: null }),
  resolve() {},
  destroy() {},
});

export function initDisplayType(root, config = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return inert();
  const host = root || null;
  if (!host || !host.querySelectorAll) {
    console.warn('[display-type] no root element — nothing to measure');
    return inert();
  }

  const C = Object.assign({}, DEFAULTS, config);
  const rmq = window.matchMedia(RM_QUERY);

  /* One detached canvas, never appended, 8x8 until the ink probe needs more. It is a measuring
   * device, not a render target — see the §5 note in the header. */
  const probe = document.createElement('canvas');
  // 8x8 rather than the 300x150 default: nothing is ever rendered into it except the Thin-register
  // ink probe, which sizes it up for one frame and puts it back. See the §5 note in the header.
  probe.width = 8; probe.height = 8;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) console.warn('[display-type] no 2D context — falling back to estimated cap ratios');

  let destroyed = false;
  let pending = 0;

  /* Every inline property this engine writes, with the value that was there before it. §1 says
   * the page must be indistinguishable after destroy(), and "" is a different inline value from
   * "static" or "0px" — restoring a guess is not restoring. */
  const touched = new Map();
  /* Elements that had NO style attribute at all before this engine wrote to them. Restoring every
   * property it set leaves `style=""` behind, which is a residue, not a restoration — and it is
   * the kind that survives a diff of the rendered page and shows up in someone's snapshot test a
   * month later. */
  const hadNoStyleAttr = new Set();
  function setStyle(el, prop, value) {
    let saved = touched.get(el);
    if (!saved) {
      saved = new Map();
      touched.set(el, saved);
      if (!el.hasAttribute('style')) hadNoStyleAttr.add(el);
    }
    if (!saved.has(prop)) {
      saved.set(prop, prop.startsWith('--') ? el.style.getPropertyValue(prop) : el.style[prop]);
    }
    if (prop.startsWith('--')) el.style.setProperty(prop, value);
    else el.style[prop] = value;
  }
  function restoreAll() {
    for (const [el, saved] of touched) {
      for (const [prop, was] of saved) {
        if (prop.startsWith('--')) { if (was) el.style.setProperty(prop, was); else el.style.removeProperty(prop); }
        else el.style[prop] = was;
      }
      /* The getAttribute() is load-bearing, not a check. A CSSOM write leaves Blink's `style`
       * attribute unsynchronised: removeAttribute() then drops a stale attribute and the pending
       * serialisation re-materialises it as style="" on whatever reads the attribute next. The
       * read flushes the write first, and only then does the removal stick. */
      if (hadNoStyleAttr.has(el) && !el.style.length && el.getAttribute('style') !== null) {
        el.removeAttribute('style');
      }
    }
    touched.clear();
    hadNoStyleAttr.clear();
  }

  /* ── glyph metrics ─────────────────────────────────────────────────────────────────────
   * Cap height comes off the RASTERISED glyph via TextMetrics.actualBoundingBoxAscent, because
   * nothing in the DOM will tell you where the top of an H is — a Range gives you the line box,
   * which is line-height, not the letter.
   *
   * TRAP, and it cost a probe run to find: a canvas measurement does NOT trigger a webfont fetch.
   * A page whose @font-face is only referenced from CSS will hand canvas the FALLBACK face and
   * the number looks entirely plausible — the first run of _probe2.html reported Inter's cap
   * ratio as 0.6616, which is Times New Roman's 0.6621, because no element was using Inter yet.
   * So: document.fonts.load() the exact spec before measuring, and re-solve on fonts.ready.
   *
   * Canvas ignores font-variation-settings and font-stretch. A face driven by a raw variation
   * axis rather than by font-weight will be measured at its default instance — cap height is
   * usually axis-invariant (Inter: 0.7275 at weights 100, 400 and 900 alike) but advance widths
   * are not, so solveTracking measures those in the DOM instead and never from this canvas.
   * ────────────────────────────────────────────────────────────────────────────────────── */

  const metricCache = new Map();

  /**
   * A canvas font shorthand built from computed style. Takes primitives, not the
   * CSSStyleDeclaration: `{...getComputedStyle(el)}` copies the object's own indexed properties
   * and NONE of the named ones, so an object spread of a computed style is a bag of numbers with
   * `fontFamily` undefined — which produces the shorthand "undefined undefined 140px undefined",
   * which canvas rejects, which silently leaves the previous font in place.
   */
  function fontSpec({ style, variant, weight, family }, sizePx) {
    const v = variant && variant !== 'normal' ? variant + ' ' : '';
    return `${style || 'normal'} ${v}${weight || 400} ${sizePx}px ${family}`;
  }

  const specOf = (cs, sizePx) => fontSpec({
    style: cs.fontStyle, variant: cs.fontVariantCaps, weight: cs.fontWeight, family: cs.fontFamily,
  }, sizePx);

  function metricsFor(cs) {
    const spec = specOf(cs, PROBE_PX);
    const hit = metricCache.get(spec);
    if (hit) return hit;

    let capRatio = C.fallbackCapRatio;
    let xRatio = C.fallbackXRatio;
    let descRatio = 0.21;
    let source = 'fallback';

    if (ctx) {
      const sentinel = '10px sans-serif';
      ctx.font = sentinel;
      ctx.font = spec;
      if (ctx.font === sentinel && spec !== sentinel) {
        console.warn('[display-type] canvas rejected the font shorthand, using estimates:', spec);
      } else {
        const H = ctx.measureText('H');
        const x = ctx.measureText('x');
        const p = ctx.measureText('p');
        if (typeof H.actualBoundingBoxAscent === 'number' && H.actualBoundingBoxAscent > 0) {
          capRatio = H.actualBoundingBoxAscent / PROBE_PX;
          xRatio = x.actualBoundingBoxAscent / PROBE_PX;
          descRatio = Math.max(0, p.actualBoundingBoxDescent) / PROBE_PX;
          source = 'measured';
        } else {
          console.warn('[display-type] TextMetrics.actualBoundingBoxAscent unavailable, using estimates');
        }
      }
    }

    const m = { spec, capRatio, xRatio, descRatio, source, family: cs.fontFamily, weight: cs.fontWeight };
    metricCache.set(spec, m);
    return m;
  }

  /**
   * Does the Thin/ExtraLight register you asked for actually exist in this family? Rasterise
   * 'HAMBRG' at the requested weight and at 400 and compare covered-pixel fraction. A family
   * with no distinct light face returns the same glyphs for both and the ratio comes back at 1.
   * This is the only honest answer to fake-tell (8) — a comment in a header cannot detect a
   * silent substitution on someone else's machine.
   */
  function thinCheck(cs) {
    if (!ctx) return null;
    const weight = parseInt(cs.fontWeight, 10) || 400;
    if (weight >= 350) return null;
    const family = cs.fontFamily;
    probe.width = 460; probe.height = 200;
    const density = (w) => {
      ctx.clearRect(0, 0, 460, 200);
      ctx.fillStyle = '#000';
      ctx.font = fontSpec({ style: 'normal', weight: w, family }, 140);
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('HAMBRG', 4, 168);
      const d = ctx.getImageData(0, 0, 460, 200).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++;
      return n / (460 * 200);
    };
    const thin = density(weight);
    const reg = density(400);
    probe.width = 8; probe.height = 8;
    const rel = reg > 0 ? thin / reg : 1;
    const distinct = rel < 0.75;
    if (!distinct) {
      console.warn(
        `[display-type] weight ${weight} is not a distinct register in ${family} `
        + `(ink ${thin.toFixed(3)} vs ${reg.toFixed(3)} at 400, ${rel.toFixed(2)}x) — `
        + 'this page is showing an ordinary light headline, not a Thin one');
    }
    return { weight, family, thin, regular: reg, rel, distinct };
  }

  /* ── per-element records ───────────────────────────────────────────────────────────────── */

  const managed = new Map();

  /**
   * `declared` means the element carries the role attribute — only those get the automatic
   * tonal+bevel pass. A lockup ROW is managed (it needs re-solving) but not declared, so it never
   * grows a second extrusion on top of the one it inherits from the lockup itself.
   */
  function record(el, declared) {
    let r = managed.get(el);
    if (!r) {
      r = {
        declared: false, ownedBy: null, opts: {}, metrics: null,
        track: null, bev: null, ton: null, lock: null, split: null, bled: null,
        revealed: false, revealIO: null,
      };
      managed.set(el, r);
    }
    if (declared) r.declared = true;
    return r;
  }

  function publishMetrics(el) {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 16;
    const m = metricsFor(cs);
    record(el).metrics = m;
    setStyle(el, '--sc-cap', (m.capRatio * fs).toFixed(3) + 'px');
    setStyle(el, '--sc-x', (m.xRatio * fs).toFixed(3) + 'px');
    setStyle(el, '--sc-cap-ratio', m.capRatio.toFixed(4));
    return { cs, fs, m };
  }

  /* ── the tracking solver ───────────────────────────────────────────────────────────────── */

  /**
   * Both the bleed inset and the tracking compensation put ink or box outside the measure. Give
   * whoever owns the band the job of containing it, once, rather than letting the document grow
   * a horizontal scroll nobody asked for.
   */
  function ensureClip(el) {
    const target = (C.clipSelector && el.closest(C.clipSelector)) || el.parentElement;
    if (target) setStyle(target, 'overflowX', 'clip');
    return target;
  }

  /** Union of the element's line boxes. Includes the trailing letter-space — measured, see header. */
  function inkBox(el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect();
  }

  /** Content-box width of the element's parent — the measure a line is actually laid into. */
  function measureWidth(el) {
    const p = el.parentElement;
    if (!p) return el.getBoundingClientRect().width;
    const cs = getComputedStyle(p);
    return p.getBoundingClientRect().width
      - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0)
      - parseFloat(cs.borderLeftWidth || 0) - parseFloat(cs.borderRightWidth || 0);
  }

  /**
   * Two-probe linear solve. width(L) = base + n·L exactly, where n is the number of spacing
   * insertions Chrome makes — one per character INCLUDING the last, which is the whole problem.
   * n is measured rather than taken from textContent.length so that ligatures, combining marks
   * and astral pairs cannot put the solve half a glyph out.
   *
   * Both probes are non-zero on purpose: letter-spacing:0 is a different shaping regime (Chrome
   * keeps ligatures there and drops them once spacing is applied), so a probe at 0 can sit off
   * the line the other probes lie on.
   */
  function solveTracking(el, opts = {}) {
    if (destroyed || !el) return null;
    const { cs, fs } = publishMetrics(el);
    const r = record(el);

    const target = opts.toPx != null
      ? opts.toPx
      : (opts.toWidth != null ? opts.toWidth : 1) * (opts.of != null ? opts.of : measureWidth(el));

    if (!(target > 0)) { console.warn('[display-type] tracking target is not a positive width'); return null; }

    setStyle(el, 'whiteSpace', 'nowrap');
    setStyle(el, 'marginInlineEnd', '0px');

    const La = 0.02 * fs;
    const Lb = 0.30 * fs;
    setStyle(el, 'letterSpacing', La + 'px');
    const Wa = inkBox(el).width;
    setStyle(el, 'letterSpacing', Lb + 'px');
    const Wb = inkBox(el).width;

    const n = (Wb - Wa) / (Lb - La);
    const base = Wa - n * La;

    if (!(n > 1.5)) {
      // One glyph has no gaps to open. Tracking it is a no-op with a trailing space attached.
      console.warn('[display-type] cannot track a single-glyph run —', (el.textContent || '').slice(0, 24));
      setStyle(el, 'letterSpacing', '0px');
      setStyle(el, 'marginInlineEnd', '0px');
      return null;
    }

    /* Only a line whose alignment DEPENDS on its own width needs the compensation, and paying it
     * where it is not needed is not free: the negative end margin widens the border box by one
     * letter-space, and a centred display line tracked to 141px of spacing pushes its box 141px
     * past the measure. On a phone that is horizontal document overflow, which product-check.mjs
     * FAILs — correctly, and it caught this. A left-flush line never had the problem in the first
     * place, so it does not get the fix. */
    const align = getComputedStyle(el).textAlign;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const needsComp = align === 'center' || align === 'justify'
      || align === 'end' || align === (rtl ? 'left' : 'right')
      || (rtl && align === 'start' && false);

    const clampL = (L) => Math.max(C.minTracking * fs, Math.min(C.maxTracking * fs, L));
    const comp = (L) => setStyle(el, 'marginInlineEnd', (needsComp ? -L : 0) + 'px');
    let L = clampL((target - base) / (n - 1));

    setStyle(el, 'letterSpacing', L + 'px');
    comp(L);

    // Verify against the rendered line, then correct once. Advance widths are not perfectly
    // linear in font-size once hinting is involved and a fractional letter-space is rounded
    // somewhere in layout; one pass lands this inside a tenth of a pixel in practice.
    let achieved = inkBox(el).width - L;
    const residual0 = achieved - target;
    if (Math.abs(residual0) > 0.25) {
      L = clampL(L - residual0 / (n - 1));
      setStyle(el, 'letterSpacing', L + 'px');
      comp(L);
      achieved = inkBox(el).width - L;
    }

    // The phantom width has to be contained or it becomes page-level overflow. clip, not hidden:
    // hidden would make the section a scroll container and take sticky children with it.
    if (needsComp && L > 0) ensureClip(el);

    const out = {
      glyphs: n, base, target, achieved,
      residual: achieved - target,
      trackingPx: L, trackingEm: L / fs,
      align, compensated: needsComp,
      clamped: Math.abs(L - (target - base) / (n - 1)) > 0.01,
    };
    r.track = out;
    r.opts.track = opts;
    return out;
  }

  /* ── tonal ────────────────────────────────────────────────────────────────────────────── */

  /** The two notations Chrome ever serialises a colour into: #rrggbb, or rgb()/rgba(). */
  function fromSerialised(s) {
    const hex = s.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
      if (h.length !== 6 && h.length !== 8) return null;
      return [
        parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16),
        h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      ];
    }
    const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
    if (!m) return null;
    const a = m[4] == null ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), a];
  }

  /**
   * Any CSS colour → [r,g,b,a]. Anything the two serialised forms do not cover (a page authoring
   * its grounds in `oklch()`, `color(display-p3 …)`, a named colour) is normalised by a canvas
   * round-trip, which understands every notation the browser does and needs no colour table here.
   * fillStyle silently KEEPS its previous value when handed something invalid, so it is seeded
   * with a sentinel first — without that, an unparseable colour comes back as whatever was
   * measured last, which is the worst possible failure mode for a solver.
   */
  function parseColour(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (!s || s === 'transparent' || s === 'none') return [0, 0, 0, 0];
    const direct = fromSerialised(s);
    if (direct) return direct;
    if (!ctx) return null;
    const SENTINEL = '#010203';
    ctx.fillStyle = SENTINEL;
    ctx.fillStyle = s;
    const norm = String(ctx.fillStyle);
    if (norm === SENTINEL) return null;
    return fromSerialised(norm);
  }

  const over = (top, bot) => {
    const a = top[3] + bot[3] * (1 - top[3]);
    if (a <= 0) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) => Math.round((top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a)).concat(a);
  };

  /**
   * The ground this element is actually sitting on, composited up the ancestor chain. This is a
   * computed-style walk and not a pixel read, because an engine cannot screenshot itself — which
   * is precisely why the page also gets checked by an instrument that CAN (contrast-check.mjs).
   * A section painted with an image or a gradient has no colour to find; declare `--sc-dt-ground`
   * on it and this uses that instead of guessing.
   */
  function groundOf(el) {
    const declared = getComputedStyle(el).getPropertyValue('--sc-dt-ground').trim();
    if (declared) {
      const c = parseColour(declared);
      if (c) return { rgb: [c[0], c[1], c[2]], source: 'declared' };
    }
    let node = el;
    let acc = null;
    let imaged = false;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') imaged = true;
      const c = parseColour(cs.backgroundColor);
      if (c && c[3] > 0) {
        acc = acc ? over(acc, c) : c;
        if (acc[3] >= 0.999) break;
      }
      node = node.parentElement;
    }
    if (!acc || acc[3] < 0.999) {
      const page = parseColour(getComputedStyle(document.documentElement).backgroundColor);
      acc = acc && page ? over(acc, [page[0], page[1], page[2], 1]) : (acc || [255, 255, 255, 1]);
    }
    if (imaged) {
      console.warn('[display-type] an ancestor paints a background-image; tonal() stepped from the '
        + 'background-COLOUR underneath it. Declare --sc-dt-ground if that is not the ground you mean.');
    }
    return { rgb: [acc[0], acc[1], acc[2]], source: imaged ? 'colour-under-image' : 'computed' };
  }

  /**
   * Step the face one move off the ground and the side one move off the face. Direction is the
   * ground's own: a light ground steps darker, a dark ground steps lighter. Nothing here takes an
   * author-supplied face or side colour, and that is deliberate — the moment those are literals
   * the "within one step" relationship breaks the first time someone changes a section's ground,
   * and it breaks silently.
   */
  function tonal(el, opts = {}) {
    if (destroyed || !el) return null;
    publishMetrics(el);
    const cfg = Object.assign({}, C, opts);
    const g = groundOf(el);
    const gLab = rgbToOklab(g.rgb[0], g.rgb[1], g.rgb[2]);
    const gLum = luminance(g.rgb[0], g.rgb[1], g.rgb[2]);
    const dir = gLab.L > cfg.lightPivot ? -1 : 1;

    let step = cfg.step;
    let face = tone(gLab, gLab.L + dir * step, dir, cfg);
    let widened = 0;
    while (ratioOf(gLum, face.lum) < cfg.minFaceRatio && widened < 10) {
      step += 0.045; widened++;
      face = tone(gLab, gLab.L + dir * step, dir, cfg);
    }
    const faceRatio = ratioOf(gLum, face.lum);

    /* The side plane has two jobs and they pull apart on a dark ground: it has to sit far enough
     * below the FACE to carry the letterform, and far enough from the GROUND to be visible as a
     * plane at all. Take whichever demand is stricter, then widen if the edge contrast still is
     * not there — rather than silently shipping an extrusion the gate is about to reject.
     *
     * `sideVsGround` separates the side from the ground DOWNWARD, which is the reference
     * construction and is right wherever there is room below. Below roughly OKLab L 0.19 there
     * is no room: sRGB is quantised hardest at the bottom, so on a #0a0605 ground the separation
     * renders as byte-0 black against a byte-10 ground — 10/255 apart, under the 14/255 at which
     * `tools/contrast-check.mjs` counts a pixel as painted at all. The extrusion is then not
     * low-contrast, it is ABSENT: measured 0 extrusion pixels against 14,731 face pixels, and
     * widening `step` never rescues it because the clamp pins the side to black at every step
     * from 0.22 to 0.58. So when the downward separation lands inside that band, take the
     * separation UPWARD instead and let the side sit between the ground and the face. The
     * mirrored side cannot be moved by `sideStep` — its L is fixed by the ground — so the loop
     * stops there and the edge-ratio warning below names the only thing that can still help. */
    const faceLab = rgbToOklab(face.rgb[0], face.rgb[1], face.rgb[2]);
    const bytesApart = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    let sideStep = cfg.sideStep;
    let side = null;
    let sideWidened = 0;
    let sideDirection = 'below';
    for (;;) {
      const L = Math.min(faceLab.L - sideStep, gLab.L - cfg.sideVsGround);
      side = tone(faceLab, L, -1, cfg);
      sideDirection = 'below';
      if (bytesApart(side.rgb, g.rgb) <= INK_BYTES) {
        let upL = gLab.L + cfg.sideVsGround;
        if (upL < faceLab.L) {
          let up = tone(faceLab, upL, -1, cfg);
          /* An OKLab separation is not a rendered separation at the bottom of sRGB: on a #000000
           * ground `sideVsGround` of 0.10 comes out 3/255. Walk it up until the plane is one the
           * gate could see, stopping at the face — the same threshold used as a solve rather
           * than as a test. */
          for (let guard = 0; bytesApart(up.rgb, g.rgb) <= INK_BYTES && upL + 0.01 < faceLab.L && guard < 40; guard++) {
            upL += 0.01;
            up = tone(faceLab, upL, -1, cfg);
          }
          if (bytesApart(up.rgb, g.rgb) > bytesApart(side.rgb, g.rgb)) { side = up; sideDirection = 'between'; }
        }
      }
      if (sideDirection === 'between') break;
      if (ratioOf(face.lum, side.lum) >= cfg.minEdgeRatio || L <= 0.02 || sideWidened >= 10) break;
      sideStep += 0.05; sideWidened++;
    }
    const sideRatio = ratioOf(face.lum, side.lum);
    if (sideRatio < cfg.minEdgeRatio) {
      console.warn(`[display-type] side face only reaches ${sideRatio.toFixed(2)}:1 under `
        + `${css(face.rgb)} — the extrusion cannot carry this face and the edge gate will say so. `
        + `The face is what is short: widen \`step\` until it clears ${cfg.minEdgeRatio}:1.`);
    }
    const edge = tone(rgbToOklab(side.rgb[0], side.rgb[1], side.rgb[2]), side.L - 0.10, -1, cfg);

    setStyle(el, 'color', css(face.rgb));
    setStyle(el, '--sc-dt-face', css(face.rgb));
    setStyle(el, '--sc-dt-side', css(side.rgb));
    setStyle(el, '--sc-dt-edge', css(edge.rgb));

    const out = {
      ground: css(g.rgb), groundSource: g.source,
      face: css(face.rgb), side: css(side.rgb), edge: css(edge.rgb),
      groundL: gLab.L, faceL: face.L, sideL: side.L,
      step: dir * step, sideStep, sideDirection,
      faceVsGround: faceRatio, sideVsFace: sideRatio,
      direction: dir > 0 ? 'lighter' : 'darker',
      widened, sideWidened,
    };
    record(el).ton = out;
    record(el).opts = Object.assign(record(el).opts, { tonal: opts });
    return out;
  }

  /* ── bevel ────────────────────────────────────────────────────────────────────────────── */

  /**
   * A hard two-plane extrusion, scaled off MEASURED cap height. No blur: the reference planes are
   * flat and a blurred shadow reads as a drop shadow, which is the opposite look. Built as a
   * stack of offset copies at sub-pixel steps because a single offset copy is a ghost, not a
   * solid side — the union of the stack is the swept volume between the face and its far edge.
   */
  function bevel(el, opts = {}) {
    if (destroyed || !el) return null;
    const { cs, fs, m } = publishMetrics(el);
    const cfg = Object.assign({}, C, opts);
    const depth = cfg.depth != null ? cfg.depth : cfg.bevelDepth;
    const angle = cfg.angle != null ? cfg.angle : cfg.bevelAngle;
    const edgeFrac = Math.max(0, Math.min(0.9, cfg.edge != null ? cfg.edge : cfg.bevelEdge));

    const capPx = m.capRatio * fs;
    const depthPx = depth * capPx;
    if (!(depthPx > 0.5)) {
      setStyle(el, 'textShadow', 'none');
      return { depthPx, layers: 0 };
    }

    const own = getComputedStyle(el);
    const sideCss = (cfg.side || own.getPropertyValue('--sc-dt-side').trim())
      || (() => {
        // No tonal() has run. Step the side off the element's OWN rendered colour so bevel() is
        // usable standalone, rather than inventing a literal that stops being right the moment
        // anyone changes the type colour.
        const c = parseColour(own.color) || [128, 128, 128, 1];
        const lab = rgbToOklab(c[0], c[1], c[2]);
        return css(tone(lab, lab.L - cfg.sideStep, -1, cfg).rgb);
      })();
    const edgeCss = (cfg.edgeColour || own.getPropertyValue('--sc-dt-edge').trim()) || sideCss;

    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad) * depthPx;
    const dy = Math.sin(rad) * depthPx;
    const steps = Math.max(2, Math.min(48, Math.ceil(depthPx / 0.6)));
    const cut = Math.max(1, Math.round(steps * (1 - edgeFrac)));

    const near = [];
    const far = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const layer = `${(dx * t).toFixed(2)}px ${(dy * t).toFixed(2)}px 0 ${i <= cut ? sideCss : edgeCss}`;
      (i <= cut ? near : far).push(layer);
    }
    // Later shadows paint UNDER earlier ones, so the far-tone layers listed last show only in the
    // band the near layers do not reach — which is exactly the far edge of the extrusion.
    setStyle(el, 'textShadow', near.concat(far).join(', '));
    setStyle(el, '--sc-dt-depth', depthPx.toFixed(2) + 'px');

    const out = { capPx, depthPx, depth, angle, layers: steps, edgeFrac, side: sideCss, edge: edgeCss };
    record(el).bev = out;
    record(el).opts = Object.assign(record(el).opts, { bevel: opts });
    return out;
  }

  /* ── bleed ────────────────────────────────────────────────────────────────────────────── */

  /**
   * Clip 9 @2.83s: headlines start at x=0 with zero left padding and the first letter is
   * partially cut by the viewport edge. The cut is a fraction of the first glyph's INK, not of
   * font-size and not of its advance width — a 'T' and a 'W' have very different ink at the same
   * advance, and cutting both by "12px" makes one look deliberate and the other look broken.
   */
  function bleed(el, opts = {}) {
    if (destroyed || !el) return null;
    const { cs, fs, m } = publishMetrics(el);
    const amount = opts.amount != null ? opts.amount : C.bleedAmount;

    const text = (el.textContent || '').trim();
    if (!text) return null;

    let inkW = fs * 0.6;
    let lsb = 0;
    if (ctx) {
      const sentinel = '10px sans-serif';
      ctx.font = sentinel;
      ctx.font = specOf(cs, fs);
      if (ctx.font !== sentinel) {
        const g = ctx.measureText(text[0]);
        inkW = Math.max(1, g.actualBoundingBoxRight + g.actualBoundingBoxLeft);
        lsb = -g.actualBoundingBoxLeft;   // distance from the pen to the first ink column
      }
    }

    setStyle(el, 'marginInlineStart', '0px');
    const box = inkBox(el);
    const inkLeft = box.left + lsb;
    const shift = inkLeft + amount * inkW;
    setStyle(el, 'marginInlineStart', (-shift).toFixed(2) + 'px');

    // Without a clip the bled glyph paints over whatever is to its left.
    const clipTarget = ensureClip(el);

    const out = { shift, inkW, lsb, amount, clipTarget };
    record(el).bled = out;
    record(el).opts = Object.assign(record(el).opts, { bleed: opts });
    return out;
  }

  /* ── lockup ───────────────────────────────────────────────────────────────────────────── */

  /**
   * Clip 6: "Wordmark as a 3x3 letter block: Z O I / I C E / T E A … tracked so three rows of
   * three letters land on identical widths … It occupies a square, so it holds a corner without
   * needing a container or a lockup rule."
   *
   * This is the move the solver unlocks. Every row gets its OWN tracking, solved to one shared
   * target — which is impossible to do by hand across a webfont swap, and impossible to do at all
   * with a single hardcoded em value, because 'ICE' and 'TEA' have different natural widths.
   */
  function lockup(el, opts = {}) {
    if (destroyed || !el) return null;
    publishMetrics(el);
    const rows = [...el.children].filter((n) => n.nodeType === 1);
    if (rows.length < 2) {
      console.warn('[display-type] lockup needs one child element per row');
      return null;
    }
    for (const row of rows) {
      setStyle(row, 'display', 'block');
      // start-aligned on purpose: the row's ink is solved to exactly the block width, so every
      // alignment puts it in the same place, and `start` is the one that needs no trailing-space
      // compensation and therefore adds no phantom box width to contain.
      setStyle(row, 'textAlign', 'start');
      setStyle(row, 'whiteSpace', 'nowrap');
      setStyle(row, 'letterSpacing', '0px');
      setStyle(row, 'marginInlineEnd', '0px');
      publishMetrics(row);
    }

    const rowH = rows.map((r) => r.getBoundingClientRect().height);
    const blockH = rowH.reduce((a, b) => a + b, 0);
    const natural = Math.max(...rows.map((r) => inkBox(r).width));

    const target = opts.toPx != null ? opts.toPx
      : opts.toWidth != null ? opts.toWidth * measureWidth(el)
        : opts.square !== false ? blockH        // the square is the point: width = stacked height
          : natural;

    setStyle(el, 'width', target.toFixed(2) + 'px');
    const solved = rows.map((row) => {
      const out = solveTracking(row, { toPx: target, of: target });
      record(row).ownedBy = el;
      return out;
    });

    const out = { target, blockH, natural, rows: solved, square: opts.square !== false };
    record(el).lock = out;
    record(el).opts = Object.assign(record(el).opts, { lockup: opts });
    return out;
  }

  /* ── line splitter ────────────────────────────────────────────────────────────────────── */

  let styleTag = null;
  function ensureStyle() {
    if (styleTag) return;
    styleTag = document.createElement('style');
    styleTag.setAttribute('data-sc', NS);
    styleTag.textContent = `
.sc-dt-line{display:block;overflow:hidden}
.sc-dt-in{display:block;will-change:auto}
.sc-dt-line[data-sc-reveal="pending"] .sc-dt-in{transform:translateY(110%)}
.sc-dt-line[data-sc-reveal="run"] .sc-dt-in{transform:translateY(0);
  transition:transform var(--sc-dt-dur,.62s) cubic-bezier(.16,.84,.3,1) var(--sc-dt-delay,0s)}
`;
    document.head.appendChild(styleTag);
  }

  /**
   * Split a single-text-node element into one masked line per RENDERED line. The mask box is
   * grown down and right by the bevel depth and pulled back by the same amount in margin, so the
   * extrusion survives a clip that would otherwise shear it off — a per-line overflow:hidden and
   * a lower-right extrusion are in direct conflict and nothing warns you about it.
   *
   * Nested markup is not handled: it would have to be re-flowed per line and the result would be
   * a different DOM from the one the author wrote. Warn and leave it alone.
   */
  function splitLines(el, opts = {}) {
    if (destroyed || !el) return null;
    const r = record(el);
    const source = r.split ? r.split.source : el.innerHTML;
    /* Re-read the ORIGINAL text, never the split DOM. Each line becomes its own block, so the
     * space that used to sit between two lines is not in any text node any more — re-splitting
     * off el.textContent silently welds the lines together, and it compounds on every resize.
     * It shipped exactly once, as "Printed,nottypeset." */
    const text = (r.split ? r.split.text : (el.textContent || '')).replace(/\s+/g, ' ').trim();
    if (!text) return null;
    if (!r.split && el.children.length) {
      console.warn('[display-type] splitLines only handles a plain text run —', el.tagName);
      return null;
    }

    /* Do not re-split at the same width. Every solve used to tear the line spans down and rebuild
     * them, which meant the reveal's transition was running on elements that got detached a frame
     * later — the animation never played and the DOM ended up in the right final state, so
     * nothing looked broken and nothing was. Measured: `data-sc-reveal` was absent from every
     * line in the finished page, in both the reduced and unreduced runs.
     *
     * Line breaks can only move when the measure moves, so the measure is the guard. */
    const nowWidth = el.getBoundingClientRect().width;
    if (r.split && Math.abs(nowWidth - r.split.width) < 0.5
        && r.split.lineEls.length && r.split.lineEls[0].isConnected) {
      /* The measure cannot have moved, but the preference can have. This early return is upstream
       * of every `rmq.matches` read below, so the solve that the `change` listener schedules would
       * otherwise leave a pending reveal armed and play it in full the moment the element scrolls
       * into view — §4 promises a visitor who enables it mid-session a still page, not a delayed
       * animation. */
      if (rmq.matches && r.split.reveal && !r.revealed) settleReveal(r);
      return r.split;
    }
    ensureStyle();

    // Measure where the browser actually breaks: wrap every word, read tops, group.
    el.textContent = '';
    const words = text.split(' ');
    const probes = words.map((w, i) => {
      const s = document.createElement('span');
      s.textContent = w + (i < words.length - 1 ? ' ' : '');
      el.appendChild(s);
      return s;
    });
    const lines = [];
    let lastTop = null;
    for (let i = 0; i < probes.length; i++) {
      const top = Math.round(probes[i].getBoundingClientRect().top);
      if (lastTop === null || Math.abs(top - lastTop) > 1) { lines.push([]); lastTop = top; }
      lines[lines.length - 1].push(words[i]);
    }

    const depth = parseFloat(getComputedStyle(el).getPropertyValue('--sc-dt-depth')) || 0;
    const pad = Math.ceil(depth) + 1;
    const reduced = rmq.matches;
    // A resize re-splits, because the line breaks moved. Replaying the reveal each time would
    // turn a window drag into a slideshow, so a reveal that has already run stays run.
    const reveal = !!opts.reveal && !r.revealed;
    const stagger = opts.stagger != null ? opts.stagger : 0.085;
    const duration = opts.duration != null ? opts.duration : 0.62;

    el.textContent = '';
    const lineEls = lines.map((wordsOnLine, i) => {
      const outer = document.createElement('span');
      outer.className = 'sc-dt-line';
      outer.setAttribute('data-sc', NS);
      outer.style.paddingInlineEnd = pad + 'px';
      outer.style.paddingBottom = pad + 'px';
      outer.style.marginInlineEnd = -pad + 'px';
      outer.style.marginBottom = -pad + 'px';
      const inner = document.createElement('span');
      inner.className = 'sc-dt-in';
      inner.textContent = wordsOnLine.join(' ');
      outer.appendChild(inner);
      if (reveal && !reduced) {
        outer.style.setProperty('--sc-dt-delay', (i * stagger).toFixed(3) + 's');
        outer.style.setProperty('--sc-dt-dur', duration + 's');
        outer.setAttribute('data-sc-reveal', 'pending');
      }
      el.appendChild(outer);
      return outer;
    });

    const out = { source, text, width: el.getBoundingClientRect().width,
      lines: lines.map((l) => l.join(' ')), lineEls, pad, reveal, reduced };
    r.split = out;
    r.opts.split = opts;

    /* A reveal is autonomous once triggered, so under the preference there is no reveal at all —
     * the resolved state is what gets painted on frame one. Not a shorter animation: a shorter
     * animation is still the thing the preference asked not to happen. */
    if (reveal && !reduced) {
      const run = () => {
        r.revealed = true;
        for (const l of lineEls) l.setAttribute('data-sc-reveal', 'run');
      };
      if (typeof IntersectionObserver === 'undefined') run();
      else {
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) { run(); io.disconnect(); observers.delete(io); }
        }, { rootMargin: '0px 0px -12% 0px' });
        io.observe(el);
        observers.add(io);
        r.revealIO = io;
      }
    }
    return out;
  }

  /**
   * Land a reveal that is still armed, without playing it. Dropping `data-sc-reveal` altogether
   * leaves neither stylesheet rule matching, which is the same resolved paint the reduced branch
   * produces at split time — not a shortened transition.
   */
  function settleReveal(r) {
    if (r.revealIO) { r.revealIO.disconnect(); observers.delete(r.revealIO); r.revealIO = null; }
    r.revealed = true;
    for (const l of r.split.lineEls) l.removeAttribute('data-sc-reveal');
  }

  /* ── audit ────────────────────────────────────────────────────────────────────────────── */

  /**
   * "Headline case is chosen per section rather than globally … Five registers, deliberate."
   * (clip 6) and "there is no mid-tier size doing negotiation between them; the jump IS the
   * hierarchy." A single global case rule and a comfortable mid-tier are the two loudest tells of
   * automated design, and both are countable — so count them rather than asserting them.
   */
  function audit() {
    const bodySize = parseFloat(getComputedStyle(document.body).fontSize) || 16;
    const registers = {};
    const sizes = [];
    /* The census runs over the page's HEADINGS plus the display class, not over everything this
     * engine happens to manage. A lockup's three rows are managed — they need re-solving — but
     * they are one mark, not three case decisions, and counting them turned a page with four
     * distinct registers into a page that claimed six. */
    const census = new Set([...host.querySelectorAll(C.registerSelector)]);
    for (const el of census) {
      if (!el.isConnected || managed.get(el)?.ownedBy) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize) || 16;
      const raw = (el.textContent || '').trim();
      if (!raw) continue;
      const shown = cs.textTransform === 'uppercase' ? raw.toUpperCase()
        : cs.textTransform === 'lowercase' ? raw.toLowerCase() : raw;
      const hasUpper = /\p{Lu}/u.test(shown);
      const hasLower = /\p{Ll}/u.test(shown);
      const rec = managed.get(el);
      const track = rec && rec.track ? rec.track.trackingEm : (parseFloat(cs.letterSpacing) / fs || 0);
      let reg = hasUpper && !hasLower ? 'upper' : (!hasUpper && hasLower ? 'lower' : 'sentence');
      if (reg === 'upper' && track > 0.18) reg = 'upper-tracked';
      registers[reg] = (registers[reg] || 0) + 1;
      sizes.push({ tag: el.tagName.toLowerCase(), fs, register: reg });
    }
    sizes.sort((a, b) => b.fs - a.fs);
    const max = sizes.length ? sizes[0].fs : 0;
    const ratio = bodySize > 0 ? max / bodySize : 0;
    // A "mid-tier" is a managed size loitering between twice the body and half the display —
    // the size that exists to soften a jump the corpus deliberately does not soften.
    const midTier = sizes.find((s) => s.fs > bodySize * 2 && s.fs < max * 0.55) || null;
    return { registers, distinctRegisters: Object.keys(registers).length, sizes, bodySize, ratio, midTier };
  }

  /* ── solve / re-solve ─────────────────────────────────────────────────────────────────── */

  const observers = new Set();
  /** undefined = not probed yet; null = probed and not applicable (weight >= 350). */
  let thin;

  function roles(el) {
    return String(el.getAttribute(ROLE_ATTR) || '').trim().split(/\s+/).filter(Boolean);
  }

  function collect() {
    const found = [...host.querySelectorAll(C.selector)];
    if (host.matches && host.matches(C.selector)) found.unshift(host);
    return found;
  }

  /**
   * Order matters and it is not arbitrary: tonal() writes --sc-dt-side, which bevel() reads;
   * bevel() writes --sc-dt-depth, which splitLines() needs to grow its mask past the extrusion;
   * and bleed() measures the finished ink box, so it has to run after tracking has changed it.
   */
  function solveOne(el) {
    const r = record(el);
    const tokens = r.declared ? roles(el) : [];
    publishMetrics(el);
    if (thin === undefined) thin = thinCheck(getComputedStyle(el));

    const o = r.opts;
    const autoOn = r.declared && C.auto && !tokens.includes('plain');
    if (autoOn || o.tonal) tonal(el, o.tonal || {});
    if (autoOn || o.bevel) bevel(el, o.bevel || {});
    if (o.lockup || tokens.includes('lockup')) lockup(el, o.lockup || {});
    if (o.track) solveTracking(el, o.track);
    // bleed BEFORE split: the inset makes the element wider, and a split computed at the
    // pre-bleed width freezes line breaks the finished layout does not have.
    if (o.bleed || tokens.includes('bleed')) bleed(el, o.bleed || {});
    if (o.split) splitLines(el, o.split);
  }

  /** Re-solve everything. Cheap and idempotent: every step re-measures from the live DOM. */
  function resolve() {
    if (destroyed) return;
    for (const el of collect()) record(el, true);
    for (const el of [...managed.keys()]) {
      if (!el.isConnected) { managed.delete(el); continue; }
      // Lockup rows are re-solved by their own lockup, which knows the shared target width.
      if (managed.get(el).ownedBy) continue;
      solveOne(el);
    }
  }

  function schedule() {
    if (destroyed || pending) return;
    pending = requestAnimationFrame(() => { pending = 0; resolve(); });
  }

  /* ── boot ─────────────────────────────────────────────────────────────────────────────── */

  for (const el of collect()) record(el, true);

  /* Load the exact face each managed element asks for BEFORE measuring it, or canvas hands back
   * the fallback's metrics with no error and no warning. See the trap note above metricsFor(). */
  if (document.fonts && document.fonts.load) {
    for (const el of managed.keys()) {
      try { document.fonts.load(specOf(getComputedStyle(el), 16), 'Hxp'); } catch { /* non-fatal */ }
    }
  }

  resolve();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (destroyed) return;
      metricCache.clear();
      thin = undefined;   // null means 'probed, not applicable' — re-probe against the real face
      resolve();
    }).catch(() => {});
  }

  /* Observe the PARENTS, not the managed elements. Tracking and the bleed inset change a managed
   * element's own width by construction, so observing it would feed its own output back in as
   * input — a resize loop that only shows up on the machine that is slow enough to render it. */
  let ro = null;
  const lastWidth = new Map();
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver((entries) => {
      if (destroyed) return;
      let moved = false;
      for (const e of entries) {
        const w = e.contentRect.width;
        const was = lastWidth.get(e.target);
        if (was === undefined || Math.abs(was - w) > 0.5) { lastWidth.set(e.target, w); moved = true; }
      }
      if (moved) schedule();
    });
    ro.observe(host);
    for (const el of managed.keys()) if (el.parentElement) ro.observe(el.parentElement);
  }
  const onResize = () => schedule();
  if (!ro) window.addEventListener('resize', onResize, { passive: true });

  const onPref = () => { if (!destroyed) schedule(); };
  if (rmq.addEventListener) rmq.addEventListener('change', onPref);
  else if (rmq.addListener) rmq.addListener(onPref);

  return {
    supported: true,
    get elements() { return [...managed.keys()]; },
    get metrics() {
      const first = managed.values().next().value;
      return first ? Object.assign({}, first.metrics, { thin }) : null;
    },
    /** Everything solved for one element: tracking, tonal pair, bevel, bleed, lockup. */
    report(el) { return managed.get(el) || null; },

    solveTracking,
    bevel,
    tonal,
    lockup,
    bleed,
    splitLines,
    audit,
    resolve,

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (pending) cancelAnimationFrame(pending);
      pending = 0;
      if (ro) ro.disconnect(); else window.removeEventListener('resize', onResize);
      for (const io of observers) io.disconnect();
      observers.clear();
      if (rmq.removeEventListener) rmq.removeEventListener('change', onPref);
      else if (rmq.removeListener) rmq.removeListener(onPref);
      // Put split elements back before restoring styles — the wrappers carry inline styles of
      // their own and removing them first would leave `touched` pointing at detached nodes.
      for (const [el, r] of managed) if (r.split) el.innerHTML = r.split.source;
      restoreAll();
      if (styleTag) { styleTag.remove(); styleTag = null; }
      managed.clear();
      metricCache.clear();
    },
  };
}

export default initDisplayType;
