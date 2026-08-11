/**
 * kinetic-marquee — type as a moving surface.
 * ─────────────────────────────────────────────────────────────────────────
 * Derived from corpus clip 6 (ZOI ICE TEA) @0.25s, "Autonomous horizontal marquee running
 * BEHIND the hero product". What the reference actually does, measured off the clip:
 *
 *   "Drink. Freeze." repeats on an infinite horizontal loop at DISPLAY size — cap height
 *   about a sixth of viewport height — drifting LEFT-TO-RIGHT at roughly a sixth of a
 *   viewport width per second. That number was measured by tracking the "D" across frames
 *   while the 3D held completely static, which is how we know the drift is idle autoplay
 *   and not scroll. The type sits on a z-layer BEHIND the ice block, so the block occludes
 *   the middle of the word. Its OPACITY is separately tied to scroll: a ~15% ghost by the
 *   time the shatter is under way, and gone before the next headline arrives.
 *
 * Two clocks on one element, and that separation is the whole idea. POSITION is a function
 * of time. OPACITY is a function of scroll. Tie them together — the usual instinct, scrub
 * the marquee with scroll — and you lose the thing that makes it work: a page that is alive
 * while the visitor sits still, and a word that recedes on cue when the next act needs the
 * frame. So `setProgress()` here moves opacity only, and never position.
 *
 * DEPARTURE FROM THE REFERENCE IMPLEMENTATION: caustic-field is raw WebGL because a
 * defocused colour field is a shader problem. This is not. This is type, and the browser
 * already has the best text rasteriser on the machine, hinted, subpixel-positioned and free.
 * Drawing glyphs into a canvas would mean an atlas or an SDF, a font loader, and worse
 * output at every size. So: DOM text, one transform, one rAF. Still zero dependencies, still
 * one file, still drops into a page with no build step — which is the rule §2 is actually
 * protecting.
 *
 * CONTRACT §5 (clamp DPR before you allocate) has nothing to bite on here — there is no
 * backing store. The browser rasterises glyphs at whatever DPR it chooses and there is no
 * allocation to cap. Stated rather than silently skipped.
 *
 * Other corpus techniques folded in, each cited where it lands in the code below:
 *   clip 6  @15s   oversized display type CLIPPED by the viewport rather than fitted inside
 *                  it  →  mode:'plate'
 *   clip 9  @2.83s display type flush to the viewport edge, bleeding off  →  inherent: the
 *                  track has no gutter, so the first glyph is always cut by the edge
 *   clip 9  @0s    tonal display type, headline hue within one step of its background  →
 *                  the plate preset's default colour
 *   clip 10 @7.67s staggered per-character scramble reveal  →  scramble:{…}
 *   clip 0  @8.7s  slow, READABLE announcement marquee, ~110 CSS px/s at 1440  →
 *                  mode:'announcement'
 *   clip 11 @7.4s  the same bar measured again on a second capture: ~100 CSS px/s, repeat
 *                  unit ~470 CSS px, full cycle ~4.7s, with a gap of roughly one repeat
 *                  width between repeats  →  the announcement preset's gap and speed
 *
 *   import { initKineticMarquee } from './engine.js'
 *   const m = initKineticMarquee(document.querySelector('[data-band]'), {
 *     text: 'Type. Moves.',
 *     mode: 'band',
 *     scramble: true,
 *   })
 *   m.setProgress(scrollTop / (scrollHeight - innerHeight))   // opacity only
 *   m.pause(); m.play()
 *   m.destroy()
 *
 * prefers-reduced-motion: the marquee goes SILENT. An autonomous marquee is the precise
 * thing that preference is asking to stop — it moves while the visitor sits still, forever,
 * with no way to look away from it. It still renders one real frame of itself: the same
 * type, the same size, the same place, the scramble already resolved, just not drifting.
 * Opacity still answers setProgress(), because that is a response to the visitor's own
 * scrolling rather than self-driven motion. Re-read every frame and subscribed to `change`,
 * so switching the OS setting mid-session takes effect without a reload.
 */

const RM_QUERY = '(prefers-reduced-motion: reduce)';

const BASE = {
  /** The repeat unit. Whitespace is preserved, so trailing spaces are a legitimate gap. */
  text: 'MARQUEE',
  /** 'band' | 'plate' | 'announcement'. Selects the defaults below; explicit config wins. */
  mode: 'band',
  /** CSS font-family. Empty inherits from the container, which is usually what you want. */
  font: '',
  weight: 800,
  /** 'none' | 'uppercase' | 'lowercase' | 'capitalize' */
  transform: 'none',
  color: '#ffffff',
  /** Static multiplier applied on top of the scroll-driven fade. */
  opacity: 1,
  /**
   * Cap-height–to–font-size ratio for the face in use. 0.72 is typical for a neo-grotesque
   * and is what makes `size` mean something physical. It is an ESTIMATE, not a measurement
   * of your font — if you ship a display face with an unusual cap height, measure it and set
   * this, or `size` will be off by however wrong the estimate is.
   */
  capRatio: 0.72,
  /** Baseline position from the top of the em box at line-height 1. Same caveat as capRatio. */
  baselineRatio: 0.80,
  /**
   * Cap the per-frame step. Without it, a tab restored after thirty seconds in the background
   * hands the loop a thirty-second dt and the marquee teleports most of a screen sideways in
   * one frame. 50ms is three frames' worth: enough to ride out a hitch, short enough that the
   * jump is never visible.
   */
  maxDt: 0.05,
  /**
   * Opacity easing, expressed as the fraction of the remaining distance covered per frame AT
   * 60fps and then rescaled by the real dt. The naive per-frame form is a lie on any machine
   * that is not running at 60: measured here at ~15fps under software GL, a 0.12 constant took
   * four times as long in wall-clock and the ghost was still visibly settling most of a second
   * after the scroll stopped. Same easing, same seconds, whatever the frame rate.
   */
  ease: 0.12,
  /**
   * Round the loop period to a whole CSS pixel by absorbing the remainder into the gap.
   * Measured, not assumed: with "Type. Moves." at a 1/6-viewport cap the natural period came
   * out at 1282.9375px, and shifting the track by exactly that left 0.4% of the band's pixels
   * different — glyph-edge antialiasing, two ways at once. A fractional period means copy k+1
   * is rasterised at a different subpixel phase from copy k, so the copies are not pixel-clones
   * of each other; and a compositor layer (will-change:transform) translated by a fractional
   * delta resamples. Snapping the period kills both. It costs up to half a pixel of gap, which
   * at these sizes is nothing. Turn it off if you need the gap exact for some other reason.
   */
  snapPeriod: true,
  /**
   * Ceiling on the repeat unit as a fraction of CONTAINER width; the type shrinks until it
   * fits. 0 disables it.
   *
   * `size` alone is not enough and a phone is where that shows. The corpus measurement is a
   * cap height of 1/6 of viewport height, taken off a ~16:9 desktop capture where the phrase
   * came out at roughly one viewport wide. Apply the same 1/6 to a 390x844 phone and the
   * phrase is THREE viewport widths — the hero shows "Ty" and the visitor has no idea there is
   * a word there. The proportion the reference actually has is two constraints, not one, and
   * this is the second. At 1440x900 it never binds, so the desktop numbers are untouched.
   */
  fit: 0,
  /** Per-character scramble reveal (clip 10). `true` for defaults, or an object, or false. */
  scramble: false,
  /**
   * The corpus is explicit that the reference marquees do NOT pause on hover — clip 0: "It
   * never pauses and never pauses on hover." Default matches. The pause() API exists for the
   * page's benefit (off-screen, a video taking over, a visitor's own control), not the
   * pointer's.
   */
  pauseOnHover: false,
};

const SCRAMBLE_DEFAULTS = {
  /* Clip 10's frame reads 'PUDGY PE#GVJ⌐U' — caps and punctuation, word boundaries intact.
   * Kept to characters every system font has; box-drawing glyphs fall back to a different
   * face at a different weight and the churn stops looking like one typeface misbehaving. */
  chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@*/\\<>+=',
  /** Seconds before the first character settles. */
  hold: 0.18,
  /** Seconds between adjacent characters settling. Total = hold + (len-1) * stagger. */
  stagger: 0.045,
  /**
   * Glyph substitutions per second. NOT the frame rate: at 60Hz the churn averages out into
   * grey mush and you cannot read a single wrong letter. The corpus frame shows discrete,
   * legible garbage, which means the substitution rate is well under the refresh rate.
   */
  rate: 18,
};

const PRESETS = {
  /**
   * clip 6 @0.25s. Every number here was measured off the clip: cap height 1/6 of viewport
   * height, drift 1/6 of a viewport width per second, left-to-right, fading to a ~15% ghost
   * and then out before the next headline.
   */
  band: {
    size: 1 / 6,
    y: 0.5,
    speed: 1 / 6,
    direction: 'right',
    gap: 0.38,
    tracking: -0.03,
    // Never binds at 1440x900; on a phone it is the difference between a hero and a fragment.
    fit: 1.15,
    /* The corpus is specific and it is EARLY: "faded to a ~15% ghost by the time the shatter
     * is under way, and it is gone before the next headline arrives." These stops are
     * fractions of whatever you feed setProgress(), so on a six-act page 0.12 is roughly the
     * moment act two's headline enters the frame. Move them onto YOUR act boundaries — a
     * marquee still at 70% when the next headline crosses it is two layers of type fighting,
     * which is what this default originally shipped as and what the demo caught. */
    fade: [
      { at: 0.0, opacity: 1 },
      { at: 0.12, opacity: 0.15 },
      { at: 0.28, opacity: 0 },
    ],
  },

  /**
   * clip 6 @15s — "Oversized display type clipped by the viewport rather than fitted inside
   * it": cap tops cut off by the top of the frame, the burger icon overlapping the last
   * letter, type treated as a background plate the window crops. `y` is the centre of the
   * CAP BAND as a fraction of container height, so 0.13 with a 0.44 cap puts the top of the
   * band at -0.09 — about a fifth of the cap height above the container edge, and therefore
   * cropped. Values outside 0..1 are the treatment, not a bug.
   *
   * Colour is tonal, from clip 9 @0s: display type kept within about one step of its ground
   * (#2b3039 on a #08090c page measures 1.5:1). Below WCAG for body text and deliberately
   * so — it only ever works at this scale, where legibility comes from mass rather than
   * value. Do not use this preset for anything a visitor has to read.
   */
  plate: {
    size: 0.44,
    y: 0.13,
    speed: 0.045,
    direction: 'right',
    gap: 0.3,
    tracking: -0.045,
    color: '#2b3039',
    fade: [{ at: 0, opacity: 1 }],
    /* Looser than the band's — the plate is SUPPOSED to overflow, that is the technique — but
     * not unbounded. Without a ceiling, "OVERSIZED" at 0.44 of a 844px-tall phone is seven
     * viewport widths and the section renders a single tonal "O", which undercuts the very
     * copy sitting next to it. 2.6 never binds at 1440x900 and leaves a phone about a third of
     * the phrase: still cropped on both sides, still obviously a word. */
    fit: 2.6,
  },

  /**
   * clip 0 @8.7s and clip 11 @7.4s — the same announcement bar measured on two captures.
   * ~110 and ~100 CSS px/s at a ~1440 viewport, i.e. 0.07-0.076 viewport widths per second;
   * a repeat unit of ~470 CSS px with a gap of roughly one repeat width; a full cycle in
   * ~4.7s. The corpus calls this the RESTRAINT case: "Slow enough to read a whole phrase
   * without tracking it", explicitly not the ~300px/s ticker most themes ship.
   *
   * `size` is a fraction of the CONTAINER, and the container here is the strip — 0.235 of a
   * 40px bar is a 9.4px cap, i.e. ~13px type, which is what was measured.
   */
  announcement: {
    size: 0.235,
    y: 0.5,
    speed: 0.076,
    direction: 'left',
    gap: 1.0,
    tracking: 0.05,
    weight: 700,
    transform: 'uppercase',
    fade: [{ at: 0, opacity: 1 }],
  },
};

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** Resolve the fade curve at a progress value by walking the sorted stop list. */
function opacityAt(stops, prog) {
  if (!stops || !stops.length) return 1;
  const s = stops;
  if (prog <= s[0].at) return s[0].opacity;
  if (prog >= s[s.length - 1].at) return s[s.length - 1].opacity;
  for (let i = 0; i < s.length - 1; i++) {
    if (prog >= s[i].at && prog <= s[i + 1].at) {
      const span = s[i + 1].at - s[i].at;
      // Two stops at the same `at` is a legal way to ask for a hard cut, so a zero span is a
      // supported input rather than an impossible one. Dividing by it would paint NaN into a
      // style property, which the browser drops silently and leaves the layer at its last
      // opacity with nothing in the console.
      const t = span <= 0 ? 1 : (prog - s[i].at) / span;
      const e = t * t * (3 - 2 * t);
      return s[i].opacity + (s[i + 1].opacity - s[i].opacity) * e;
    }
  }
  return s[0].opacity;
}

const inert = () => ({
  layer: null,
  supported: false,
  paused: true,
  setProgress() {},
  setText() {},
  pause() {},
  play() {},
  destroy() {},
});

export function initKineticMarquee(container, config = {}) {
  if (typeof window === 'undefined' || !container) return inert();

  const preset = PRESETS[config.mode] || PRESETS.band;
  const C = Object.assign({}, BASE, preset, config);

  let text = String(C.text == null ? '' : C.text);
  // An empty marquee is a caller bug, not a look. Returning inert keeps the page up and puts
  // the reason somewhere findable, per §6.
  if (!text.trim()) {
    console.warn('[kinetic-marquee] no text — nothing to loop');
    return inert();
  }
  /* Every index into the phrase runs through this array, never through `text[i]`. The scramble
   * builds one cell per CODE POINT and the churn used to address them with UTF-16 indices, so a
   * phrase carrying anything outside the BMP got fewer cells than indices: with 'A🎉B' the cells
   * were ['A','🎉','B'] while the churn wrote str[0..3], which put half a surrogate pair in cell
   * 1, the other half in cell 2, and left cell 3 holding the wrong glyph — permanently, because
   * the settled write misaligned the same way. Astral characters are handled; a combining mark
   * still gets its own cell and is noted as a limitation rather than silently half-fixed. */
  let chars = Array.from(text);

  const scr = C.scramble ? Object.assign({}, SCRAMBLE_DEFAULTS, C.scramble === true ? {} : C.scramble) : null;

  /* An absolutely positioned layer inside a `position:static` host escapes to whatever
   * ancestor happens to be positioned, which puts a viewport-sized marquee somewhere nobody
   * asked for and looks like a bug in the effect. Promote the host, remember its exact inline
   * value, and put that value back in destroy() — §1 says the page must be indistinguishable
   * afterwards, and "" is a different inline value from "static". */
  const hostPositionWas = container.style.position;
  const promoted = getComputedStyle(container).position === 'static';
  if (promoted) container.style.position = 'relative';

  const layer = document.createElement('div');
  layer.setAttribute('data-sc', 'kinetic-marquee');
  /* §7. Also the reason contrast-check.mjs skips these glyphs entirely — see SKILL.md, this
   * is a real blind spot and it is not the checker's fault. A repeating string read aloud on
   * an infinite loop is hostile anyway; if the phrase is content, the page owes it a separate
   * visually-hidden element. */
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText =
    'position:absolute;inset:0;overflow:hidden;pointer-events:none;';

  const track = document.createElement('div');
  track.style.cssText =
    'position:absolute;left:0;top:0;display:flex;flex-wrap:nowrap;align-items:flex-start;'
    + 'white-space:nowrap;line-height:1;';
  track.style.fontWeight = String(C.weight);
  track.style.letterSpacing = C.tracking + 'em';
  track.style.textTransform = C.transform;
  track.style.color = C.color;
  if (C.font) track.style.fontFamily = C.font;
  layer.appendChild(track);

  let cellWidths = null;

  function makeUnit() {
    const u = document.createElement('span');
    // `pre` so leading and trailing spaces in the phrase survive — writing "10% OFF · " with
    // its own spacing is a perfectly good way to control the gap, and collapsing it silently
    // would make the gap config the only way and the phrase a lie.
    u.style.cssText = 'flex:0 0 auto;display:block;white-space:pre;';
    if (!scr) {
      u.textContent = text;
      return u;
    }
    /* Scramble needs per-character cells with LOCKED widths. Without the lock, substituting
     * a 'W' for an 'i' changes the unit width, which changes the loop period, which makes the
     * whole track breathe sideways for the length of the reveal. The cost is kerning and
     * ligatures: inline-block cells do not kern against each other. That trade is why
     * scramble is opt-in rather than always on. */
    for (const ch of chars) {
      const c = document.createElement('span');
      c.style.cssText = 'display:inline-block;text-align:center;';
      c.textContent = ch;
      u.appendChild(c);
    }
    if (cellWidths) applyCellWidths(u, cellWidths);
    return u;
  }

  function applyCellWidths(unit, widths) {
    const kids = unit.children;
    for (let i = 0; i < kids.length && i < widths.length; i++) kids[i].style.width = widths[i] + 'px';
  }

  /** Clear, reflow, read every cell's natural advance, write it back as a fixed width. */
  function lockCellWidths() {
    if (!scr || !track.firstElementChild) return;
    const first = track.firstElementChild;
    const cells = Array.prototype.slice.call(first.children);
    cells.forEach((c, i) => { c.style.width = ''; c.textContent = chars[i]; });
    // Read all widths before writing any of them: interleaving read and write here costs one
    // forced reflow per character.
    const widths = cells.map((c) => c.getBoundingClientRect().width);
    cells.forEach((c, i) => { c.style.width = widths[i] + 'px'; });
    cellWidths = widths;
    for (let k = 1; k < track.children.length; k++) applyCellWidths(track.children[k], widths);
  }

  function applyFontSize(fs) {
    fontSize = fs;
    track.style.fontSize = fs + 'px';
    // Advance widths do not scale perfectly linearly with size once hinting is involved, so
    // re-measure rather than scaling the cached widths.
    lockCellWidths();
  }

  function setUnitCount(n) {
    while (track.children.length > n) track.removeChild(track.lastChild);
    while (track.children.length < n) track.appendChild(makeUnit());
  }

  /**
   * The loop period, measured between two RENDERED copies rather than computed from
   * font-size + gap. The browser's own subpixel layout is the ground truth and nothing else
   * is: getBoundingClientRect is fractional where offsetWidth rounds to an integer, and a
   * 0.4px rounding error is a 0.4px jump at every wrap — small, periodic, and exactly the
   * kind of thing that reads as "cheap" without anyone being able to say why.
   */
  function measurePeriod() {
    if (track.children.length < 2) return 0;
    const a = track.children[0].getBoundingClientRect();
    const b = track.children[1].getBoundingClientRect();
    return b.left - a.left;
  }

  let destroyed = false;
  let raf = 0;
  let last = 0;
  let offset = 0;
  let period = 0;
  let fontSize = 0;
  let userPaused = false;
  let hoverPaused = false;
  let targetOpacity = opacityAt(C.fade, 0);
  let currentOpacity = targetOpacity;
  let scrambling = false;
  let scrT0 = 0;
  let scrRolled = 0;

  const rmq = window.matchMedia(RM_QUERY);

  function paint() {
    /* Direction is a rendering decision, not a state one: `offset` only ever grows and wraps,
     * so both directions share one modular clock and neither can drift out of phase with the
     * period. Right-drift starts the track one whole period to the left so the leading edge
     * always covers x=0. */
    const x = C.direction === 'right' ? offset - period : -offset;
    track.style.transform = 'translate3d(' + x.toFixed(3) + 'px,0,0)';
    layer.style.opacity = String(C.opacity * currentOpacity);
  }

  function layout() {
    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W <= 0 || H <= 0) return;

    let fs = Math.max(1, (C.size * H) / C.capRatio);
    if (fs !== fontSize) applyFontSize(fs);

    let gapPx = C.gap * fs;
    track.style.gap = gapPx + 'px';

    const was = period;
    period = measurePeriod();
    if (period <= 0) return;

    // The fit ceiling. One corrective pass: advance widths are close enough to linear in
    // font-size that a single rescale lands inside a percent, and this runs on resize only.
    if (C.fit > 0 && period > C.fit * W) {
      fs = Math.max(1, (fs * C.fit * W) / period);
      applyFontSize(fs);
      gapPx = C.gap * fs;
      track.style.gap = gapPx + 'px';
      period = measurePeriod();
      if (period <= 0) return;
    }

    /* Snap to a whole pixel. One correction pass is enough — flex resolves the gap to within
     * a LayoutUnit (1/64px) of what it is given, and the remaining error is two orders of
     * magnitude below the subpixel quantisation that caused the artifact in the first place.
     * A negative gap is not a thing, so a phrase whose natural period is already shorter than
     * its whole-pixel target keeps its fractional period rather than getting a broken layout. */
    if (C.snapPeriod && Math.abs(Math.round(period) - period) > 0.002) {
      const corrected = gapPx + (Math.round(period) - period);
      if (corrected >= 0) {
        track.style.gap = corrected + 'px';
        period = measurePeriod();
      }
    }
    if (period <= 0) return;

    // One period more than strictly needed. The exact requirement is ceil(W/period)+1; the
    // spare copy costs one span and covers the frame in which a resize has changed the width
    // but the next layout has not run yet.
    setUnitCount(Math.max(2, Math.ceil(W / period) + 2));

    // Remap rather than reset. A resize that changes font-size changes the period, and
    // carrying the raw offset across would snap the word sideways by up to a full period.
    if (was > 0 && period !== was) offset = (offset / was) * period;
    offset = ((offset % period) + period) % period;

    /* Vertical placement is on the CAP BAND, not the em box. Type this large is judged by
     * where the caps sit; centring the em box leaves the word looking high by the depth of
     * the descender, which at a 1/6-viewport cap is tens of pixels. */
    track.style.top = C.y * H - (C.baselineRatio - C.capRatio / 2) * fontSize + 'px';
    paint();
  }

  /** @param glyphs one entry per CELL, i.e. per code point — never per UTF-16 unit. */
  function applyGlyphs(glyphs) {
    for (let k = 0; k < track.children.length; k++) {
      const kids = track.children[k].children;
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].textContent !== glyphs[i]) kids[i].textContent = glyphs[i];
      }
    }
  }

  function stepScramble(now) {
    const elapsed = (now - scrT0) / 1000;
    const n = chars.length;
    const settledTo = Math.floor((elapsed - scr.hold) / scr.stagger);
    if (settledTo >= n - 1) { applyGlyphs(chars); scrambling = false; return; }
    if (now - scrRolled < 1000 / scr.rate) return;
    scrRolled = now;
    const out = [];
    for (let i = 0; i < n; i++) {
      const ch = chars[i];
      // Word boundaries survive the churn — clip 10's frame is 'PUDGY PE#GVJ⌐U', with the
      // space intact. Scrambling spaces turns two words into one illegible block and the
      // reveal stops reading as a word arriving.
      if (i <= settledTo || ch === ' ' || ch === ' ') out.push(ch);
      else out.push(scr.chars.charAt((Math.random() * scr.chars.length) | 0));
    }
    applyGlyphs(out);
  }

  function startScramble() {
    if (!scr) return;
    // Under the preference there is no reveal at all: the word is simply already there. A
    // "fast" scramble is still a scramble.
    if (rmq.matches) { applyGlyphs(chars); scrambling = false; return; }
    scrambling = true;
    scrT0 = performance.now();
    scrRolled = 0;
    stepScramble(scrT0);
  }

  /** Land everything on its final state without a loop — the reduced-motion / paused frame. */
  function settle() {
    if (scrambling) { applyGlyphs(chars); scrambling = false; }
    currentOpacity = targetOpacity;
    paint();
  }

  function running() {
    return !destroyed && !userPaused && !hoverPaused && !rmq.matches;
  }

  /**
   * will-change is a promise to the compositor, not a decoration, and a track that carries it
   * permanently holds its own GPU layer for the life of the page whether or not anything moves.
   * There is a measured cost beyond the memory. product-check re-rasters the page between the
   * three shots it takes to prove a reduced-motion page is static, and with the track pinned to
   * a compositor layer at DPR 3 that re-raster came back with 15 glyph-edge pixels differing by
   * 1/255 — nothing a visitor could see, but not the byte-identical still frame the contract
   * asks for either, and an instrument that is 15 pixels noisy is an instrument you start
   * ignoring. Promote only while something is actually moving.
   */
  function compositorLayer(on) {
    track.style.willChange = on ? 'transform' : 'auto';
  }

  function ensureLoop() {
    if (raf || !running()) return;
    last = 0;
    compositorLayer(true);
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    compositorLayer(false);
  }

  function frame(now) {
    if (destroyed) return;
    /* Re-read the preference here, every frame, rather than caching it at init. A shared
     * stage loop that calls its callbacks unconditionally will happily animate a page whose
     * visitor turned the setting on ten seconds ago; the only reliable place to answer that
     * question is inside the thing that is moving. Turning it back off is picked up by the
     * `change` listener below, because this bail-out clears `raf` and nothing would restart. */
    if (rmq.matches) { stopLoop(); settle(); return; }

    const dt = last ? Math.min((now - last) / 1000, C.maxDt) : 0;
    last = now;

    if (scrambling) stepScramble(now);

    /* Speed is in VIEWPORT widths per second, not container widths, and that is deliberate:
     * it is the unit the corpus measurement is in, and it means two marquees in differently
     * sized containers on the same page drift at the same visual rate instead of the narrow
     * one crawling. Resolution independence falls out of it for free. */
    offset += C.speed * (window.innerWidth || 1) * dt;
    if (period > 0) offset %= period;

    currentOpacity += (targetOpacity - currentOpacity) * (1 - Math.pow(1 - C.ease, dt * 60));
    paint();
    raf = requestAnimationFrame(frame);
  }

  setUnitCount(2);
  container.appendChild(layer);
  layout();
  startScramble();

  /* Fonts land after first paint and can change advance widths, which changes the period.
   * Re-measuring is cheap and a no-op when the face was already resident (a system stack, or
   * a second instance on the same page), so it never costs a visible reflow in the common
   * case — but skipping it leaves a webfont page looping on the fallback's period forever. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (destroyed) return;
      fontSize = 0;   // force the re-measure branch in layout()
      layout();
    }).catch(() => {});
  }

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { if (!destroyed) layout(); });
    ro.observe(container);
  }
  // A container that resizes with the viewport is covered by the observer; this is the
  // fallback for browsers without one, and it is harmless duplication where both exist.
  const onResize = () => { if (!destroyed) layout(); };
  if (!ro) window.addEventListener('resize', onResize, { passive: true });

  const onPrefChange = () => {
    if (destroyed) return;
    if (rmq.matches) { stopLoop(); settle(); } else ensureLoop();
  };
  if (rmq.addEventListener) rmq.addEventListener('change', onPrefChange);
  else if (rmq.addListener) rmq.addListener(onPrefChange);

  const onEnter = () => { hoverPaused = true; stopLoop(); settle(); };
  const onLeave = () => { hoverPaused = false; ensureLoop(); };
  if (C.pauseOnHover) {
    // Listeners go on the HOST, not the layer: the layer is pointer-events:none so that it
    // never eats a click meant for the content sitting on top of it.
    container.addEventListener('pointerenter', onEnter);
    container.addEventListener('pointerleave', onLeave);
  }

  if (rmq.matches) settle(); else ensureLoop();

  return {
    layer,
    supported: true,

    get paused() { return userPaused; },

    /** The eased opacity actually on screen this frame, not the value setProgress asked for. */
    get opacity() { return C.opacity * currentOpacity; },

    /** OPACITY only — never position. See the header for why the two clocks stay separate. */
    setProgress(p) {
      if (destroyed) return;
      targetOpacity = opacityAt(C.fade, clamp01(p));
      // With no loop running there is nothing to ease it, so apply on demand. This is the
      // path taken under reduced motion and while paused, and it is why both states still
      // answer the visitor's scrolling.
      if (!raf) { currentOpacity = targetOpacity; paint(); }
    },

    /** Swap the phrase. Re-runs the scramble reveal if one is configured. */
    setText(next) {
      if (destroyed) return;
      const s = String(next == null ? '' : next);
      if (!s.trim() || s === text) return;
      text = s;
      chars = Array.from(text);
      cellWidths = null;
      const n = track.children.length;
      setUnitCount(0);
      setUnitCount(Math.max(2, n));
      fontSize = 0;
      layout();
      startScramble();
      ensureLoop();
    },

    pause() { userPaused = true; stopLoop(); settle(); },
    play() { userPaused = false; ensureLoop(); },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', onResize);
      if (rmq.removeEventListener) rmq.removeEventListener('change', onPrefChange);
      else if (rmq.removeListener) rmq.removeListener(onPrefChange);
      if (C.pauseOnHover) {
        container.removeEventListener('pointerenter', onEnter);
        container.removeEventListener('pointerleave', onLeave);
      }
      if (promoted) container.style.position = hostPositionWas;
      layer.remove();
    },
  };
}

export default initKineticMarquee;
