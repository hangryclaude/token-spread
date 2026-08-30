/**
 * scroll-film — a numbered frame sequence, scrubbed by scroll, and nothing else.
 * ─────────────────────────────────────────────────────────────────────────
 * This is the dominant pattern in the corpus: 20 techniques across 10 of the 14 clips, and the
 * one the repo README singles out — 7 of 14 sites spine the entire page on one pre-rendered film
 * scrubbed by scroll. No physics, no simulation, no realtime 3D. The budget goes into the ASSET.
 *
 * What the clips actually establish, and what each line of it costs here:
 *
 *   clip 3  @1.2s  "Scroll-scrubbed pre-rendered CG hero sequence, fully bidirectional" —
 *                  verified pixel-for-pixel: frames at 5.2–8.2s reproduce 1.2–4.0s BACKWARDS.
 *                  Reverse is not a second animation, it is the same index descending. So the
 *                  engine has no notion of direction at all; there is only an index.
 *   clip 3  @0s    "Render is completely static at rest — zero idle motion". Frames 1-6 are
 *                  identical while the operator's hand visibly moves on the mouse.
 *   clip 13 @2.75s "Camera stops dead on input stop — no idle drift, no autoplay creep", and in
 *                  the same breath: between 2.75s and 3.5s the camera covers a huge distance
 *                  "without tearing or snapping — so the input is damped/lerped".
 *   clip 9  @1.9s  "Zero idle motion" — frame-difference energy flatlines at sensor-noise level
 *                  (1.7–2.2) for 20+ frame stretches between flicks.
 *   clip 9  @0s    the damping measured directly: attack ~0.35s, release ~0.6–0.8s, lerp ≈0.07–0.1.
 *   clip 3  @2.6s  "Headline copy swaps in step with scrub stages, cross-fading rather than
 *                  cutting" — three headlines, three render stages. Hence `stages`/`onStage`.
 *   clip 3  @4.4s  "Text layer parallaxes against the pinned image layer" — two speeds, not
 *                  three. That is the PAGE's job; this engine never moves anything but pixels
 *                  inside its own canvas.
 *
 * Those last two lines are the interesting tension. A damped chase and "dead still at rest" sound
 * contradictory, and resolving them is most of the design: the rAF loop exists only while the film
 * is catching up. When it lands on the target it paints the final frame, returns without
 * re-arming, and the page goes to zero CPU until the visitor scrolls again. There is no idle loop
 * to accidentally leave running, which is what "every pixel of motion is bought with a scroll
 * event" (clip 9) means in code rather than in prose.
 *
 * Canvas 2D, not WebGL, and no three.js. The whole operation is `drawImage` of a decoded bitmap
 * with a cover-fit — there is no shading, no geometry and nothing to composite, so a GL context
 * would buy a slower path and a compile step for the same pixels. Zero dependencies.
 *
 *   import { initScrollFilm } from './engine.js'
 *   const film = initScrollFilm(document.querySelector('[data-film]'), {
 *     count: 60,
 *     src: 'frames/film-####.jpg',
 *     stages: [{ at: 0, id: 'one' }, { at: 0.34, id: 'two' }],
 *     onStage: (stage) => swapCopy(stage.id),
 *   })
 *   await film.ready                                   // frame 0 is on screen
 *   film.setProgress(scrolled / scrollable)            // 0..1, both directions
 *   film.destroy()
 *
 * prefers-reduced-motion: the damped chase is autonomous motion — it keeps moving after the
 * visitor has stopped — so under the preference it is bypassed entirely and setProgress lands on
 * its frame instantly, with no rAF loop opened at all. The scrub itself continues, because a film
 * that advances as THEY scroll is answering them (CONTRACT §4). Re-read live, every frame and on
 * `change`, so toggling the OS setting takes effect without a reload.
 */

const RM_QUERY = '(prefers-reduced-motion: reduce)';

const DEFAULTS = {
  /** How many frames in the sequence. Required — there is no way to discover it from a URL. */
  count: 0,
  /**
   * Where the frames live. Either a function `(i) => url`, or a string with a run of `#`
   * standing in for the zero-padded index: `'frames/film-####.jpg'` → `frames/film-0007.jpg`.
   */
  src: null,
  /** 'cover' crops to fill the container; 'contain' letterboxes. A hero wants cover. */
  fit: 'cover',
  /** Anchor point used when `cover` has to crop, 0..1. 0.5/0.5 is centre. */
  align: 0.5,
  alignY: 0.5,
  /**
   * Chase coefficient per frame, 0..1. Clip 9 measured the reference at roughly 0.07–0.1; 0.14
   * settles a full 0→1 move in 38 rAF frames — ~0.63s at 60Hz, the low end of clip 9's measured
   * 0.57–0.83s release, and half the 76 frames 0.07 would need. The frame count is fixed by
   * arithmetic (see EPS); the wall time is whatever the display refreshes at. Set 0 to snap
   * with no loop at all.
   */
  chase: 0.14,
  /** DPR ceiling. Clamped BEFORE the canvas is sized — CONTRACT §5. */
  dprMax: 1.5,
  /** Simultaneous fetches. 60 frames at once opens 60 sockets and starves the first one. */
  concurrency: 6,
  /**
   * 'coarse' fetches every 32nd frame, then every 16th, and so on, so the WHOLE film is
   * scrubbable at low temporal resolution long before the last frame lands. 'linear' fetches
   * 0,1,2,… which makes the first 10% perfect and the other 90% missing — worse for a scrubber,
   * better if the visitor is guaranteed to start at the top and go slowly.
   */
  order: 'coarse',
  /** Optional CSS colour painted under each frame. Leave null to let the container show through. */
  background: null,
  /**
   * Ascending `{ at: 0..1, id }` marks. Crossing one fires onStage, in either direction.
   * Mark 0 is the state BELOW the first mark, not a mark that gets crossed — so give it
   * `at: 0` unless you actually want it reported before the film reaches it.
   */
  stages: [],
  /** (stage, index, previousIndex) — fires on the frame the crossing is painted, not before. */
  onStage: null,
  /** (loaded, total) — for a preloader. Fires once per frame that lands. */
  onLoad: null,
  /** (index, total) — fires when the frame INDEX changes, not on every repaint. */
  onFrame: null,
};

/** `'frames/f-####.jpg'` → `'frames/f-0007.jpg'`; a function is passed straight through. */
function resolveSrc(src, i) {
  if (typeof src === 'function') return src(i);
  return String(src).replace(/#+/, (run) => String(i).padStart(run.length, '0'));
}

/**
 * Load order for everything AFTER frame 0, which is fetched on its own first (see `preload`).
 * Coarse mode walks halving strides so the whole film is scrubbable at low temporal resolution
 * before the fine passes land.
 */
function loadOrder(n, mode) {
  const out = [];
  const seen = new Uint8Array(n);
  seen[0] = 1;   // already fetched, and re-queueing it would fetch it twice
  const push = (i) => { if (i >= 0 && i < n && !seen[i]) { seen[i] = 1; out.push(i); } };
  if (mode !== 'coarse') { for (let i = 1; i < n; i++) push(i); return out; }
  push(n - 1);
  for (let stride = 32; stride >= 1; stride >>= 1) for (let i = 0; i < n; i += stride) push(i);
  return out;
}

const inert = () => ({
  canvas: null, supported: false, ready: Promise.resolve(false),
  setProgress() {}, stats: () => ({ loaded: 0, total: 0, index: 0, progress: 0 }), destroy() {},
});

export function initScrollFilm(container, config = {}) {
  if (typeof window === 'undefined' || !container) return inert();
  const C = Object.assign({}, DEFAULTS, config);

  const n = Math.max(0, Math.floor(C.count));
  if (!n || !C.src) {
    console.warn('[scroll-film] needs { count, src } — nothing to scrub, leaving the container alone');
    return inert();
  }

  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-sc', 'scroll-film');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

  // alpha:true so the container's own CSS shows through until the first frame decodes. With
  // alpha:false the canvas is opaque black from the moment it exists, which turns one visual
  // change (backdrop → frame 0) into two, and the second one is a flash of black.
  const ctx = canvas.getContext('2d', { alpha: true });
  // No 2D context is a real state on a locked-down browser, not an error. The page keeps whatever
  // it already had and is simply flatter — CONTRACT §6.
  if (!ctx) return inert();

  container.appendChild(canvas);

  const stages = (C.stages || []).slice().sort((a, b) => a.at - b.at);
  const bitmaps = new Array(n).fill(null);
  const rmq = window.matchMedia(RM_QUERY);
  const abort = new AbortController();

  let destroyed = false;
  let raf = 0;
  let loaded = 0;
  let target = 0;       // where the page says the film should be
  let current = 0;      // where it actually is
  let lastIndex = -1;   // last index reported through onFrame
  let lastStage = -1;
  let lastDrawn = null; // the bitmap currently on the canvas
  let sizeDirty = true;

  let settle;
  const readyPromise = new Promise((r) => { settle = r; });
  const finishReady = (v) => { if (settle) { settle(v); settle = null; } };

  /* Land exactly on the target rather than asymptotically near it: an exponential chase never
   * arrives, and a scrubber that never arrives never stops its rAF, which is precisely the idle
   * loop clips 3, 9 and 13 all measured the reference NOT having. A quarter of a frame is under
   * the resolution of `indexFor`, so snapping there is invisible. */
  const EPS = 0.25 / Math.max(1, n - 1);

  const indexFor = (p) => Math.max(0, Math.min(n - 1, Math.round(p * (n - 1))));

  /**
   * The nearest frame that has actually decoded. This is the whole graceful-degradation story:
   * a sequence mid-download draws its closest neighbour rather than a hole, so the film is
   * scrubbable end-to-end from the moment the coarse pass finishes. Linear scan, but it only
   * runs when the exact frame is missing, and it stops at the first hit.
   */
  function nearest(i) {
    if (bitmaps[i]) return bitmaps[i];
    for (let d = 1; d < n; d++) {
      if (i - d >= 0 && bitmaps[i - d]) return bitmaps[i - d];
      if (i + d < n && bitmaps[i + d]) return bitmaps[i + d];
    }
    return null;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, C.dprMax);
    const w = Math.max(1, Math.round(container.clientWidth * dpr));
    const h = Math.max(1, Math.round(container.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return false;
    canvas.width = w;
    canvas.height = h;
    sizeDirty = true;
    return true;
  }

  function blit(bmp) {
    const cw = canvas.width, ch = canvas.height;
    if (C.background) { ctx.fillStyle = C.background; ctx.fillRect(0, 0, cw, ch); }
    else ctx.clearRect(0, 0, cw, ch);
    const iw = bmp.width || bmp.naturalWidth;
    const ih = bmp.height || bmp.naturalHeight;
    if (!iw || !ih) return;
    const s = C.fit === 'contain' ? Math.min(cw / iw, ch / ih) : Math.max(cw / iw, ch / ih);
    const w = iw * s, h = ih * s;
    ctx.drawImage(bmp, (cw - w) * C.align, (ch - h) * C.alignY, w, h);
  }

  /**
   * Paint is deliberately two independent decisions, and keeping them apart is what makes the
   * reduced-motion gate honest. The INDEX changing is what a HUD or a stage callback cares about.
   * The BITMAP changing is what the screen cares about. While a 60-frame sequence is still
   * downloading, indices 1..7 all resolve to frame 0 — the screen must not repaint for those, or
   * a page sitting at progress 0 under prefers-reduced-motion flickers its way through the load
   * and reads as animation to anything measuring pixels.
   */
  function paint() {
    const idx = indexFor(current);

    if (idx !== lastIndex) {
      lastIndex = idx;
      C.onFrame?.(idx, n);
    }

    if (stages.length) {
      let s = 0;
      // Driven by `current`, not `target`: clip 3 says the copy swaps "in step with scrub
      // stages". Firing off the target would put the headline ahead of the picture during the
      // chase, which is the one thing the reference never does.
      for (let k = 0; k < stages.length; k++) if (current >= stages[k].at) s = k;
      if (s !== lastStage) {
        const prev = lastStage;
        lastStage = s;
        C.onStage?.(stages[s], s, prev);
      }
    }

    const bmp = nearest(idx);
    if (!bmp) return;
    if (bmp === lastDrawn && !sizeDirty) return;
    lastDrawn = bmp;
    sizeDirty = false;
    blit(bmp);
    finishReady(true);
  }

  function frame() {
    if (destroyed) { raf = 0; return; }
    // Re-read the preference here rather than caching it at init: a visitor who turns the
    // preference ON mid-chase gets the film landing on its frame immediately, no reload.
    if (rmq.matches) { raf = 0; current = target; paint(); return; }
    const d = target - current;
    if (Math.abs(d) < EPS) { raf = 0; current = target; paint(); return; }
    current += d * C.chase;
    // `raf` deliberately still holds the handle that has already fired. paint() reaches the host's
    // onFrame/onStage, and a setProgress() from inside one of those must find the flag SET — clear
    // it first and the callback opens a second loop that damps the same `current` all over again.
    paint();
    raf = requestAnimationFrame(frame);
  }

  // One loop, never two. `raf` is both the handle and the "is a loop already running" flag.
  const kick = () => { if (!raf && !destroyed) raf = requestAnimationFrame(frame); };

  /* ---- decode ------------------------------------------------------------ *
   * createImageBitmap does the decode off the main thread, which is the difference between a
   * scrub that stutters as frames land and one that does not. Safari only got it for blobs in
   * 15, so there is a plain <img> fallback — both produce something drawImage accepts, and the
   * rest of the engine never learns which it got.
   * ----------------------------------------------------------------------- */
  async function decode(url) {
    if (typeof createImageBitmap === 'function') {
      const res = await fetch(url, { signal: abort.signal, cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return createImageBitmap(await res.blob());
    }
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  }

  let warnedLoad = false;

  async function fetchFrame(i) {
    try {
      const bmp = await decode(resolveSrc(C.src, i));
      if (destroyed) { bmp.close?.(); return false; }
      bitmaps[i] = bmp;
      loaded++;
      C.onLoad?.(loaded, n);
      // A newly arrived frame may be a better match for where the film already is. Repaint only
      // if it actually beats what is on screen — nearest() answers that for free.
      if (nearest(indexFor(current)) === bmp) paint();
      return true;
    } catch (e) {
      if (destroyed || e.name === 'AbortError') return false;
      // One warning for the whole sequence. A 200-frame CDN outage should not write 200 lines,
      // and a missing frame is survivable by construction — nearest() covers it.
      if (!warnedLoad) { warnedLoad = true; console.warn('[scroll-film] frame failed to load:', e.message); }
      return false;
    }
  }

  async function preload() {
    /* Frame 0 alone, and finished, before anything else is even requested.
     *
     * The first version put frame 0 at the head of one shared queue and started six workers on
     * it. Six requests go out together, and whichever DECODES first wins the canvas — measured
     * on this demo, a page sitting at progress 0 blitted FOUR times during load, because
     * nearest(0) resolved to frame 32, then to a nearer one, and only finally to frame 0. On a
     * fast localhost that is a flicker; on a real connection it is the last frame of the film
     * showing as the poster. Serialising exactly one frame costs one round trip and removes the
     * whole class of problem: a page that is not scrolled repaints once, ever. */
    await fetchFrame(0);

    const queue = loadOrder(n, C.order);
    let cursor = 0;
    const worker = async () => {
      while (!destroyed && cursor < queue.length) await fetchFrame(queue[cursor++]);
    };

    await Promise.all(Array.from({ length: Math.max(1, C.concurrency) }, worker));
    // Nothing decoded at all: resolve ready(false) so a caller awaiting it is not hung forever.
    if (!loaded) finishReady(false);
  }

  resize();
  preload();

  const ro = new ResizeObserver(() => {
    if (destroyed) return;
    if (resize()) paint();
  });
  ro.observe(container);

  const onPrefChange = () => {
    if (destroyed) return;
    if (rmq.matches) { current = target; paint(); }
    else if (current !== target) kick();
  };
  rmq.addEventListener?.('change', onPrefChange);

  return {
    canvas,
    supported: true,
    /** Resolves true once a frame is on screen, false if the whole sequence failed to load. */
    ready: readyPromise,
    /**
     * Drive the film. 0..1, clamped. Fully bidirectional because there is nothing directional
     * to be: a smaller number is a smaller index.
     */
    setProgress(p) {
      if (destroyed) return;
      target = Math.max(0, Math.min(1, Number(p) || 0));
      // No chase under reduced motion, and none when chase is 0 — land now and open no loop.
      if (rmq.matches || !C.chase) { current = target; paint(); return; }
      kick();
    },
    /** For a preloader, a frame counter, or a test that wants to know what is on screen. */
    stats: () => ({ loaded, total: n, index: indexFor(current), progress: current }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      abort.abort();
      ro.disconnect();
      rmq.removeEventListener?.('change', onPrefChange);
      // ImageBitmaps hold GPU-side memory that GC will not reclaim promptly. A page that mounts
      // and destroys a few 200-frame sequences without this holds on to hundreds of megabytes.
      for (let i = 0; i < n; i++) { bitmaps[i]?.close?.(); bitmaps[i] = null; }
      lastDrawn = null;
      finishReady(false);
      canvas.remove();
    },
  };
}

export default initScrollFilm;
