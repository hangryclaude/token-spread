/**
 * Two terminals, one answer.
 *
 * Both panes stream the identical response at the identical rate — that is the whole
 * point, and the reason the typing is driven by a single loop writing to both rather than
 * two loops that could drift. Only the meter differs.
 *
 * The numbers are not decorative. They come from the rate card in src/rates.ts:
 * Opus 5 input $5/MTok, cache read $0.50/MTok (0.1x), output $25/MTok. A turn carrying
 * 40,000 tokens of context and generating 300 costs $0.2075 cold and $0.0275 warm.
 */
const CONTEXT_TOKENS = 40_000;
const OUTPUT_TOKENS = 300;
const USD = { input: 5 / 1e6, cacheRead: 0.5 / 1e6, output: 25 / 1e6 };

const COLD = CONTEXT_TOKENS * USD.input + OUTPUT_TOKENS * USD.output;   // 0.2075
const WARM = CONTEXT_TOKENS * USD.cacheRead + OUTPUT_TOKENS * USD.output; // 0.0275

const ANSWER = [
  "The retry wrapper is the bug.",
  "",
  "`withRetry` re-invokes the operation on any thrown error, including the",
  "422 from `validate()`. A validation failure is not transient, so the same",
  "invalid payload is submitted three times and billed three times.",
  "",
  "Narrow the catch to 429 and 5xx, and let 4xx propagate.",
].join("\n");

const money = (n) => "$" + n.toFixed(4);

function run(root) {
  const panes = [...root.querySelectorAll("[data-twin-out]")];
  const meters = [...root.querySelectorAll("[data-twin-cost]")];
  const totals = [COLD, WARM];
  const done = root.querySelector("[data-twin-done]");

  const finish = () => {
    panes.forEach((p) => { p.textContent = ANSWER; });
    meters.forEach((m, i) => { m.textContent = money(totals[i]); });
    if (done) done.hidden = false;
  };

  // Anyone who has asked not to be animated gets the answer, not the performance.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();

  let i = 0;
  if (done) done.hidden = true;
  panes.forEach((p) => { p.textContent = ""; });

  const step = () => {
    i += 2;
    const slice = ANSWER.slice(0, i);
    // One write, both panes: they cannot drift apart, because there is nothing to drift.
    panes.forEach((p) => { p.textContent = slice; });
    const progress = Math.min(1, i / ANSWER.length);
    meters.forEach((m, k) => { m.textContent = money(totals[k] * progress); });
    if (i < ANSWER.length) return setTimeout(step, 16);
    finish();
  };
  setTimeout(step, 400);
}

const root = document.querySelector("[data-twin]");
if (root) {
  // Only run when it is actually on screen, and only once.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.disconnect();
      run(root);
    }
  }, { threshold: 0.35 });
  io.observe(root);

  const replay = root.querySelector("[data-twin-replay]");
  if (replay) replay.addEventListener("click", () => run(root));
}
