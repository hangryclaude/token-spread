/**
 * sticky-split — a pinned media half against a scrolling copy half, at a split that is not a half.
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the workhorse mid-page section, and it is the strongest cross-clip evidence in the
 * corpus: three different sites, three independent readers, one mechanism under three names.
 *
 *   clip 9  @3.33s  VERIFIED  "Sticky media column + scrolling copy column, split ~54/46"
 *     "a hard vertical split at roughly 54% of viewport width — deliberately NOT 50/50. Left:
 *     flat dark oxblood panel carrying successive copy blocks that scroll normally. Right: a
 *     pinned full-bleed video … running continuously through the whole section. Full-height,
 *     edge-to-edge, no padding, no radius, no shadow — the media panel touches the right edge of
 *     the viewport and both the top and bottom of the section."
 *   clip 9  @3.0s   VERIFIED  "Staggered section entry — media panel leads the copy panel"
 *     "the hot-pink media panel appears from the bottom BEFORE the maroon copy panel does … the
 *     two halves arrive offset by roughly 40-60px of scroll. Tiny, almost subliminal, and it is
 *     the difference between a section that 'arrives' and a section that just 'is next'."
 *   clip 3  @4.4s   VERIFIED  "Text layer parallaxes against the pinned image layer"
 *     "the hero's left text column and input pill have travelled up to the top of the viewport
 *     while the sphere is still dead-centre. Copy scrolls at roughly normal speed; the render is
 *     fully pinned. Two speeds, not three — restrained."   (clip 3's `two-speed-pin`)
 *   clip 7  @5.3→6.3→9.7s  VERIFIED  "Pinned media well that scales from inset card to full-bleed
 *     and back"  — "a modest rounded card sitting low-right … by 6.3s it has grown to occupy the
 *     right ~45%, bleeding off the top and right edges … by 9.7s it has shrunk back to an inset
 *     card top-right. The panel stays anchored to the right rail throughout while its width/height
 *     are scrubbed by scroll, and the film inside keeps running through the size change — so the
 *     container animates independently of its content."   (clip 7's `media-well`)
 *
 * clip 3's two-speed-pin and clip 7's media-well are the same mechanism. Merging them is the whole
 * design: clip 9 gives the geometry (a non-round split, full bleed, the lead), clip 3 gives the
 * rate discipline (two speeds, never three), clip 7 gives the well (non-monotonic frame geometry
 * over a fixed anchor). Nothing else on the shelf is this — act-breaks is empty space BETWEEN
 * acts, card-grammar is cards, scroll-film pins a canvas over the FULL viewport. scroll-film
 * composes INSIDE the well returned here rather than beside it.
 *
 * THIS ENGINE RENDERS NO MEDIA. It adopts whatever the media slot already holds — an <img>, a
 * <video>, another effect's <canvas> — and gives it a frame with a scroll-scrubbed geometry.
 * Given an empty slot it paints one flat colour and still returns a working handle (§6).
 *
 *   import { initStickySplit } from './engine.js'
 *   const split = initStickySplit(document.querySelector('[data-split]'), {
 *     split: 0.54, side: 'right', leadPx: 50,
 *     well: [
 *       { at: 0.00, inset: [8, 8, 8, 8],   radius: 12 },
 *       { at: 0.45, inset: [-4, -4, 0, 0], radius: 0 },
 *       { at: 1.00, inset: [8, 8, 8, 8],   radius: 12 },
 *     ],
 *   })
 *   split.setProgress(p)     // pass it UNCLAMPED — see below
 *   split.destroy()
 *
 * PROGRESS IS UNCLAMPED ON PURPOSE, and it is the one thing a caller has to get right. The well
 * scrub is a 0..1 quantity and clamps. The LEAD is not: the media half arrives ahead of the copy
 * half during the section's ENTRANCE, which is scroll that happens *before* the pin begins, i.e.
 * at negative progress under the standard mapping
 *
 *     p = -section.getBoundingClientRect().top / (section.offsetHeight - paneHeight)
 *
 * Feed that number raw. Feed a value pre-clamped to 0..1 and the lead is silently absent — which
 * is why this file counts calls and says so once rather than letting the most distinctive detail
 * in the reference vanish without a word.
 *
 * ONE CLOCK (§3): this file never listens for `scroll`, and it opens no rAF loop at all. There is
 * nothing to ease — clip 9's site is "every pixel of motion is bought with a scroll event" and
 * clip 3's is "two speeds, not three, restrained" — so setProgress writes its handful of style
 * properties synchronously. Setting a style property does not force a recalc; the browser
 * coalesces the whole batch once, before paint. A rAF here would buy a frame of lag and a
 * permanent idle tick for nothing. Layout is read only on resize, never inside setProgress.
 *
 * prefers-reduced-motion (§4), and the distinction is the point rather than a formality:
 *   · The copy travelling against the held media is a DIRECT RESPONSE to the visitor's own
 *     scroll. It continues. So does the well scrub, and so does the 40-60px lead, which is also
 *     nothing but scroll expressed as a differential.
 *   · Anything AUTONOMOUS inside the well stops. An adopted <video> is paused and holds a real
 *     frame of itself — not a poster swap, not a blank box, not a substitute still.
 * Read live: re-checked inside setProgress (so every frame the page moves) and subscribed to
 * `change` (so a page sitting still still answers within one event). Never cached at init.
 *
 * CONTRACT §5 has nothing to bite on: there is no backing store here and no allocation to cap.
 * Stated rather than silently skipped. Zero dependencies, one file, no build step.
 */

const RM_QUERY = '(prefers-reduced-motion: reduce)';

/** Per-instance scope id for the injected stylesheet. Two splits on one page must not collide. */
let INSTANCES = 0;

const DEFAULTS = {
  /**
   * The two halves, as selectors resolved against the section. Both must be DIRECT children —
   * the section becomes the grid container, and a grid only lays out its own children. A nested
   * match is a findable warning rather than a layout that mysteriously does nothing.
   */
  copy: '[data-split-copy]',
  media: '[data-split-media]',

  /**
   * Fraction of the section's width taken by the COPY half. Clip 9 measures "a hard vertical
   * split at roughly 54% of viewport width — deliberately NOT 50/50", with the copy on the wide
   * side. The corpus's own line about the whole site is "nothing on the page is a round
   * fraction"; a 50/50 split is the single loudest tell that a two-column framework default was
   * accepted rather than a proportion chosen, so 0.5 earns a warning and is then honoured —
   * silently overriding an explicit config is worse than a bad split.
   */
  split: 0.54,

  /** Which edge the media half pins to. 'right' matches clip 9 and clip 7's right rail. */
  side: 'right',

  /**
   * Clip 9 @3.0s, measured: "the two halves arrive offset by roughly 40-60px of scroll." The
   * media half is translated up by this much as the section's leading edge crosses the bottom of
   * the viewport, and converges to zero exactly as the pin begins.
   *
   * This is NOT a third parallax rate. Clip 3's constraint is "two speeds, not three — restrained",
   * and a sustained third rate is the 2013 tell. What this is is a bounded, transient differential:
   * 50px total, spent entirely inside the entrance, gone before anything is pinned. Set 0 to
   * remove it and lose the thing that makes the section arrive.
   */
  leadPx: 50,

  /**
   * Clip 7's non-monotonic frame geometry. Ascending stops of
   *   { at: 0..1, inset: [top, right, bottom, left] in px, radius: px }
   * `null` is clip 9's behaviour and the default: a constant full-bleed pane with no scrub at all.
   *
   * NEGATIVE insets are the technique, not a mistake — clip 7's middle state "bleeds off the top
   * and right edges", which means the well is larger than its pane and the surplus is clipped by
   * the viewport. And the curve must come BACK: a well that grows to full-bleed and stays there
   * is monotonic, and monotonic reads as presented. Growing and then releasing reads as handled.
   */
  well: null,

  /**
   * What the adopted media does while the well's box changes under it.
   *   'cover'  the media is the well, re-cropped as the box moves. The usual choice.
   *   'lock'   the media stays sized to the whole PANE and the well becomes a moving window over
   *            it, so the picture does not slide when the frame does. This is the more literal
   *            reading of clip 7's "the container animates independently of its content", and it
   *            is the better one when the media is a render whose framing was composed.
   * Either way the temporal independence is the same: a <video> playhead is never touched by a
   * geometry change, which is the part of clip 7 that actually matters.
   */
  wellFit: 'cover',

  /** Sticky offset from the top of the viewport, px. Give a page with a fixed header its height. */
  top: 0,

  /**
   * AUTHORED, NOT OBSERVED — CONTRACT §8. Clip 9 was filmed as a phone recording of an iMac.
   * There is ZERO mobile evidence in it, in clip 3, or in clip 7. Below this width the split
   * rotates 90°: the media becomes a sticky band across the top of the section and the copy runs
   * beneath it, keeping the mechanism (pinned media, scrolling copy) and keeping the proportion
   * un-round. That is a decision made here, and the corpus neither supports nor contradicts it.
   * 720 is the width at which a 46% media column drops under ~330px and stops being full-bleed
   * media in any meaningful sense.
   */
  stackBelow: 720,

  /** Height of the stacked media band as a fraction of the viewport. The 54/46 split, rotated. */
  stackMedia: 0.46,

  /**
   * Start playback of adopted <video> elements when the motion preference is off. The engine will
   * never mute or unmute anything — an unmuted video will simply be refused by the browser and
   * you get one warning. Set false to own playback yourself; the reduced-motion PAUSE still
   * happens either way, because that is a contract obligation rather than a convenience.
   */
  autoplayMedia: true,

  /**
   * §6. An empty media slot still has to produce a section, so it gets one flat colour panel and
   * a working handle. Deliberately a flat fill and not a gradient or a placeholder graphic: the
   * page should look unfinished, because it is, and it should not look broken.
   */
  panel: '#241017',
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);
const px = (v) => (Math.round(v * 100) / 100) + 'px';

/** Read the well curve at a progress value by walking the sorted stop list. */
function wellAt(stops, p) {
  const flat = { inset: [0, 0, 0, 0], radius: 0 };
  if (!stops || !stops.length) return flat;
  const norm = (s) => ({
    inset: Array.isArray(s.inset) ? [+s.inset[0] || 0, +s.inset[1] || 0, +s.inset[2] || 0, +s.inset[3] || 0] : [0, 0, 0, 0],
    radius: +s.radius || 0,
  });
  if (p <= stops[0].at) return norm(stops[0]);
  if (p >= stops[stops.length - 1].at) return norm(stops[stops.length - 1]);
  for (let i = 0; i < stops.length - 1; i++) {
    if (p >= stops[i].at && p <= stops[i + 1].at) {
      const span = stops[i + 1].at - stops[i].at;
      // Two stops sharing an `at` is a legal way to ask for a hard cut, so a zero span is a
      // supported input. Dividing by it would write NaN into a style property, which the browser
      // drops silently — the box would simply stop moving with nothing in the console.
      const t = span <= 0 ? 1 : smooth((p - stops[i].at) / span);
      const a = norm(stops[i]);
      const b = norm(stops[i + 1]);
      return {
        inset: a.inset.map((v, k) => v + (b.inset[k] - v) * t),
        radius: a.radius + (b.radius - a.radius) * t,
      };
    }
  }
  return norm(stops[0]);
}

const inert = (reason) => {
  if (reason) console.warn('[sticky-split] ' + reason);
  return {
    section: null, pane: null, well: null, supported: false,
    get lead() { return 0; },
    get stacked() { return false; },
    setProgress() {},
    // Same keys as a live handle's stats(), so a caller can read one without branching on
    // `supported` first. An inert handle adopted nothing, so the two counts are honestly 0.
    stats() { return { progress: 0, lead: 0, inset: [0, 0, 0, 0], radius: 0, paneH: 0, pinPx: 0, stacked: false, reduced: false, adopted: 0, videos: 0 }; },
    destroy() {},
  };
};

export function initStickySplit(section, config = {}) {
  if (typeof window === 'undefined' || !section || !section.nodeType) {
    return inert('no section element — nothing to split');
  }

  const C = Object.assign({}, DEFAULTS, config);

  const copyEl = section.querySelector(C.copy);
  const pane = section.querySelector(C.media);
  if (!copyEl || !pane) {
    return inert(`section is missing ${!copyEl ? C.copy : C.media} — a split needs both halves`);
  }
  if (copyEl.parentElement !== section || pane.parentElement !== section) {
    return inert('both halves must be DIRECT children of the section — the section becomes the '
      + 'grid container and a grid only lays out its own children');
  }

  let split = Number(C.split);
  if (!(split > 0)) split = DEFAULTS.split;
  split = Math.max(0.2, Math.min(0.8, split));
  if (Math.abs(split - 0.5) < 0.015) {
    console.warn('[sticky-split] split is ' + split + ' — clip 9 measures ~0.54 and the corpus line '
      + 'is "nothing on the page is a round fraction". A 50/50 split reads as a two-column '
      + 'framework default. Honouring it anyway.');
  }
  const side = C.side === 'left' ? 'left' : 'right';
  if (C.side !== 'left' && C.side !== 'right') {
    console.warn('[sticky-split] side "' + C.side + '" is not left|right — using right');
  }

  const uid = 'ss' + (++INSTANCES);
  const topPx = Math.max(0, Number(C.top) || 0);

  /* ── the injected DOM (§7) ───────────────────────────────────────────────────────────────── */

  section.setAttribute('data-sc-ss', uid);
  copyEl.setAttribute('data-sc-ss-copy', '');
  pane.setAttribute('data-sc-ss-media', '');

  const lock = C.wellFit === 'lock';
  const well = document.createElement('div');
  well.setAttribute('data-sc', 'sticky-split');
  /* `--lock` carries no rules; the locked geometry is inline because it depends on a measurement.
   * It is here so the mode is legible in devtools — which is where the `lock` bug was eventually
   * cornered, and the reason it took two wrong answers was that nothing in the DOM said which
   * mode was in force. */
  well.className = lock ? 'sc-ss-well sc-ss-well--lock' : 'sc-ss-well';
  /* DELIBERATE DEPARTURE FROM §7. Injected nodes are supposed to carry aria-hidden="true", and
   * this one does not: it WRAPS host content. An adopted <img alt="…"> inside an aria-hidden
   * ancestor is removed from the accessibility tree entirely, so obeying the letter of §7 here
   * would delete the page's own alt text. The flat fallback panel below IS aria-hidden, because
   * that one really is decoration this file invented. */

  /* ADOPTION. Element children of the slot move into the well and are put back, in order, by
   * destroy(). Text nodes are left where they are: the only text a media slot legitimately holds
   * is the whitespace between tags, and moving a stray caption into a clipped frame would be a
   * surprise the page never asked for. */
  const adopted = Array.prototype.slice.call(pane.children);
  // 'lock' writes six geometry properties onto these; the host may already have authored its own
  // there, and clearing them would lose it. Recorded whole and restored by destroy().
  const styleWas = adopted.map((el) => el.getAttribute('style'));
  let fallback = null;
  if (!adopted.length) {
    fallback = document.createElement('div');
    fallback.setAttribute('data-sc', 'sticky-split');
    fallback.setAttribute('aria-hidden', 'true');
    fallback.className = 'sc-ss-fallback';
    fallback.style.background = C.panel;
    well.appendChild(fallback);
  }
  for (const el of adopted) well.appendChild(el);
  pane.appendChild(well);

  const style = document.createElement('style');
  style.setAttribute('data-sc', 'sticky-split');
  const S = `[data-sc-ss="${uid}"]`;
  const paneCss = `${S} > [data-sc-ss-media]`;
  style.textContent = `
${S}{
  display:grid;
  grid-template-columns:${(split * 100).toFixed(4)}% ${((1 - split) * 100).toFixed(4)}%;
  /* The bleed is allowed off the VIEWPORT and never into a scrollbar. overflow-x:clip rather than
     hidden on purpose: hidden would make this element a scroll container, which re-parents the
     sticky pane's scrollport and breaks the pin. clip does not, and it leaves overflow-y visible —
     which the lead needs, because a media half that arrives early is briefly ABOVE the section. */
  overflow-x:clip;
}
${S} > [data-sc-ss-copy]{ grid-column:${side === 'right' ? 1 : 2}; grid-row:1; min-width:0; }
${paneCss}{
  grid-column:${side === 'right' ? 2 : 1}; grid-row:1;
  /* CONTRACT of the technique, clip 9: no padding, no radius, no shadow, no max-width. The pane
     touches the viewport edge and both edges of the section, or it reads as a card — and "not a
     card" is the entire point. */
  position:sticky; top:${topPx}px; height:calc(100svh - ${topPx}px);
  align-self:start;            /* without this the item stretches to the row and has nowhere to stick */
  min-width:0; z-index:1;
  padding:0; border:0; border-radius:0; box-shadow:none;
}
${paneCss} > .sc-ss-well{ position:absolute; overflow:hidden; top:0; right:0; bottom:0; left:0; }
${paneCss} > .sc-ss-well > *{
  position:absolute; inset:0; display:block;
  width:100%; height:100%; max-width:none; margin:0;
  object-fit:cover; object-position:center;
}
${paneCss} > .sc-ss-well > .sc-ss-fallback{ width:auto; height:auto; }

/* AUTHORED, not observed — see DEFAULTS.stackBelow. The split rotates: a sticky media band across
   the top, copy running beneath it and passing under the band's lower edge. */
@media (max-width:${Math.max(0, Number(C.stackBelow) || 0)}px){
  ${S}{
    grid-template-columns:100%;
    grid-template-rows:${(clamp01(Number(C.stackMedia) || 0.46) * 100).toFixed(4)}svh auto;
  }
  ${S} > [data-sc-ss-copy]{ grid-column:1; grid-row:2; }
  ${paneCss}{
    grid-column:1; grid-row:1 / 3;
    height:calc(${(clamp01(Number(C.stackMedia) || 0.46) * 100).toFixed(4)}svh - ${topPx}px);
  }
}`;
  document.head.appendChild(style);

  /* ── media policy ───────────────────────────────────────────────────────────────────────── */

  const videos = adopted.filter((el) => el.tagName === 'VIDEO');
  const preloadWas = videos.map((v) => v.getAttribute('preload'));
  // A paused <video> can only "hold a real frame of itself" if a frame has been decoded, and
  // preload="none" guarantees none has. Recorded and restored by destroy().
  for (const v of videos) if (v.preload === 'none') v.preload = 'auto';

  let warnedPlay = false;
  const wasPlaying = new WeakMap();

  const rmq = window.matchMedia(RM_QUERY);
  let lastReduced = rmq.matches;
  let destroyed = false;

  function applyMediaPolicy() {
    const reduce = rmq.matches;
    for (const v of videos) {
      if (reduce) {
        if (!v.paused) { wasPlaying.set(v, true); v.pause(); }
      } else if (C.autoplayMedia || wasPlaying.get(v)) {
        wasPlaying.delete(v);
        const r = v.play();
        if (r && r.catch) {
          r.catch(() => {
            if (warnedPlay) return;
            warnedPlay = true;
            console.warn('[sticky-split] the browser refused to start a <video>. It is almost '
              + 'always the missing `muted` attribute; this engine will not change your audio '
              + 'state for you. Set autoplayMedia:false if the page owns playback.');
          });
        }
      }
    }
  }
  /* The belt to the braces. If the page authored <video autoplay>, the element may start itself
   * after we have already paused it — including on a bfcache restore. Under the preference,
   * anything that starts playing gets stopped again, once, at the source. */
  const onPlay = (e) => { if (!destroyed && rmq.matches) e.target.pause(); };
  for (const v of videos) v.addEventListener('play', onPlay);

  /* ── measurement (resize only — never inside setProgress) ────────────────────────────────── */

  let paneW = 0;
  let paneH = 0;
  let pinPx = 0;

  function measure() {
    if (destroyed) return;
    const r = pane.getBoundingClientRect();
    paneW = r.width;
    paneH = r.height;
    // The pin distance under the standard mapping. Exposed on stats() so the page can drive
    // progress off the engine's own number instead of guessing at svh vs innerHeight.
    pinPx = section.offsetHeight - paneH;
    /* 'lock' needs the media to be exactly the PANE's box while the well moves over it, and the
     * only way to say that to CSS is an explicit width and height.
     *
     * Two wrong answers were shipped and measured before this one. Negating the well's four insets
     * looks right and is not: an absolutely positioned box with left, width and right all non-auto
     * is over-constrained, so the right and bottom offsets are IGNORED and the media comes out the
     * size of the WELL translated by the negation — which on a 1440 desktop still overlapped the
     * frame enough to look correct and on a 390 phone landed entirely outside it. Section B's card
     * rendered EMPTY on mobile and all three gates passed anyway; only opening the screenshot
     * caught it. Setting width:auto instead is the second wrong answer: for a REPLACED element
     * (<img>, <video>) auto resolves to the INTRINSIC size, so the media became 760x1080 regardless
     * of the pane. Explicit pixels, re-measured on resize only, is the one that is actually true.
     */
    if (lock) for (const el of adopted) { el.style.width = px(paneW); el.style.height = px(paneH); }
    write();
  }

  /* ── the two written quantities ──────────────────────────────────────────────────────────── */

  let progress = 0;
  let lead = 0;
  let geom = wellAt(C.well, 0);
  let promoted = false;
  let calls = 0;
  let sawEntry = false;
  let warnedLead = false;

  function leadFor(p) {
    const leadPx = Number(C.leadPx) || 0;
    if (!leadPx || !(pinPx > 0) || !(paneH > 0)) return 0;
    // How far the section's top edge sits below the viewport top, in px. Positive means the
    // section has not been reached yet; the entrance is the last paneH of that.
    const below = -p * pinPx;
    return leadPx * smooth(clamp01(below / paneH));
  }

  function write() {
    if (destroyed) return;

    lead = leadFor(progress);
    if (lead !== 0 && !promoted) { pane.style.willChange = 'transform'; promoted = true; }
    pane.style.transform = lead ? 'translate3d(0,' + px(-lead) + ',0)' : '';
    /* Promotion is released the moment it stops earning its keep. kinetic-marquee measured the
     * cost of leaving it on: a permanently composited layer re-rastered ~15 glyph-edge pixels
     * differently between two captures of a page that was not moving, which is noise in an
     * instrument that is supposed to prove stillness. */
    if (lead === 0 && promoted) { pane.style.willChange = ''; promoted = false; }

    geom = wellAt(C.well, clamp01(progress));
    const [t, r, b, l] = geom.inset;
    well.style.top = px(t);
    well.style.right = px(r);
    well.style.bottom = px(b);
    well.style.left = px(l);
    well.style.borderRadius = geom.radius ? px(geom.radius) : '';

    /* 'lock': the media keeps the PANE's box while the well's box moves over it, so the well reads
     * as a window rather than as a container. Only the OFFSET moves per frame — the size was
     * settled in measure() and does not change until the pane does. */
    if (lock) for (const el of adopted) { el.style.top = px(-t); el.style.left = px(-l); }
  }

  measure();
  applyMediaPolicy();

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measure());
    ro.observe(section);
    ro.observe(pane);
  }
  // The observer covers a section that changes size; this covers a viewport that changes without
  // it — a rotated phone, a retracting URL bar — and is harmless duplication where both fire.
  const onResize = () => measure();
  window.addEventListener('resize', onResize, { passive: true });

  const onPrefChange = () => { if (!destroyed) { applyMediaPolicy(); write(); } };
  if (rmq.addEventListener) rmq.addEventListener('change', onPrefChange);
  else if (rmq.addListener) rmq.addListener(onPrefChange);

  return {
    section, pane, well, copy: copyEl, supported: true,

    /** The px the media half is currently ahead of the copy half. 0 once anything is pinned. */
    get lead() { return lead; },
    get stacked() { return window.matchMedia(`(max-width:${C.stackBelow}px)`).matches; },

    /**
     * 0..1 across the pin, and DELIBERATELY UNCLAMPED at the input: negative values are the
     * section's entrance and are what the lead is made of. The well scrub clamps internally.
     */
    setProgress(p) {
      if (destroyed) return;
      const v = Number(p);
      if (!Number.isFinite(v)) return;
      progress = v;
      if (v < 0) sawEntry = true;
      if (++calls === 24 && !sawEntry && !warnedLead && (Number(C.leadPx) || 0) > 0) {
        warnedLead = true;
        console.warn('[sticky-split] leadPx is set but setProgress has only ever been called with '
          + 'values >= 0. The 40-60px lead lives in the section\'s ENTRANCE, which is negative '
          + 'progress under the standard mapping — a clamped 0..1 feed cannot produce it, and the '
          + 'section will simply arrive as one block. Pass the raw value.');
      }
      /* The preference is re-read here, on every call, rather than cached at init. A page that is
       * moving asks the question every frame; a page that is still is answered by the `change`
       * listener. Between them there is no window in which a stale answer is used. */
      if (rmq.matches !== lastReduced) { lastReduced = rmq.matches; applyMediaPolicy(); }
      write();
    },

    stats() {
      return {
        progress, lead,
        inset: geom.inset.slice(),
        radius: geom.radius,
        paneH, pinPx,
        stacked: window.matchMedia(`(max-width:${C.stackBelow}px)`).matches,
        reduced: rmq.matches,
        adopted: adopted.length,
        videos: videos.length,
      };
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onResize);
      if (rmq.removeEventListener) rmq.removeEventListener('change', onPrefChange);
      else if (rmq.removeListener) rmq.removeListener(onPrefChange);
      for (const v of videos) v.removeEventListener('play', onPlay);
      videos.forEach((v, i) => {
        if (preloadWas[i] === null) v.removeAttribute('preload');
        else v.setAttribute('preload', preloadWas[i]);
      });
      /* Put the adopted children back where they were found, in order, with the inline style
         restored to exactly what the host authored — an element that arrived with no style
         attribute leaves with none. A <video> we paused stays paused: resuming it on the way
         out would be this engine's last act being a reduced-motion violation. */
      adopted.forEach((el, i) => {
        /* setAttribute first even when the answer is "no attribute at all": Blink writes el.style.*
           back to the attribute lazily, and a bare removeAttribute() gets overtaken by that pending
           write and leaves style="" behind. Assigning materialises it, then the remove sticks. */
        el.setAttribute('style', styleWas[i] === null ? '' : styleWas[i]);
        if (styleWas[i] === null) el.removeAttribute('style');
        pane.appendChild(el);
      });
      well.remove();
      style.remove();
      pane.style.transform = '';
      pane.style.willChange = '';
      section.removeAttribute('data-sc-ss');
      copyEl.removeAttribute('data-sc-ss-copy');
      pane.removeAttribute('data-sc-ss-media');
    },
  };
}

export default initStickySplit;
