import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * The pricing page's tier bullets were written without a source. BRIEF.md carries the tier NAMES and
 * PRICES and nothing else, so every feature listed under them was, strictly, invented — the same
 * defect as the $15,000 Enterprise fee, and harder to spot because a feature list looks like copy
 * rather than a claim.
 *
 * Four of them describe a stateless one-shot CLI doing things a stateless one-shot CLI cannot do:
 * watching continuously, alerting on a regression, routing traffic, and authenticating a user. They
 * stay on the page — a roadmap is legitimate — but they must carry the "planned" marker, because
 * the difference between "you get this" and "you will get this" is the entire product's premise.
 *
 * The other bullets are checked the other way: they assert a capability, so the capability has to
 * be in the source. If per-project attribution is ever deleted from metrics.ts, this fails.
 */

const PRICING = readFileSync("site/pricing.html", "utf8");

/** Every <li> on the page, with its inner HTML, so a claim can be read together with its marker. */
const items = [...PRICING.matchAll(/<li>(.*?)<\/li>/gs)].map((m) => m[1]);

const NOT_BUILT = [
  "Continuous hit-rate monitoring",
  "Regression alerts",
  "Batch routing for async work",
  "SSO and audit log",
];

test("nothing a one-shot CLI cannot do is offered as if it were built", () => {
  const unmarked = NOT_BUILT.filter((feature) => {
    const li = items.find((i) => i.includes(feature));
    // A missing bullet is not a pass: it means the wording changed and this gate stopped watching.
    return li === undefined || !/class="soon"/.test(li);
  });
  expect(unmarked, `offered without a "planned" marker: ${unmarked.join(", ")}`).toEqual([]);
});

test("the page explains what the marker means", () => {
  // A badge nobody can decode is decoration. The legend is the part that makes it honest.
  expect(PRICING).toMatch(/means not built yet/);
});

test("bullets that claim a shipped capability are backed by source", () => {
  const claims: [string, string, RegExp][] = [
    ["Per-project attribution", "src/metrics.ts", /byProject/],
    ["Break diagnosis", "src/detect/ttlRightSizing.ts", /export function detectTtlRightSizing/],
    // acceptance.test.ts, not readOnly.test.ts: the read-only tests prove nothing is written,
    // while the no-network property is the one that makes "your own machines" true, and it is
    // enforced by replacing globalThis.fetch with a throw for the duration of a real run.
    ["Runs entirely on your own machines", "tests/acceptance.test.ts", /globalThis\.fetch = \(\(\) => \{ throw/],
  ];
  for (const [bullet, file, re] of claims) {
    expect(items.some((i) => i.includes(bullet)), `the "${bullet}" bullet is gone from the page`).toBe(true);
    expect(readFileSync(file, "utf8"), `"${bullet}" is claimed on the pricing page but ${file} does not back it`)
      .toMatch(re);
  }
});
