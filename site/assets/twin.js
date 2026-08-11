/**
 * Two terminals, one answer.
 *
 * Both panes stream the identical response at the identical rate — that is the whole
 * point, and the reason the typing is driven by a single loop writing to both rather than
 * two loops that could drift. Only the meter differs.
 *
 * The answer is authored as PARAGRAPHS, not hard-wrapped lines. It was wrapped at ~72
 * characters into a pane that fits ~61 on desktop and ~40 on a phone, so every authored
 * line spilled a short remnant — "including the", "so the same", "times." — and the
 * comparison read as ragged noise at every width. pre-wrap reflows paragraphs correctly
 * at any width; a streamed response is prose, not a source file.
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
  "`withRetry` re-invokes the operation on any thrown error, including the 422 from `validate()`. A validation failure is not transient, so the same invalid payload is submitted three times and billed three times.",
  "",
  "Narrow the catch to 429 and 5xx, and let 4xx propagate.",
].join("\n");

const money = (n) => "$" + n.toFixed(4);

function run(root, answer) {
  const panes = [...root.querySelectorAll("[data-twin-out]")];
  const meters = [...root.querySelectorAll("[data-twin-cost]")];
  const totals = [COLD, WARM];
  const done = root.querySelector("[data-twin-done]");

  /**
   * Paint `n` characters, keeping the remainder in the box as hidden text.
   *
   * Measured: clearing the pane outright collapsed the act from 1109px to 963px the instant
   * typing began, so every act below it jumped 146px up the page while the visitor was
   * reading. visibility:hidden still occupies its space and is dropped from the a11y tree,
   * so the pane is always exactly full-answer height — at every viewport width, with no
   * measurement and no resize handling. Inline rather than a class because index.html shares
   * this file and would otherwise need a stylesheet edit to avoid painting the remainder.
   */
  const paint = (n) => {
    const rest = answer.slice(n);
    panes.forEach((p) => {
      // One write, both panes: they cannot drift apart, because there is nothing to drift.
      p.textContent = answer.slice(0, n);
      if (!rest) return;
      const ghost = document.createElement("span");
      ghost.style.visibility = "hidden";
      ghost.textContent = rest;
      p.appendChild(ghost);
    });
  };

  const finish = () => {
    paint(answer.length);
    meters.forEach((m, i) => { m.textContent = money(totals[i]); });
    // hidden=false for the page that ships it hidden; visibility for the one that does not.
    if (done) { done.hidden = false; done.style.visibility = ""; }
  };

  // Anyone who has asked not to be animated gets the answer, not the performance.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();

  let i = 0;
  // Reserved, not removed — the same 146px argument as paint(): `hidden` took this
  // paragraph's 57px out of flow and moved everything below it while the answer typed.
  if (done) { done.hidden = false; done.style.visibility = "hidden"; }
  paint(0);

  const step = () => {
    i += 2;
    paint(i);
    const progress = Math.min(1, i / answer.length);
    meters.forEach((m, k) => { m.textContent = money(totals[k] * progress); });
    if (i < answer.length) return setTimeout(step, 16);
    finish();
  };
  setTimeout(step, 400);
}

const root = document.querySelector("[data-twin]");
if (root) {
  /**
   * The markup wins where it carries the answer. index-scroll.html ships both panes filled
   * and both meters at their true totals, so the act still states its case with no JS, a
   * module that failed to load, or a screenshot taken inside the 400ms before the first
   * timer fires — which is exactly how it was found blank. ANSWER above stays the fallback
   * for a page that ships them empty, which index.html still does.
   *
   * Read ONCE, out here: reading it inside run() would let a replay clicked mid-type reseed
   * the whole animation from a half-typed pane.
   */
  const seeded = root.querySelector("[data-twin-out]");
  const answer = (seeded && seeded.textContent.trim()) || ANSWER;
  // Only run when it is actually on screen, and only once.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.disconnect();
      run(root, answer);
    }
  }, { threshold: 0.35 });
  io.observe(root);

  const replay = root.querySelector("[data-twin-replay]");
  if (replay) replay.addEventListener("click", () => run(root, answer));
}
