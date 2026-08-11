/**
 * act-breaks — pacing as a system: empty viewports, scrubbed entrances, dissolving grounds.
 * ─────────────────────────────────────────────────────────────────────────────
 * Pacing is the widest-spread idea in the corpus — ten techniques across seven of the fourteen
 * clips — and it is also the cheapest thing in it. Nothing in this file needs a shader, a render
 * farm, a scroll library or a build step. It is three mechanisms and about 300 lines.
 *
 * The evidence, verbatim from corpus/clips-deep.json:
 *
 *   clip 6 (ZOI ICE TEA) @5.5s — "Empty 'breath' viewport between every act". At three separate
 *     points the entire viewport contains NOTHING but the background and the cursor. "Each gap is
 *     roughly a full viewport tall and lasts ~1s at the scroll speed being used. The next
 *     section's headline then fades in from ~0 opacity at the lower third and rises ~8% of
 *     viewport height into place."
 *   clip 7 (@wearebrand.io, YOS) @4s — "Full-viewport empty 'breath' section with no copy and no
 *     motion ... a deliberate hard stop in a site that is otherwise dense with movement — and it
 *     is what makes the next section land."
 *   clip 8 (@wearebrand.io, Loft Thirty One) @9.75s — "Copy clears completely between sections —
 *     emptiness as the transition. There is no crossfade, no two headlines overlapping, no
 *     half-faded ghost. Out, gap, in."
 *   clip 5 (@wearebrand.io, burger) @4.25s — "Cross-dissolve between two full-viewport section
 *     backdrops", both layers held at ~50% for several frames, on scroll-driven opacity.
 *   clip 0 (Adwebb) @8.47s — "~70ms dissolve from film to storefront, hero dimming beneath the
 *     incoming page". Two frames of genuine composited blend at 30fps, and — the part everyone
 *     drops — the outgoing layer is SCRIMMED as it is covered rather than simply cut.
 *
 * The one thing here that no single clip does: the dissolves are CENTRED ON THE BREATHS. Clip 5
 * cross-dissolves two backdrops and clip 6 empties the viewport between acts; a page doing both at
 * once changes its ground at the exact moment there is nothing on screen to see it change. That is
 * why the corpus sites have no seams. Measured on this demo before the alignment existed: backdrops
 * at 0 / 0.5 / 1 put the first dissolve inside a breath and the second one halfway through act III's
 * second paragraph — same mechanism, invisible in one place and a flicker under the copy in the
 * other. See `alignDissolves`.
 *
 * Why these three mechanisms and not a transition library: every one of them is subtractive. A
 * breath is a div with a height. An entrance is two numbers. A dissolve is opacity on layers that
 * were already there. The corpus sites that read as expensive are not doing more per screen than
 * a template — they are doing less, in a rhythm. Clip 6's own lesson: "Generators fill every
 * screen because empty looks like a bug; empty is pacing, and it is what makes the next headline
 * arrive."
 *
 * Why IntersectionObserver AND a per-frame rect read, rather than either alone. The IO one-shot
 * ("add .is-in when it enters, never remove it") is what most sites ship, and clip 8's lesson is
 * explicit that it is wrong: "a timer-driven or fire-once reveal breaks the moment someone scrolls
 * up, which people constantly do on narrative pages." Clip 7 says the same from the other side —
 * its headlines empty out again on the way through, "so a headline is never left sitting statically
 * on screen — it is always either arriving or leaving." So the reveal here is a pure function of
 * where the element is right now, recomputed every frame, and scrubbing back up genuinely
 * un-reveals. IO is used for one job only: keeping the per-frame rect reads bounded to the handful
 * of elements near the viewport instead of all of them.
 *
 * CONTRACT §3, and the one place this needs explaining. This file never listens for `scroll`. The
 * page owns the scroll source and calls setProgress(), which drives the GROUND — the ground is the
 * one thing that has a single position in the document, so a page-level 0..1 is exactly the right
 * input for it. Per-element entrances cannot be derived from that number at all: two headlines a
 * viewport apart share the same page progress and must not share a reveal state. So entrances read
 * each element's own rect. Reading layout inside this effect's own rAF is not owning a second
 * scroll source — there is still one clock here, and still only one opinion about where the page is.
 *
 *   import { initActBreaks } from './engine.js'
 *   const acts = initActBreaks(document.body, {
 *     acts: '[data-act]', reveal: '[data-act-reveal]',
 *     backdrops: '[data-act-backdrop]', scrim: '[data-act-scrim]',
 *   })
 *   acts.setProgress(scrollTop / (scrollHeight - innerHeight))   // 0..1, ground only
 *   acts.dissolveTo(2)                                           // event-driven act change
 *   acts.destroy()
 *
 * prefers-reduced-motion, re-read live every frame. Entrances are switched OFF entirely — every
 * registered element sits at its resting opacity with no transform, at every scroll position. That
 * is a deliberate reading of CONTRACT §4 rather than a lazy one: the rise is 8vh of vestibular
 * travel, and the exit ramp actively HIDES copy, so "response to the visitor's own input may
 * continue" does not license it. The ground dissolve does continue, because it is a recolour of a
 * layer that never moves — the same call that caustic-field makes. Nothing here has an idle loop,
 * so under the preference there is no rAF at all.
 */

const RM_QUERY = '(prefers-reduced-motion: reduce)';

const DEFAULTS = {
  /** Sections that count as acts. Breaths are inserted BETWEEN these, never inside one. */
  acts: '[data-act]',
  /** Elements whose entrance is choreographed. Value of the attribute is the stagger step. */
  reveal: '[data-act-reveal]',

  /* ── breath ─────────────────────────────────────────────────────────────────────────────── */
  /** Insert the empty viewports. Set false if the page authors its own. */
  insertBreaths: true,
  /** clip 6 @5.5s: "Each gap is roughly a full viewport tall." svh, not vh — a breath that grows
   *  when a mobile URL bar retracts is a breath that changes length mid-scroll. */
  breathHeight: '100svh',
  /** Insert a breath before every Nth act after the first. clip 6 does it between EVERY act
   *  (three in sixteen seconds); clip 7 spends exactly one on a much longer page. 1 or 2. */
  breathEvery: 1,

  /* ── entrance ───────────────────────────────────────────────────────────────────────────── */
  /** clip 6 @5.5s: the headline "fades in from ~0 opacity at the lower third". Element top at
   *  0.66 of viewport height = the reveal has not started. */
  enterAt: 0.66,
  /** Element top at 0.45 of viewport height = fully arrived. DERIVED, not measured — see the
   *  NOT VERIFIED section of SKILL.md. The clip gives the start point and the travel but not the
   *  span; 0.21 of a viewport at clip 6's scroll rate (~1 viewport per second) is a ~210ms reveal,
   *  which is the same order as every other transition measured in the corpus. */
  settleAt: 0.45,
  /** clip 6 @5.5s: "rises ~8% of viewport height into place". Fraction of viewport height. */
  rise: 0.08,
  /** clip 8 @9.75s: "Copy clears completely between sections — out, gap, in." The element fades
   *  back to zero as it leaves the top. Turn off for pages where content must stay legible while
   *  it scrolls away. */
  exit: true,
  /** Exit begins when the element's BOTTOM crosses this fraction of viewport height, and is
   *  complete at the top edge. DERIVED — clip 8 proves the copy is fully absent mid-transition,
   *  not the shape of the ramp. Kept short so nothing lingers as a half-faded ghost. */
  exitStart: 0.15,
  exitEnd: 0.0,
  /** Extra fraction of a viewport of delay per stagger step, so an eyebrow / headline / deck stack
   *  at the same y does not arrive as one slab. DERIVED; the corpus measures per-glyph staggers
   *  (clip 5 @9.25s) but not per-block ones. A delayed element's band moves UP the viewport, so it
   *  has to travel further before it starts — the first version of this moved the band down, which
   *  made step 3 arrive before step 0 whenever the blocks were closer together than the step. */
  stagger: 0.05,
  /** Ceiling on the accumulated stagger. Without it a five-deep stack settles at 0.45 − 5×0.05 =
   *  0.20 of the viewport, by which time the top of the same block is already exiting. */
  staggerMax: 0.15,

  /* ── ground ─────────────────────────────────────────────────────────────────────────────── */
  /** Full-viewport backdrop layers, painted in DOM order. The first is the base and never fades. */
  backdrops: '[data-act-backdrop]',
  /** clip 0 @8.47s: "the outgoing hero is scrimmed as it is covered rather than simply cut."
   *  One element over the backdrops whose opacity peaks at the 50/50 point of each dissolve. */
  scrim: '[data-act-scrim]',
  /** Where each cross-dissolve is CENTRED.
   *
   *  'breaths' — centre it on a breath, so the ground changes while the viewport is empty. This is
   *  the one place this file combines two corpus techniques into something neither clip does alone:
   *  clip 5 @4.25s cross-dissolves two full-viewport backdrops, clip 6 @5.5s empties the viewport
   *  between acts, and a page doing both at once changes its ground with nothing on screen to
   *  notice. That is why the corpus sites have no seams. MEASURED on this effect's own demo before
   *  the alignment existed: with backdrops at 0 / 0.5 / 1 the first dissolve happened to land inside
   *  a breath (scroll 1205–1534, breath 900–1800) and the second landed at scroll 3944–4273, which
   *  is halfway through act III's second paragraph. Identical mechanism, and it read as intentional
   *  in one place and as a flicker under the copy in the other.
   *
   *  'even' — the older behaviour: space the dissolves evenly along scroll and let them fall where
   *  they fall. Explicit `data-act-at` on the backdrops always wins over both.
   *
   *  Breath centres move when the viewport resizes, so this is recomputed on a geometry change. */
  alignDissolves: 'breaths',
  /** Width, in progress units, of the cross-dissolve band centred on that point.
   *  clip 5 @4.25s measured the RESULT ("both layers ~50% for several frames") but its scroll rate
   *  is unknown, so the width itself is DERIVED. */
  dissolve: 0.12,
  /** Peak opacity of the scrim at the crossover. clip 0 says the outgoing hero is "visibly
   *  darkened" and gives no number, so this is DERIVED. 0 disables the scrim. */
  scrimPeak: 0.35,
  /** Head start, in progress units, for the incoming layer. 0 reproduces clip 5's symmetric
   *  dissolve. Corpus clip 12 @6s measures the alternative and why you might want it: incoming
   *  ramps over ~350ms, outgoing over ~500ms, so the incoming layer is fully up ~200ms before the
   *  outgoing one is gone and "the classic both-at-50% wash never happens". Not clip 5's behaviour,
   *  so not the default. */
  lead: 0,
  /** Duration of a dissolveTo() act change. clip 0 @8.47s: two frames of composited blend at
   *  30fps ≈ 67ms, reported as ~70ms. Deliberately near-imperceptible — the join disappears. */
  actMs: 70,
  /** Easing of the ground toward a setProgress() target. A jumpy scroll source (momentum, a
   *  trackpad, Lenis at low lerp) otherwise strobes the dissolve band. */
  ease: 0.12,
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);

/* Normalised position of v across [a, b]. b is allowed to be LESS than a, and both bands here use
 * that: an element enters as its top DESCENDS from 0.66 to 0.45, and exits as its bottom descends
 * from 0.15 to 0. Writing it this way keeps the config readable as "from … to …" instead of
 * forcing the caller to reason about which end is numerically larger. */
const span = (a, b, v) => clamp01((v - a) / (b - a));

const inert = () => ({
  destroy() {}, setProgress() {}, dissolveTo() {},
  acts: [], breaths: [], backdrops: [], supported: false,
});

function resolveAll(host, spec) {
  if (!spec) return [];
  if (typeof spec === 'string') return [...host.querySelectorAll(spec)];
  if (spec.nodeType === 1) return [spec];
  if (typeof spec.length === 'number') return [...spec].filter((e) => e && e.nodeType === 1);
  return [];
}

export function initActBreaks(root, config = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return inert();
  const host = typeof root === 'string' ? document.querySelector(root) : root;
  if (!host || host.nodeType !== 1) return inert();

  const C = Object.assign({}, DEFAULTS, config);
  // Degenerate bands divide by zero and paint NaN into style.opacity, which the browser ignores
  // silently — the element simply never reveals and nothing anywhere reports why. Normalise once.
  C.settleAt = Math.min(C.settleAt, C.enterAt - 0.01);
  C.exitEnd = Math.min(C.exitEnd, C.exitStart - 0.01);

  const acts = resolveAll(host, C.acts);
  const reveals = resolveAll(host, C.reveal);
  const backdrops = resolveAll(host, C.backdrops);
  const scrimEl = resolveAll(host, C.scrim)[0] || null;
  if (!acts.length && !reveals.length && !backdrops.length) {
    console.warn('[act-breaks] nothing matched acts / reveal / backdrops — inert');
    return inert();
  }

  /* Exact restoration is the whole of CONTRACT §1's "indistinguishable from one where init was
   * never called". Storing the style ATTRIBUTE rather than the individual properties is the only
   * version that survives a page which had its own inline opacity to begin with. The trade: if the
   * page mutates inline style on these elements while mounted, destroy() reverts that too. */
  const styleWas = new Map();
  const claim = (el) => { if (!styleWas.has(el)) styleWas.set(el, el.getAttribute('style')); };
  const release = (el) => {
    const s = styleWas.get(el);
    if (s == null) el.removeAttribute('style'); else el.setAttribute('style', s);
  };

  /* ── breath sections ──────────────────────────────────────────────────────────────────────
   * A div with a height and nothing in it. That really is the entire mechanism behind the single
   * most-cited pacing technique in the corpus. aria-hidden because it is not content, and
   * pointer-events:none so a viewport of nothing never eats a click. */
  const breaths = [];
  if (C.insertBreaths) {
    for (let i = 1; i < acts.length; i++) {
      if (i % C.breathEvery !== 0) continue;
      const act = acts[i];
      if (!act.parentNode) continue;
      const b = document.createElement('div');
      b.setAttribute('data-sc', 'act-breaks');
      b.setAttribute('aria-hidden', 'true');
      b.style.cssText = `height:${C.breathHeight};pointer-events:none`;
      act.parentNode.insertBefore(b, act);
      breaths.push(b);
    }
  }

  /* ── ground ───────────────────────────────────────────────────────────────────────────────
   * Backdrops are stacked in DOM order and each one above the base fades in across a band centred
   * on the midpoint between its own `at` and the previous one. Layer 0 stays opaque forever, which
   * is what makes this a cross-dissolve rather than a set of layers that can all be half-there at
   * once: there is never a hole through to the page background. */
  const layers = backdrops.map((el) => {
    const attr = parseFloat(el.getAttribute('data-act-at'));
    return { el, authored: Number.isFinite(attr) ? clamp01(attr) : null, at: 0, mid: 0 };
  });
  /* Authored order may reorder the stack, but only when EVERY layer says where it goes — a partial
   * set cannot be sorted against DOM order without inventing positions for the rest. */
  const authoredAll = layers.length > 0 && layers.every((l) => l.authored !== null);
  if (authoredAll) layers.sort((a, b) => a.authored - b.authored);
  for (const l of layers) claim(l.el);
  if (scrimEl) claim(scrimEl);

  /* `mid` is where a layer's dissolve is centred in page-progress; `at` is the progress a
   * dissolveTo() should travel to in order to land that layer fully in. They are separate because
   * breath alignment sets the CENTRE directly and there is no pair of endpoints that implies it. */
  function computeAnchors(m) {
    const n = layers.length;
    if (!n) return;
    for (let k = 0; k < n; k++) layers[k].at = authoredAll ? layers[k].authored : (n > 1 ? k / (n - 1) : 0);
    layers[0].mid = 0;

    const dissolves = n - 1;
    if (C.alignDissolves === 'breaths' && !authoredAll && dissolves >= 1 && breaths.length >= dissolves) {
      const vh = m.vh;
      const max = Math.max(1, m.max);
      for (let k = 1; k <= dissolves; k++) {
        /* Spread the dissolves across the breaths that EXIST. Two dissolves and three breaths must
         * use the first and the last, not the first two — otherwise the final act never changes
         * ground and the page's whole second half is one colour. */
        const bi = dissolves === 1
          ? Math.floor((breaths.length - 1) / 2)
          : Math.round(((k - 1) * (breaths.length - 1)) / (dissolves - 1));
        const r = breaths[Math.min(bi, breaths.length - 1)].getBoundingClientRect();
        // Progress at which this breath is centred in the viewport.
        const centre = (r.top + m.sy + r.height / 2 - vh / 2) / max;
        layers[k].mid = clamp01(centre) - C.lead;
        layers[k].at = clamp01(layers[k].mid + C.dissolve);
      }
      // Two breaths resolving to the same centre would invert a band and make a layer fade OUT as
      // progress rises. Ordering costs nothing and the alternative is silent.
      for (let k = 2; k <= dissolves; k++) {
        if (layers[k].mid < layers[k - 1].mid) layers[k].mid = layers[k - 1].mid;
      }
    } else {
      for (let k = 1; k < n; k++) layers[k].mid = (layers[k - 1].at + layers[k].at) / 2 - C.lead;
    }
  }

  /** The opacity each layer should carry at ground position p, plus how hard to scrim. */
  function groundWeights(p) {
    const op = new Array(layers.length);
    let scrimW = 0;
    for (let k = 0; k < layers.length; k++) {
      if (k === 0) { op[0] = 1; continue; }
      const mid = layers[k].mid;
      const w = smooth(span(mid - C.dissolve / 2, mid + C.dissolve / 2, p));
      op[k] = w;
      // 4w(1-w) peaks at exactly 1 where w = 0.5 — the frame clip 0 caught, with the storefront
      // half in and the pendant "visibly darkened" beneath it.
      scrimW = Math.max(scrimW, 4 * w * (1 - w));
    }
    return { op, scrimW };
  }

  function applyGround(op, scrimW) {
    for (let k = 0; k < layers.length; k++) layers[k].el.style.opacity = op[k].toFixed(4);
    if (scrimEl) scrimEl.style.opacity = (scrimW * C.scrimPeak).toFixed(4);
  }

  const paintGround = (p) => { const g = groundWeights(p); applyGround(g.op, g.scrimW); };

  /* An act change is NOT the scroll dissolve run quickly. `dissolve` is sized in page-progress
   * units for a document several viewports long; a dissolveTo() that traverses most of that range
   * in 70ms crosses each band inside a single frame, and the result is a hard cut — measured, the
   * scrim peaked at 0.003 and the blend was never sampled. Clip 0 is explicit that the join is a
   * blend and not a cut: "two frames of genuine composited blend at 30fps ... the outgoing hero is
   * scrimmed as it is covered rather than simply cut". So a tween crossfades between the two acts'
   * layer states across its OWN duration, independent of how far apart they sit. */
  function paintTween(w) {
    const op = tween.a.op.map((a, i) => a + (tween.b.op[i] - a) * w);
    applyGround(op, 4 * w * (1 - w));
  }

  /* ── entrances ────────────────────────────────────────────────────────────────────────── */
  const delayOf = new Map();
  for (const el of reveals) {
    claim(el);
    delayOf.set(el, parseFloat(el.getAttribute('data-act-reveal')) || 0);
  }

  /* Viewport + document metrics, read once per painted frame rather than once per element.
   * scrollHeight forces layout, and doing that per element turned a four-block act into four
   * synchronous reflows a frame. */
  const metrics = () => {
    const vh = window.innerHeight || 1;
    const docH = document.documentElement.scrollHeight;
    return { vh, sy: window.scrollY, docH, max: Math.max(0, docH - vh) };
  };

  /* Breath centres are expressed in page progress, so they move whenever the viewport height or the
   * document length changes. Recomputed on a geometry CHANGE rather than per frame: computeAnchors
   * reads a rect per breath, and doing that every frame after the paint loop has written styles is a
   * forced reflow per frame for a number that only moves on resize. */
  let geomVh = -1, geomDoc = -1;
  function syncGeometry(m) {
    const g = m || metrics();
    if (g.vh === geomVh && g.docH === geomDoc) return;
    geomVh = g.vh; geomDoc = g.docH;
    computeAnchors(g);
  }

  function paintOne(el, m) {
    /* The reduced-motion check lives HERE, not only in the frame loop, because the loop is not the
     * only caller: the IntersectionObserver pins an element's terminal state when it disarms. With
     * the check only upstream, a reduced-motion visitor who scrolled past act I got its five blocks
     * written back to opacity 0 by the observer and the copy stayed permanently invisible — content
     * hidden from exactly the visitor least able to recover it. product-check never scrolls, so it
     * cannot see this; it was found by probing inline opacity at 55% scroll under the preference. */
    if (rmq.matches) { el.style.opacity = ''; el.style.transform = ''; return; }
    const { vh, sy, max } = m || metrics();
    const r = el.getBoundingClientRect();
    const shift = Math.min(C.stagger * (delayOf.get(el) || 0), C.staggerMax);
    const enterLine = (C.enterAt - shift) * vh;
    const settleLine = (C.settleAt - shift) * vh;

    let enter;
    if (r.top + sy < vh) {
      /* Already on screen when the document was at scroll 0. It did not ARRIVE — it was there.
       * Revealing it would be an on-load entrance animation, which is autonomous motion and which
       * the corpus does not do: clip 8's intro marks are at full opacity on the first frame and
       * fade OUT (@0s), and clip 6's technique is explicitly about "the NEXT section's headline".
       * Without this rule a hero whose deck sits below 0.66vh opens at zero opacity and only
       * appears once the visitor scrolls, which is the exact opposite of the intended effect. */
      enter = 1;
    } else {
      /* Bias for scroll the document cannot supply. Anything sitting below the settle line in the
       * last viewport can never travel far enough to reach it — the page has run out of scroll —
       * so on a page that ends on copy the final paragraph stays permanently half-revealed. This
       * was visible in the demo: the closing note sat at ~8% opacity at 100% scroll. Subtracting
       * the unreachable distance makes the element land exactly as the document runs out. */
      const remaining = Math.max(0, max - sy);
      const bias = Math.max(0, (r.top - remaining) - settleLine);
      enter = smooth(span(enterLine, settleLine, r.top - bias));
    }

    let vis = enter;
    if (C.exit) vis = Math.min(vis, 1 - smooth(span(C.exitStart * vh, C.exitEnd * vh, r.bottom)));

    el.style.opacity = vis.toFixed(4);
    const y = C.rise * vh * (1 - enter);
    // Drop the transform entirely at rest. A permanent translate3d on every revealed block leaves
    // a stacking context and a composited layer behind on elements that will never move again.
    el.style.transform = y > 0.05 ? `translate3d(0,${y.toFixed(2)}px,0)` : '';
  }

  const active = new Set();
  // rootMargin widens the armed band past the viewport so an element is already being painted
  // before its first visible pixel, and is still being painted for one screen after it leaves —
  // which is what lets the exit ramp finish instead of snapping when IO disarms it.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) active.add(e.target);
      else if (active.delete(e.target)) paintOne(e.target);   // pin the terminal state once
    }
  }, { rootMargin: '25% 0px 25% 0px', threshold: 0 });

  /* ── clock ────────────────────────────────────────────────────────────────────────────── */
  let destroyed = false;
  let raf = 0;
  let target = 0;
  let current = 0;
  let tween = null;
  let lastY = NaN, lastVh = NaN, lastP = NaN;
  const rmq = window.matchMedia(RM_QUERY);

  /** Under the preference: resting opacity, no transform, at every scroll position. */
  function applyStatic() {
    for (const el of reveals) { el.style.opacity = ''; el.style.transform = ''; }
    current = target;
    tween = null;
    // There is no frame loop under the preference, so this is the only thing that will notice a
    // resize having moved the breaths — and the ground still has to dissolve in the right place.
    syncGeometry();
    paintGround(current);
  }

  function frame(now) {
    if (destroyed) return;
    // Live re-read, not a boot flag. A visitor who turns the preference on mid-scroll gets a page
    // with every block at rest on the next frame, and the loop closes itself.
    if (rmq.matches) { raf = 0; applyStatic(); return; }

    let tweenW = -1;
    if (tween) {
      const t = C.actMs <= 0 ? 1 : clamp01((now - tween.t0) / C.actMs);
      tweenW = smooth(t);
      current = tween.from + (tween.to - tween.from) * tweenW;
      if (t >= 1) { current = tween.to; tween = null; tweenW = -1; }
    } else {
      current += (target - current) * C.ease;
    }

    /* Nothing has moved unless the scroll offset, the viewport or the ground progress changed. On a
     * parked page this loop then costs three property reads and zero style writes per frame, which
     * is the difference between a pacing system you can leave mounted on every page and one that
     * shows up in a profile. A running tween always repaints: its blend is a function of elapsed
     * time, not of `current`, so the early-out cannot see it. */
    const y = window.scrollY;
    const vh = window.innerHeight;
    if (tweenW >= 0 || y !== lastY || vh !== lastVh || Math.abs(current - lastP) > 0.0004) {
      lastY = y; lastVh = vh; lastP = current;
      const m = metrics();
      // Before the paint, so the layout read is still warm and so a resize retargets the dissolves
      // on the same frame the entrances reflow.
      syncGeometry(m);
      for (const el of active) paintOne(el, m);
      if (tweenW >= 0) paintTween(tweenW); else paintGround(current);
    }
    raf = requestAnimationFrame(frame);
  }

  // Initial state is painted synchronously here, not on the first rAF: everything below the fold
  // must already be at zero opacity before the browser's next paint, or the page flashes its whole
  // content once and then hides it.
  if (rmq.matches) {
    applyStatic();
  } else {
    // Anchors before the first ground paint: computeAnchors needs the breaths to have been laid
    // out, which they have — they were inserted synchronously above.
    syncGeometry();
    for (const el of reveals) paintOne(el);
    paintGround(0);
    raf = requestAnimationFrame(frame);
  }
  for (const el of reveals) io.observe(el);

  const onPrefChange = () => {
    if (destroyed) return;
    if (rmq.matches) { if (raf) cancelAnimationFrame(raf); raf = 0; applyStatic(); }
    else if (!raf) { lastY = NaN; raf = requestAnimationFrame(frame); }
  };
  rmq.addEventListener?.('change', onPrefChange);

  return {
    acts, breaths, backdrops: layers.map((l) => l.el), supported: true,

    /** Ground position, 0..1. The page owns the scroll source; this is the only thing it drives. */
    setProgress(p) {
      if (destroyed) return;
      target = clamp01(Number(p) || 0);
      // A scroll that lands where a dissolveTo() was already heading is the page catching up with
      // it, not a contradiction — let the tween finish rather than snapping mid-blend.
      if (tween && Math.abs(target - tween.to) > 0.02) tween = null;
      if (rmq.matches) { current = target; tween = null; syncGeometry(); paintGround(current); }
    },

    /** clip 0 @8.47s. Jump the ground to backdrop `i` over actMs with the scrim, for act changes
     *  that are events rather than scroll — a film ending, a gate opening, a route landing. */
    dissolveTo(i) {
      if (destroyed) return;
      const l = layers[i | 0];
      if (!l) return;
      // Anchors first: `at` is derived from the breath centres, so a resize since the last painted
      // frame would otherwise send the tween to the previous layout's progress value.
      syncGeometry();
      target = l.at;
      if (rmq.matches) { current = target; tween = null; paintGround(current); return; }
      // Endpoint weights are snapshotted here, not recomputed per frame: the blend is between two
      // fixed layer states, which is what makes it a dissolve rather than a fast scrub.
      tween = { from: current, to: l.at, t0: performance.now(), a: groundWeights(current), b: groundWeights(l.at) };
      if (!raf) { lastY = NaN; raf = requestAnimationFrame(frame); }
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      rmq.removeEventListener?.('change', onPrefChange);
      for (const b of breaths) b.remove();
      breaths.length = 0;
      for (const el of styleWas.keys()) release(el);
      styleWas.clear();
      active.clear();
    },
  };
}

export default initActBreaks;
