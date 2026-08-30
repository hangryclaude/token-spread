import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cohortFiles, RESEARCH_DIR, type Entry } from "/Users/angus/dev/token-spread/src/register/load";

/** Round two of the 2026-08-18 audit: the 33 passes triage had cleared without attacking. */

const D = "2026-08-18";
type Kind = "withdrawn-from-passing" | "verdict-changed" | "source-corrected" | "superseded";
interface Change { verdict?: string; name?: string; corrections: { kind: Kind; note: string }[] }

const FAB = (what: string) =>
  `A quoted string in this entry does not appear in the source it cites. ${what} The page was ` +
  `re-fetched as raw HTML on 2026-08-18 with a control phrase reported alongside, so a zero result ` +
  `cannot be a broken fetch. This is the fifth entry found this way in one week; see the ` +
  `2026-08-18 audit brief.`;

const CHANGES: Record<number, Change> = {
  // ── overturned by both refuters ─────────────────────────────────────────────────
  10: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Withdrawn on the second round of the passing-column audit. The langchain middleware mechanism was verified accurate against the library's own source. What fails is the tier: the entry's support for cache_control being unread is the docs sentence 'Prompt caching has no effect on output token generation', which is an OUTCOME claim, while the entry asserts a MECHANISM claim ('stripped before the model sees content') that appears nowhere on the page. Provider's word, no measurement.",
    }],
  },
  60: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [
      { kind: "source-corrected", note: FAB("The entry presents 'does not alter model behavior, outputs, or reasoning' as verified against Anthropic's documentation; it returns zero hits on the cited page and on two other candidate Anthropic pages, confirmed independently by two refuters.") },
      { kind: "withdrawn-from-passing", note: "Withdrawn as a consequence: with the fabricated quote struck, only a cost-only documentation sentence remains to support a claim about token-content invariance." },
    ],
  },
  76: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Withdrawn on the second round of the audit. Both refuters verified the quotes verbatim against the live source — the sourcing was sound. The verdict was not: the claim rests on the provider's account of its own internal handling, with no measurement.",
    }],
  },

  // ── 1-1 splits, decided by a third judge ────────────────────────────────────────
  11: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Split 1-1 and demoted by a third judge. msglm's source was fetched and the mechanism confirmed exactly: it only ever sets a cache_control sibling key and never touches a text value. But the entry supplies no independent evidence for the field being unread — its own verifiedAgainst leans on 'an already-established-safe Anthropic field', a status the parent entry (id 164) lost the same day. A thin wrapper inherits its parent's evidentiary standing, including when that standing falls.",
    }],
  },
  25: {
    name: "Model-capability gate instead of a hard-coded model-ID allowlist for enabling cache_control — scoped to field position outside tokenized content, not to response identity",
    corrections: [{
      kind: "superseded",
      note: "Split 1-1 and UPHELD at PASS_METADATA by a third judge, with the scope narrowed. The judge re-fetched the live page (control phrase 'cache_control', 239 hits) and found the entry does not need the behavioural-equivalence sentence it leans on: the docs' own code samples show cache_control as a sibling JSON key alongside model, max_tokens, system and messages in all 55 examples, never concatenated into a text value. That is a schema fact, directly inspectable, and it answers all three prongs of the bar without trusting an output-fidelity promise. The name is narrowed because the entry's own line — 'the answer is unaffected either way' — claims more than is needed or shown.",
    }],
  },
  42: {
    name: "Anthropic Prompt Caching (cache_control breakpoints, automatic mode)",
    corrections: [{
      kind: "superseded",
      note: "Split 1-1 and UPHELD at PASS_METADATA by a third judge, which checked the quote first: the entry's cited sentence returns 2 verbatim hits, and the numeric claims — 10% read price, 1.25x/2x write multiples, and all four 512/1,024/2,048/4,096 minimums — are present and unchanged. The judge then read the mechanism section rather than trusting either refuter, and found the invalidation table keys off content at each hierarchy level and not off cache_control's presence, which is a structural basis independent of the 'identical response' assurance. It also drew the distinction that decides this family: role is serialised into the chat template and becomes input tokens, which is why position proves nothing for role; cache_control has no analogous job at generation time.",
    }],
  },
  81: { verdict: "CONTRACTUAL_ONLY", corrections: [{ kind: "withdrawn-from-passing", note: "Split 1-1 and demoted by a third judge on the register's evidentiary cap: the claim rests on the provider's documentation of its own behaviour rather than on a measurement or on the request never being sent." }] },
  83: { verdict: "CONTRACTUAL_ONLY", corrections: [{ kind: "withdrawn-from-passing", note: "Split 1-1 and demoted by a third judge. Same cluster and same defect as ids 10 and 11: the field-invisibility claim is supported by provider documentation alone." }] },
  94: { verdict: "CONTRACTUAL_ONLY", corrections: [{ kind: "withdrawn-from-passing", note: "Split 1-1 and demoted by a third judge on the evidentiary cap — a documentation sentence about provider-side behaviour, with no measurement behind it." }] },
  136: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [
      { kind: "source-corrected", note: FAB("A refuter grepping the live page found the entry's quoted string absent as quoted.") },
      { kind: "withdrawn-from-passing", note: "Split 1-1 and demoted by a third judge." },
    ],
  },
  154: {
    verdict: "INSUFFICIENT_EVIDENCE",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Split 1-1 and demoted by a third judge. The cited Bifrost issue is real and open, and the repository is active — but a single unresolved bug report is not a settled mechanism, and the entry read as though it were.",
    }],
  },
  166: {
    verdict: "FAIL",
    corrections: [
      { kind: "source-corrected", note: FAB("The entry's second quote is a splice: two bullets from two different sections of the same page welded into one sentence, with 'for example' silently dropped. The first quote ('Cache breakpoints themselves don't add any cost') is genuine and returns 1 hit; the composite does not exist.") },
      { kind: "withdrawn-from-passing", note: "Split 1-1 and failed by a third judge, which re-fetched the page itself (control phrases 'prompt caching' 67 hits, 'cache_control' 239) and reproduced the splice independently rather than taking a refuter's word for it." },
    ],
  },
  114: {
    name: "AWS Marketplace private offer drawing down an existing EDP/PPA commitment — the trap's 'fully deployed on AWS infrastructure' eligibility restriction is struck as inverted",
    corrections: [{
      kind: "source-corrected",
      note: "Split 1-1 and UPHELD at PASS_ABSOLUTE by a third judge, with a fabricated claim struck from its name. The mechanism is sound and structural: a private offer decides which committed-spend ledger an already-incurred charge settles against, and changes nothing on the wire. But the entry's trap field carried an INVERTED quote — it cited a May 2025 AWS change as restricting Marketplace eligibility to workloads 'fully deployed on AWS infrastructure', when that change EXPANDED eligibility to non-AWS, hybrid and on-premises deployments. The false material sat in an auxiliary caveat rather than in the sentence the verdict rests on, so the remedy is to strike it rather than to fail a structurally sound entry over a bad caveat.",
    }],
  },

  // ── verdict already correct, recorded reason was not ────────────────────────────
  164: {
    corrections: [{
      kind: "source-corrected",
      note: "The demotion recorded above stands, but the reason given for it was wrong and is corrected here rather than edited away. That note demoted this entry on the argument that 'sits outside the content string' proves nothing because role is a same-schema counterexample. Sibling refuters subsequently rejected that counterexample as non-transferring, and they are right: role is serialised into the chat template and becomes input tokens, which is precisely why the model reads it, whereas cache_control is never concatenated into any text field. The register over-corrected. The demotion survives on a different and far more serious ground, reproduced independently on 2026-08-18 against a fresh raw-HTML fetch (2,370,690 bytes; control phrases 'cache_control' 239 hits, 'ephemeral' 187): every distinctive fragment of this entry's core quote, presented under 'Directly confirmed this session', returns ZERO hits — 'serving/pricing directive' 0, 'purely a serving' 0, 'not read by the model as content' 0, 'stripped out before processing' 0. The bare word 'stripped' appears four times, all in an unrelated passage about thinking blocks. This is the same invented phrasing found in entry 74. The right verdict for the wrong reason is still a defect, and this is the correction.",
    }],
  },
};

const cohorts = cohortFiles().map((f) => ({ f, entries: JSON.parse(readFileSync(join(RESEARCH_DIR, f), "utf8")) as Entry[] }));
const seen = new Set<number>();
for (const c of cohorts) {
  for (const e of c.entries) {
    const ch = CHANGES[e.id];
    if (!ch) continue;
    seen.add(e.id);
    if (ch.verdict) e.strictVerdict = ch.verdict as Entry["strictVerdict"];
    if (ch.name) e.name = ch.name;
    e.corrections = [...(e.corrections ?? []), ...ch.corrections.map((k) => ({ date: D, ...k }))];
  }
}
const missing = Object.keys(CHANGES).map(Number).filter((id) => !seen.has(id));
if (missing.length) { console.error(`ids not found: ${missing.join(", ")}`); process.exit(1); }
for (const c of cohorts) writeFileSync(join(RESEARCH_DIR, c.f), JSON.stringify(c.entries, null, 2) + "\n");
console.log(`applied ${Object.keys(CHANGES).length} changes`);
