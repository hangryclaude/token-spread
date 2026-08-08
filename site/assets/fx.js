/* idemlayer — page effects.
   Every effect below is decorative: each is wrapped so a failure leaves a flatter
   page rather than a broken one, and each stops itself under prefers-reduced-motion
   (checked live, not once at load). */

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ── 1. Count-up on figures ───────────────────────────────────────────────
   Numbers tick to their value when they first scroll into view. Static text
   stays in the DOM, so a failure here shows the final number, not an empty box. */
function countUp(el) {
  const raw = el.dataset.count;
  const target = parseFloat(raw);
  if (!Number.isFinite(target)) return;
  const prefix = el.dataset.prefix || "";
  const suffix = el.dataset.suffix || "";
  const decimals = (raw.split(".")[1] || "").length;

  if (reduced.matches) {
    el.textContent = prefix + target.toFixed(decimals) + suffix;
    return;
  }
  const dur = 1100;
  let start = null;
  const step = (t) => {
    if (start === null) start = t;
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);           // easeOutCubic
    el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ── 2. Hero parallax ─────────────────────────────────────────────────────
   The page owns scroll: one listener, one rAF, pushed to every subscriber.
   Two competing scroll sources is the classic way to break a composed page. */
const subs = [];
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y = window.scrollY;
    for (const fn of subs) { try { fn(y); } catch { /* decorative */ } }
    ticking = false;
  });
}

function initParallax() {
  const art = document.querySelector("[data-fx-parallax]");
  if (!art) return;
  subs.push((y) => {
    if (reduced.matches) { art.style.transform = ""; return; }
    const shift = Math.min(y * 0.12, 90);
    art.style.transform = `translate3d(0,${shift}px,0)`;
  });
}

/* ── 3. Reveals ───────────────────────────────────────────────────────────
   Pre-triggers 200px early so fast scrolling never outruns the transition. */
function initReveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      e.target.querySelectorAll?.("[data-count]").forEach(countUp);
      if (e.target.matches?.("[data-count]")) countUp(e.target);
      io.unobserve(e.target);
    });
  }, { rootMargin: "200px 0px 100px 0px", threshold: 0.01 });

  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  document.querySelectorAll("[data-count]").forEach((el) => io.observe(el));
}

try {
  initReveals();
  initParallax();
  if (subs.length) {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
} catch (err) {
  console.info("effects skipped, page continues flat:", err);
}
