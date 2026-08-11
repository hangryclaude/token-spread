import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";

/**
 * Every dollar figure the site prints for a model is a claim about the rate card, restated by
 * hand in marketing prose. Nothing tied the two together until this file existed, and they had
 * already drifted twice by 2026-08-12:
 *
 *   - src/rates.ts carried Sonnet 5 at $3/$15 while its own note said $2/$10 was in force,
 *     over-stating Sonnet cost — and every saving measured against it — by 50%.
 *   - After the card was fixed, three pages still advertised the increase to $3/$15 that
 *     Anthropic had cancelled: sample-audit.html twice, index.html once.
 *
 * The second drift is the one worth a permanent gate. A stale rate in the card fails loudly the
 * moment anyone checks a total; a stale rate in prose fails silently on the page a prospect
 * reads, and the product's entire claim is that it only states what it can prove.
 */

const PAGES = [
  "site/index.html",
  "site/index-scroll.html",
  "site/pricing.html",
  "site/methods.html",
  "site/sample-audit.html",
  "README.md",
];

/** $ per MTok, from the card's micro-cents per token: 500 µ¢/tok == 500 ¢/MTok == $5/MTok. */
const perMTok = (microCents: number) => microCents / 100;

/* How each model is written on the pages. The dated Haiku id is deliberately absent — it is an
   identifier the site quotes in provenance text, never a price label, and adding it here would
   match `claude-haiku-4-5` inside it and double-count. */
const LABELS: Record<string, string> = {
  "Opus 5": "claude-opus-5",
  "Opus 4.8": "claude-opus-4-8",
  "Sonnet 5": "claude-sonnet-5",
  "Haiku 4.5": "claude-haiku-4-5",
  "claude-opus-5": "claude-opus-5",
  "claude-sonnet-5": "claude-sonnet-5",
  "claude-haiku-4-5": "claude-haiku-4-5",
};

/* Matches "Sonnet 5 $2/$10" and "claude-sonnet-5 is priced at $2/$10" alike. The gap is capped
   at 40 characters and may not contain a tag or another dollar sign, so the label cannot reach
   across a sentence and claim a figure that belongs to a different model. */
const PAIR = new RegExp(
  `(${Object.keys(LABELS).map((l) => l.replace(/\./g, "\\.")).join("|")})([^$<]{0,40})\\$(\\d+(?:\\.\\d+)?)/\\$(\\d+(?:\\.\\d+)?)`,
  "g",
);

let totalClaims = 0;

for (const page of PAGES) {
  test(`${page} quotes only rates the card actually holds`, () => {
    const text = readFileSync(page, "utf8");
    const claims = [...text.matchAll(PAIR)];
    totalClaims += claims.length;

    for (const [whole, label, , input, output] of claims) {
      const rate = CARD.rates[LABELS[label]];
      expect(rate, `${page}: no card entry for ${label}`).toBeDefined();
      expect(Number(input), `${page}: "${whole.trim()}" — input`).toBe(perMTok(rate.input));
      expect(Number(output), `${page}: "${whole.trim()}" — output`).toBe(perMTok(rate.output));
    }
  });
}

test("the pages are actually being read", () => {
  // Without this, restyling the pages out from under the regex turns every assertion above
  // into a loop over zero claims: all green, nothing checked. Six were present on 2026-08-12.
  expect(totalClaims).toBeGreaterThanOrEqual(4);
});

test("no page advertises the cancelled Sonnet 5 increase", () => {
  /* Belt and braces for the exact defect that shipped. The reconciliation above catches a wrong
     PAIR next to a model label; this catches the rise stated as a future event in prose, where
     no current rate is being quoted at all — "rises to $3/$15", "intro pricing through 31 Aug". */
  const offenders: string[] = [];
  for (const page of PAGES) {
    for (const line of readFileSync(page, "utf8").split("\n")) {
      // "introductory" survives in one place on purpose: the card note that records the
      // correction. It is only a defect when it is still describing the price as temporary.
      const stale = /\$3\/\$15/.test(line) || (/intro(ductory)?\b/i.test(line) && !/standard price/i.test(line));
      if (stale) offenders.push(`${page}: ${line.trim().slice(0, 120)}`);
    }
  }
  expect(offenders, `pages still selling a price change that will not occur:\n${offenders.join("\n")}`)
    .toEqual([]);
});
