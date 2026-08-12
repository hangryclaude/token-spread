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
  /* The brief is the site's source of truth, and it was the LAST place still carrying the
     cancelled rise — every page had been corrected while the document they are all written from
     still said the increase was coming. A gate that watches only the output misses that. */
  "site/BRIEF.md",
];

/* The cancelled-rise check runs over more files than the rate reconciliation does.
   The research registers turned out to be wrong too, in the worst possible way: the errata table
   that exists to catch stale prices called this rise "the most time-boxed item in the register" on
   2026-08-11, one day AFTER Anthropic's release notes cancelled it — the document whose job is
   correcting staleness was the stalest thing in the repo.
   They are NOT pair-reconciled, though, and must not be: they document Fast mode at $10/$50, geo
   multipliers, tokenizer boundaries and other providers' rates on purpose. Reconciling every
   "$A/$B" in them against the standard card would fail on facts that are correct. */
const CANCELLED_RISE_WATCH = [
  ...PAGES,
  "docs/research/2026-08-10-strict-identity-register.md",
  "docs/research/2026-08-11-context-survival-register.md",
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
  /* Naming the rise is allowed; presenting it as something still coming is not. So a mention is
     an offence only when nothing nearby says it was called off. The window is three lines because
     BRIEF.md's correction is a wrapped sentence, and a strictly per-line rule read its own
     retraction as the offence it was retracting. */
  const MENTIONS = /\$3\s*\/\s*\$15|intro(ductory)?\b/i;
  const RETRACTS = /will not occur|standard price|cancelled|canceled|corrected/i;

  const offenders: string[] = [];
  for (const page of CANCELLED_RISE_WATCH) {
    const lines = readFileSync(page, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!MENTIONS.test(line)) return;
      const window = lines.slice(Math.max(0, i - 1), i + 3).join(" ");
      if (!RETRACTS.test(window)) offenders.push(`${page}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  expect(offenders, `pages still selling a price change that will not occur:\n${offenders.join("\n")}`)
    .toEqual([]);
});
