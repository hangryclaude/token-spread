import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

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

/* Two cohorts, kept in separate files on purpose. The 176 were adjudicated by one process in
   August; the addendum is what nine later sweeps produced, each entry re-verified against its
   primary source by hand before being written down. Merging them into one file would lose which
   process produced which verdict, and that provenance is the thing being sold. Merging them for
   the published TALLY is right, because a reader counting techniques does not care which week
   they were judged in — but the ids must not collide, which is what the test below enforces. */
const COHORTS = [
  "docs/research/2026-08-10-verdicts-final.json",
  "docs/research/2026-08-12-addendum.json",
];
type Entry = { id: number; strictVerdict: string; name: string };
const entries: Entry[] = COHORTS.flatMap((f) => JSON.parse(readFileSync(f, "utf8")) as Entry[]);

test("no two register entries share an id", () => {
  // Two cohorts numbered independently would silently double-count or overwrite on any future
  // merge, and the published total is derived from length rather than from max(id).
  const ids = entries.map((e) => e.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  expect(dupes, `duplicate register ids across cohorts: ${dupes.join(", ")}`).toEqual([]);
});

const tally = (v: string) => entries.filter((e) => e.strictVerdict === v).length;
/* "Pass the bar" is the four classes where identity is demonstrable. CONTRACTUAL_ONLY is
   deliberately not among them — the provider asserts neutrality and we cannot verify it — which
   is exactly why it needs its own published number rather than being folded in or dropped. */
const PASSING = ["PASS_ABSOLUTE", "PASS_METADATA", "PASS_SCHEDULING", "PASS_REPLAY"];
const counts = {
  total: entries.length,
  pass: PASSING.reduce((n, v) => n + tally(v), 0),
  contractual: tally("CONTRACTUAL_ONLY"),
  rejected: tally("FAIL"),
  unresolved: tally("INSUFFICIENT_EVIDENCE"),
};

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
};

for (const [page, reader] of Object.entries(READERS)) {
  test(`${page} publishes the counts the data actually holds`, () => {
    const html = readFileSync(page, "utf8");
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
