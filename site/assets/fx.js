/* idemlayer — page effects.
   Every effect below is decorative: each is wrapped so a failure leaves a flatter
   page rather than a broken one, and each stops itself under prefers-reduced-motion
   (checked live, not once at load).

   There used to be a count-up here that ticked the three spec cards from 0 up to
   4 / 20 / 512. It is gone on purpose. Those are Anthropic's published limits, and
   animating a published limit means the page spends ~1.1s displaying numbers that
   are not the fact — on a site whose whole argument is that its figures are honest.
   Gate 3 is what surfaced it: mid-tick the run paints none of its own pixels. */

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ── Hero parallax ─────────────────────────────────────────────────────────
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

/* ── Reveals ───────────────────────────────────────────────────────────────
   Pre-triggers 200px early so fast scrolling never outruns the transition. */
function initReveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      io.unobserve(e.target);
    });
  }, { rootMargin: "200px 0px 100px 0px", threshold: 0.01 });

  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
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
