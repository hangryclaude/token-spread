/* Orb field — the depth-of-field disc scatter behind the hero.
   Measured off uniswap.org, 2026-08-09: their orbs are not images. Each is a plain
   div carrying a flat brand colour with `filter: blur(Npx)` where N ranges 5.5→44,
   and an `opacity` of 0.49→0.92 that tracks the blur. Blur and opacity together are
   the depth cue — near discs are crisp and solid, far ones are soft and faint.
   Reproducing that in CSS costs nothing and stays sharp at any DPR, which a
   generated bitmap of the same thing would not.

   Deterministic by seed: the same layout every load, so a gate screenshot is
   comparable run to run. */

/* Hue variety is the whole effect. Uniswap's discs are token brand colours, so the
   field is an accidental rainbow — teal, pink, blue, orange, purple — and that is
   what stops it reading as one big gradient smear. A first pass here used the accent
   family plus greys and it looked exactly like that smear: green blobs with dirty
   smudges. Greys are gone; the accent green just leads. */
const PALETTE = [
  "#19BB77", "#21C95E", "#0B7A4B",   // ours leads
  "#5A9CE8", "#8B7DEA", "#E86FB0",
  "#E9A63C", "#4FC3C7", "#F2705B",
  "#7DD48A", "#6C8BE0",
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Keeps discs off the centre column where the headline and the card live. Uniswap's
   overlap their headline but never their widget; the widget is the thing you have to
   read. Returns true when the point is inside the protected column. */
function inKeepOut(xPct, yPct, keepOut) {
  if (!keepOut) return false;
  return xPct > keepOut.x0 && xPct < keepOut.x1 && yPct > keepOut.y0 && yPct < keepOut.y1;
}

export function initOrbField(host, opts = {}) {
  if (!host) return null;

  const {
    count = 22,
    seed = 20260809,
    keepOut = { x0: 26, x1: 74, y0: 8, y1: 96 },
    drift = true,
    scale = 1,
  } = opts;

  const rnd = mulberry32(seed);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const orbs = [];

  /* Jittered grid, not pure random. Uniform random clumps — the first render put six
     discs in the bottom-left corner and left the mid-left empty, which reads as a
     mistake rather than as scatter. A cell per disc with jitter inside it keeps the
     spacing even while still looking unplanned. */
  const cols = 6;
  const rows = Math.ceil(count / cols);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push([c, r]);
  }
  for (let i = cells.length - 1; i > 0; i--) {          // seeded Fisher–Yates
    const j = Math.floor(rnd() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  let hue = Math.floor(rnd() * PALETTE.length);

  for (let i = 0; i < Math.min(count, cells.length); i++) {
    const [c, r] = cells[i];
    const depth = Math.pow(rnd(), 0.6);   // 0 = far and soft, 1 = near and crisp

    const x = ((c + 0.12 + rnd() * 0.76) / cols) * 100;
    const y = ((r + 0.12 + rnd() * 0.76) / rows) * 100;
    if (inKeepOut(x, y, keepOut)) continue;   // one fewer disc is fine

    /* A disc's rendered footprint is size + 2*blur, so tying size to depth the same
       way blur is tied to it makes the near ones read as balloons. Size is nearly
       flat — a spread of small coins, per the reference, where the apparent size
       difference comes almost entirely from the blur. */
    const size = 44 + rnd() * 58;                    // 44→102px, independent of depth
    const blur = 5 + Math.pow(1 - depth, 1.7) * 40;  // 5→45px
    const opacity = 0.34 + depth * 0.56;             // 0.34→0.90; far discs fade out

    // step through the palette rather than sampling it, so no two neighbours in
    // the shuffled cell order land on the same hue
    hue = (hue + 1 + Math.floor(rnd() * 3)) % PALETTE.length;

    const el = document.createElement("div");
    el.className = "orb";
    el.style.cssText =
      `left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;` +
      `width:${(size * scale).toFixed(0)}px;height:${(size * scale).toFixed(0)}px;` +
      `background:${PALETTE[hue]};` +
      `filter:blur(${blur.toFixed(2)}px);opacity:${opacity.toFixed(3)}`;

    host.appendChild(el);
    orbs.push({
      el,
      amp: 5 + depth * 16,           // near discs travel further — parallax by depth
      speed: 0.10 + rnd() * 0.16,
      phase: rnd() * Math.PI * 2,
      driftX: (rnd() - 0.5) * 0.7,
    });
  }

  if (!drift || !orbs.length) return { orbs: orbs.length, stop() {} };

  /* Own rAF rather than borrowing the page's scroll loop: this is time-driven, not
     scroll-driven, so there is no shared clock to fight over. Pauses itself when the
     field scrolls out of view, which is most of the page. */
  let raf = 0, running = false, t0 = 0;
  const tick = (t) => {
    if (!running) return;
    if (!t0) t0 = t;
    const s = (t - t0) / 1000;
    for (const o of orbs) {
      const dy = Math.sin(s * o.speed * Math.PI * 2 + o.phase) * o.amp;
      const dx = Math.cos(s * o.speed * Math.PI * 2 + o.phase) * o.amp * o.driftX;
      o.el.style.transform = `translate3d(${dx.toFixed(2)}px,${dy.toFixed(2)}px,0)`;
    }
    raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (running || reduced.matches) return;
    running = true; t0 = 0; raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    running = false; cancelAnimationFrame(raf);
    for (const o of orbs) o.el.style.transform = "";
  };

  const io = new IntersectionObserver(
    ([e]) => (e.isIntersecting ? start() : stop()),
    { threshold: 0 },
  );
  io.observe(host);

  // live query, per CONTRACT — a load-time branch strands the field mid-drift
  reduced.addEventListener?.("change", () => (reduced.matches ? stop() : start()));

  return { orbs: orbs.length, stop };
}
