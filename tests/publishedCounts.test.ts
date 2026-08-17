import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cohortFiles, loadRegister, tally } from "../src/register/load";
import { duplicateIds } from "../src/register/ids";

/**
 * The site publishes the register's tally as four hand-typed numbers. Nothing tied them to the
 * data until this file existed, and on 2026-08-12 they had already drifted: the pages printed
 * "176 techniques" over 66 / 50 / 36, which add to 152. The 24 CONTRACTUAL_ONLY entries were in
 * no count at all.
 *
 * That is the cheapest possible defect to ship and the most expensive to be caught on, because
 * the product's whole claim is that it only states what it can prove. It also gets more likely,
 * not less, as the register grows — every new candidate moves all five figures.
 */

/* Cohorts are kept in separate files on purpose. The 176 were adjudicated by one process in
   August; the addendum is what nine later sweeps produced, each entry re-verified against its
   primary source by hand before being written down. Merging them into one file would lose which
   process produced which verdict, and that provenance is the thing being sold. Merging them for
   the published TALLY is right, because a reader counting techniques does not care which week
   they were judged in — but the ids must not collide, which is what the test below enforces.

   Which files those are lives in docs/research/cohorts.json, not here: this test, the film and
   the CLI all read the register, and a cohort added to two of the three lists is the same class
   of drift this whole file exists to catch. */
const entries = loadRegister();

test("no two register entries share an id", () => {
  // Two cohorts numbered independently would silently double-count or overwrite on any future
  // merge, and the published total is derived from length rather than from max(id). This is not
  // hypothetical: the 2026-08-12 sweep brief numbered its findings 185-199 while the verdict
  // files already held 185 and 186, and thirteen of them went unmerged for five days.
  const dupes = duplicateIds(entries);
  expect(dupes, `duplicate register ids across cohorts: ${dupes.join(", ")}`).toEqual([]);
});

/* "Pass the bar" is the four classes where identity is demonstrable. CONTRACTUAL_ONLY is
   deliberately not among them — the provider asserts neutrality and we cannot verify it — which
   is exactly why it needs its own published number rather than being folded in or dropped. */
const PASSING = ["PASS_ABSOLUTE", "PASS_METADATA", "PASS_SCHEDULING", "PASS_REPLAY"];
const counts = tally(entries);

test("every verdict is a class the site knows how to publish", () => {
  const known = new Set([...PASSING, "CONTRACTUAL_ONLY", "FAIL", "INSUFFICIENT_EVIDENCE"]);
  const strays = [...new Set(entries.map((e) => e.strictVerdict))].filter((v) => !known.has(v));
  // A new verdict class would land in no published bucket and silently break the reconciliation
  // below — the failure would read as an arithmetic error rather than an unhandled category.
  expect(strays, `unhandled verdict class(es): ${strays.join(", ")}`).toEqual([]);
});

test("the four published categories account for every candidate", () => {
  expect(counts.pass + counts.contractual + counts.rejected + counts.unresolved).toBe(counts.total);
});

/* The two pages present the same tally in different markup — methods.html as a list with the
   figure ahead of its label, index-scroll.html as a <dl> with the figure after. An extractor
   clever enough to accept either order also accepts the number belonging to the PREVIOUS label,
   which is how the first version of this read "66" as the contractual-only count. Two explicit
   readers are duller and cannot make that mistake; the vacuous-match guard below catches it if
   either page is restyled out from under them. */
const READERS: Record<string, Record<string, RegExp>> = {
  "site/methods.html": {
    total: /<h2>(\d+) techniques/,
    pass: /<strong>(\d+)<\/strong>\s*pass the bar/,
    contractual: /<strong>(\d+)<\/strong>\s*pass on the provider's word/,
    rejected: /<strong>(\d+)<\/strong>\s*rejected/,
    unresolved: /<strong>(\d+)<\/strong>\s*unresolved/,
    /* The page ALSO states two counts in running prose — "Each of the 66 is graded…", "The other
       27 have only…" — and that paragraph drifted invisibly for a day: it still said 66/24 while
       the structured list above it said 70/27, because this gate only parsed the markup. Prose
       restates the same facts, so prose joins the reconciliation. */
    passProse: /Each of the (\d+) is graded/,
    contractualProse: /The other (\d+)\s*have only the provider's documentation/,
  },
  /* index.html is the canonical, sitemap-listed homepage and carried no register at all until
     2026-08-12 — the product's central claim was reachable only from an orphan page. Now that it
     publishes the tally it joins the reconciliation, or it becomes the fourth copy to drift. */
  "site/index.html": {
    total: /<h2>(\d+) candidates/,
    pass: /<h3>(\d+) pass<\/h3>/,
    contractual: /<h3>(\d+) on the provider's word<\/h3>/,
    rejected: /<h3>(\d+) rejected<\/h3>/,
    unresolved: /<h3>(\d+) unresolved<\/h3>/,
  },
  "site/index-scroll.html": {
    total: /<figcaption[^>]*>(\d+) candidate techniques/,
    pass: /<dt>pass<\/dt><dd[^>]*>(\d+)</,
    contractual: /<dt>provider's word only<\/dt><dd[^>]*>(\d+)</,
    rejected: /<dt>rejected<\/dt><dd[^>]*>(\d+)</,
    unresolved: /<dt>unresolved<\/dt><dd[^>]*>(\d+)</,
  },
  /* The README carried the same 66/50/36-under-a-headline-of-176 drift as both pages, found
     after the pages were fixed. Three independent copies of one tally is why this file exists
     rather than a one-off correction. */
  "README.md": {
    total: /(\d+) candidate techniques were adjudicated/,
    pass: /\*\*(\d+) pass\*\*/,
    contractual: /\*\*(\d+) pass on\n?the provider's word alone\*\*/,
    rejected: /\*\*(\d+) rejected\*\*/,
    unresolved: /\*\*(\d+) unresolved\*\*/,
  },
  /* The alt text on the two register images restates the whole tally, and both said "51
     rejected" against a register holding 52 — stale since the day four entries were expelled
     from the passing column. Nothing read them, because every reader above stops at the prose.
     A sighted reader saw the correct figure in the picture; a screen-reader user was told a
     different one, which is the one audience this project cannot afford to hand a wrong number.
     Keyed `file#label` so two independent claims in one file each get their own reader — the
     same idiom publishedTestCount.test.ts uses for the README's two test counts. */
  "README.md#alt-gif": {
    total: /then (\d+) candidates sorting into/,
    pass: /sorting into (\d+) that pass the bar/,
    contractual: /pass the bar, (\d+) that pass on the provider's word alone/,
    rejected: /that pass on the provider's word alone, (\d+) rejected and/,
    unresolved: /(\d+) unresolved" width=/,
  },
  "README.md#alt-card": {
    total: /(\d+) techniques adjudicated: /,
    pass: /techniques adjudicated: (\d+) pass the bar/,
    contractual: /pass the bar, (\d+) pass on the provider's word alone/,
    rejected: /pass on the provider's word alone, (\d+) rejected outright/,
    unresolved: /rejected outright, (\d+) unresolved and stated as unresolved/,
  },
};

for (const [page, reader] of Object.entries(READERS)) {
  test(`${page} publishes the counts the data actually holds`, () => {
    const html = readFileSync(page.split("#")[0]!, "utf8");
    const found = Object.fromEntries(
      Object.entries(reader).map(([k, re]) => [k, html.match(re) ? Number(html.match(re)![1]) : null]),
    ) as Record<string, number | null>;

    // The failure mode that matters most is a regex that silently matches nothing: the assertions
    // below would then compare null to null and pass while the page said anything at all.
    for (const [k, v] of Object.entries(found)) {
      expect(Number.isFinite(v as number), `${page}: found no published figure for "${k}" — the
        extractor matched nothing, so this test proves nothing about that number`).toBe(true);
    }

    expect(found.total, `${page} total`).toBe(counts.total);
    expect(found.pass, `${page} pass`).toBe(counts.pass);
    expect(found.contractual, `${page} contractual-only`).toBe(counts.contractual);
    expect(found.rejected, `${page} rejected`).toBe(counts.rejected);
    expect(found.unresolved, `${page} unresolved`).toBe(counts.unresolved);
    // Prose restatements, where a page has them, reconcile to the same figures as the markup.
    if ("passProse" in reader) expect(found.passProse, `${page} pass (prose)`).toBe(counts.pass);
    if ("contractualProse" in reader) {
      expect(found.contractualProse, `${page} contractual-only (prose)`).toBe(counts.contractual);
    }
  });
}

/* Each reader above aims at one number in one place, which is precise and leaves everything it
   was not aimed at unwatched: two meta descriptions, the headlines that repeat "N techniques, M
   survive", the "those four add to N" sums, the entry count in SCHEMA.md. The alt text sat in
   that gap for five days carrying the wrong figure.

   This is the coarse net under the fine one. It does not know which bucket a number belongs to —
   the readers do that — it only asserts that a figure standing next to a register word is still
   one of the five the register currently holds. That catches the failure that actually happens:
   the register grows, one copy is updated, a second is forgotten. */
const SCANNED = [
  "README.md",
  "site/index.html",
  "site/methods.html",
  "site/index-scroll.html",
  "docs/research/SCHEMA.md",
];
const BUCKET_WORD = /(\d{1,4}) (?:candidates?|techniques?|entries|passes|pass|rejected|unresolved|survives?|survive)\b/gi;
const SUM = /adds? to (\d+)/gi;

test("no published file states a register number that is no longer one", () => {
  const live = new Set<number>(Object.values(counts));
  const wrong = new Set<string>();
  for (const file of SCANNED) {
    const raw = readFileSync(file, "utf8");
    /* Two haystacks, because neither alone sees every claim. Stripping tags is what joins
       "<strong>67</strong>" to the "pass the bar" after it — but a tag is also where alt= and
       content= keep their text, so stripping deletes the meta descriptions and the image alt
       text wholesale. Scanning the raw file catches those and misses the split ones. The union
       sees both; a claim caught twice is reported once. */
    for (const text of [raw.replace(/<[^>]+>/g, " "), raw].map((t) => t.replace(/\s+/g, " "))) {
      for (const m of text.matchAll(BUCKET_WORD)) {
        if (!live.has(Number(m[1]))) wrong.add(`${file}: "${m[0]}" is not any current count`);
      }
      for (const m of text.matchAll(SUM)) {
        if (Number(m[1]) !== counts.total) wrong.add(`${file}: "${m[0]}" — the four add to ${counts.total}`);
      }
    }
  }
  expect([...wrong], `published copy carries stale register numbers:\n  ${[...wrong].join("\n  ")}`).toEqual([]);
});

test("the README hands out every cohort file, and only files that exist", () => {
  /* The README used to say "two JSON files" and print two curl lines. Both were true on the day
     they were written and neither knew about a third cohort. A reader who takes the register at
     its word gets a silently partial copy — worse than a broken link, because it looks complete
     and its tally will not match the site's. */
  const readme = readFileSync("README.md", "utf8");
  const published = [...readme.matchAll(/raw\.githubusercontent\.com\/[^\s]*?\/docs\/research\/([^\s`]+\.json)/g)]
    .map((m) => m[1]!);
  const expected = cohortFiles();
  expect([...published].sort(), `README publishes ${published.length} cohort URLs, cohorts.json lists ${expected.length}`)
    .toEqual([...expected].sort());
});
