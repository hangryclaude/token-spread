import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cohortFiles, RESEARCH_DIR, type Entry } from "/Users/angus/dev/token-spread/src/register/load";

/** The 2026-08-18 quote-integrity sweep: every quoted string grepped against its cited source. */

const D = "2026-08-18";
const SWEEP = "Found by the 2026-08-18 quote-integrity sweep, which fetched each cited source as raw HTML and grepped every quoted string with a control phrase reported alongside, so a zero hit count cannot be a failed fetch.";
type Kind = "withdrawn-from-passing" | "verdict-changed" | "source-corrected" | "superseded";
interface Change { verdict?: string; corrections: { kind: Kind; note: string }[] }

const c = (note: string, kind: Kind = "source-corrected") => ({ kind, note: `${SWEEP} ${note}` });

const CHANGES: Record<number, Change> = {
  // ── demoted: a fabricated quote decides the entry, per the precedent set at id 164 ──
  44: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [c("The quoted string 'the same 75% token discount' is not on ai.google.dev/gemini-api/docs/pricing in any form; '75%' occurs exactly once on the page, inside a CSS gradient rule. The live context-caching rows contradict it — Gemini 2.5 Flash $0.30 against $0.03 cached, 3.7 Flash $0.75 against $0.075, 2.5 Pro $1.35 against $0.135, all 90%. The earlier correction on this entry fixed the number; this one records that the string was never on the page at all. Withdrawn from the passing column on the precedent set at id 164: a quotation that does not exist decides the entry regardless of whether the mechanism is sound.", "withdrawn-from-passing")],
  },
  66: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [c("The quotation \"don't see evidence of widespread issues\" is a splice that neither company said. The article carries two separate paraphrases from two different companies — Anthropic's 'does not see signs that overbilling is a widespread issue' and OpenAI's 'has no evidence that those issues are happening among its customers' — and neither is presented by the article as a direct quote in the first place. Welding a clause from each into one quotation attributed to both is the most serious kind of splice: it manufactures a joint denial. Withdrawn from the passing column.", "withdrawn-from-passing")],
  },

  // ── passes kept; the citation is repaired, the verdict is not touched ──────────────
  61: { corrections: [c("The 90% and 85% figures return zero hits on the cited prompt-caching docs page. The underlying figures are real but live on a different, uncited Anthropic page. A correct number behind a wrong citation is still a wrong citation; the verdict is unaffected because the mechanism does not rest on the figure.")] },
  102: { corrections: [c("The quoted program name does not appear on the cited page in that casing; AWS's actual term is 'AWS Marketplace Seller Private Offer', including the word 'Seller'. A naming slip rather than a fabricated claim, recorded for completeness.")] },
  120: { corrections: [c("The quoted sentence silently drops the word 'now' from the middle of the source's 'Nonprofits are now eligible for a discount of up to 75% on Team and Enterprise plans.' The meaning is unchanged and the figure is correct; recorded because a quotation that has been tidied is no longer a quotation.")] },
  126: {
    corrections: [c("CONTESTED, and recorded as contested rather than resolved. The sweep reports that this entry's quoted string returns zero hits on the cited page, and that the page's nearby language concerns self-set spend-limit notifications rather than tier spend caps. That conflicts with the round-one tiebreak judge, which re-fetched the same page and reported the sentence 'Once you reach your tier's spend cap, API usage pauses until the next month' verbatim, with control phrases. Two agents with the same method reached opposite results on the same page. The PASS_ABSOLUTE stands because the structural argument that decided it — a spend cap is a binary gate with no delivered-but-different branch — does not depend on the disputed string. The conflict is a finding about this audit's own reliability and is left open.")] },
  220: { corrections: [c("The two quoted fragments both appear on the Google Cloud Tasks page but are not adjacent and come from different remarks; the entry joins them as one quotation. The scoping in the entry's name is unaffected and the mechanism claim stands.")] },

  // ── not in the passing column; the citation is repaired for the record ─────────────
  7: { corrections: [c("Two quoted strings return zero hits, including the model-invariance claim that would have been load-bearing had this entry been a pass. It is not, so nothing changes but the record.")] },
  34: { corrections: [c("Both phrases are on the page but the entry reverses their order and presents them as one quotation.")] },
  50: { corrections: [c("The cited throughput figures do not appear in the Mooncake paper. Its actual numbers are 'up to a 525% increase in throughput', a '50% to 525%' enhancement, and '75% more requests' under real workloads. The entry's range was invented.")] },
  77: { corrections: [c("The two halves are each verbatim but come from different places — one from the page's YAML frontmatter description, an SEO meta field never rendered as body text, and one from the opening paragraph. The ellipsis presents a meta tag and a body sentence as one continuous quotation.")] },
  99: { corrections: [c("Every word is present and in order within one contiguous note box, but two ellipses drop '(response_format)' and 'in the input JSONL file' from the middle of adjacent sentences to make them read as one. The meaning is unchanged and the ellipses are marked; recorded as a splice under this register's own definition rather than waved through.")] },
  155: { corrections: [c("The stop_sequences claim returns zero hits across the full issue body, both comments, and a repository-wide search. The issue discusses only max_tokens and finish_reason truncation.")] },
  182: { corrections: [c("The two fragments are separated on the page by a full JSON code example and a paragraph break; the entry joins them as one quotation.")] },
  199: { corrections: [c("Three separate bolded list headers are welded into one quoted sentence. Noted in the entry's favour: the second flagged string is the trap sentence this entry itself warns is a false web-search summary absent from Moonshot's documentation, and the sweep independently confirmed it absent — the entry was right about that.")] },
  214: { corrections: [c("Three strings presented as quotations from the cited SDK source appear nowhere in those files or either repository's README. They are paraphrases of what the code does, formatted as quotations.")] },
  221: { corrections: [c("Multiple quoted strings return zero hits on both the docs page and the GitHub repository, including a lead-in clause joined by ellipsis to real text — presenting an invented clause and a real one as a single quotation.")] },
  224: { corrections: [c("Both halves are individually verbatim on the live docs page but are not adjacent; the entry joins them into one quotation.")] },
  225: { corrections: [c("The quoted range '29-39%' appears nowhere. The blog carries two different real figures for two different configurations in the same sentence, and the entry's range spans them as though it were one measurement. A second quote drops 'to Claude that' from the middle of a docs sentence.")] },
};

const cohorts = cohortFiles().map((f) => ({ f, entries: JSON.parse(readFileSync(join(RESEARCH_DIR, f), "utf8")) as Entry[] }));
const seen = new Set<number>();
for (const co of cohorts) {
  for (const e of co.entries) {
    const ch = CHANGES[e.id];
    if (!ch) continue;
    seen.add(e.id);
    if (ch.verdict) e.strictVerdict = ch.verdict as Entry["strictVerdict"];
    e.corrections = [...(e.corrections ?? []), ...ch.corrections.map((k) => ({ date: D, ...k }))];
  }
}
const missing = Object.keys(CHANGES).map(Number).filter((id) => !seen.has(id));
if (missing.length) { console.error(`ids not found: ${missing.join(", ")}`); process.exit(1); }
for (const co of cohorts) writeFileSync(join(RESEARCH_DIR, co.f), JSON.stringify(co.entries, null, 2) + "\n");
console.log(`applied ${Object.keys(CHANGES).length} quote corrections`);
