/* Tokens Saved — shared behaviour. No dependencies, no build step. */

/* The savings model lives in savings.js and is re-exported here so both pages keep importing
   the same path they always did. It is a separate file because this one has a side effect at
   module scope — the observer below — and that made the model impossible to import outside a
   browser, which is why it had no tests. See savings.js. */
export { CEIL, modelSavings, tierFor, usd } from "./savings.js";

/* Scroll reveals. Pre-triggers 200px early so fast scrolling never outruns the
   transition (that showed up as occlusion warnings in gate 2).

   The hiding half of this lives in style.css as `.js .reveal{opacity:0}`, scoped to a class
   an inline <head> script adds. Without that scope the page kept its copy at opacity 0 for
   anyone whose JavaScript did not run, which is the opposite of degrading gracefully. */
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }),
  { rootMargin: "200px 0px 100px 0px", threshold: 0.01 },
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
