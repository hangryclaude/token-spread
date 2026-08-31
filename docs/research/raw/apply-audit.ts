import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cohortFiles, RESEARCH_DIR, type Entry } from "/Users/angus/dev/token-spread/src/register/load";

/**
 * Apply the 2026-08-18 audit of the passing column to the cohort files in place.
 *
 * SCHEMA.md is the contract: corrections are APPENDED, never edited away, and the original
 * reasoning stays in place above them. So nothing here rewrites a `reasoning` field — a demoted
 * entry keeps the argument that was made for it, and the correction says why it no longer holds.
 * That is the whole point: a reader can see what we believed and what changed our mind.
 */

const D = "2026-08-18";
type Kind = "withdrawn-from-passing" | "verdict-changed" | "source-corrected" | "superseded";
interface Change { verdict?: string; name?: string; verifiedAgainst?: string; corrections: { kind: Kind; note: string }[] }

const CHANGES: Record<number, Change> = {
  // ── demoted: both refuters overturned ────────────────────────────────────────────
  38: {
    verdict: "FAIL",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Withdrawn on audit of the passing column. The flaw is internal and needs no external source: the entry defines its own failure window as the orchestrator crashing between create() succeeding and the caller durably recording that fact — and the ledger it proposes is written by that same caller, so the ledger cannot record what the crash prevented recording. Two independent refuters reached this from the entry's own two sentences.",
    }],
  },
  124: {
    verdict: "FAIL",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Withdrawn on audit of the passing column. The entry cites no source at all — provenance is 'inferred' and savings is 'UNQUANTIFIED — no named case study, pattern-matched from general FinOps-for-AI commentary'. Its own telemetrySignal describes detecting a periodic cadence with no consumer, which is a heuristic about a deployment rather than a property of a mechanism: where the job's output was in fact read by someone, stopping it is zero thinking where some was intended.",
    }],
  },
  138: {
    verdict: "INSUFFICIENT_EVIDENCE",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Withdrawn on audit of the passing column. The entry's own fields convict it: provenance 'inferred', and verifiedAgainst 'not re-verified — this is a provider-agnostic architectural pattern'. PASS_REPLAY is defined as a stored response hash-matching a byte-identical repeat; this entry describes a pattern nobody built or observed, and its safety rests on 'provided the implementation genuinely hashes the FULL request' — a condition no mechanism here enforces. Same conditional shape that failed BullMQ at id 189 and Sidekiq at id 216.",
    }],
  },
  159: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Withdrawn on audit of the passing column. Both refuters re-fetched the cited source independently (gh issue view 81869 --repo anthropics/claude-code) and found state=OPEN, closedAt=null: a single unresolved customer report, treated by the entry as an established billing-classification fact. Anthropic has not confirmed it.",
    }],
  },
  36: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Withdrawn on audit of the passing column. Both refuters re-fetched docs.aws.amazon.com as raw HTML and confirmed the quotes are verbatim and current — the sourcing was never the problem. The verdict was: clientRequestToken is sent to AWS and AWS states it deduplicates server-side, which is the provider's word about the provider's internals with no measurement behind it. Same correction, same reason, as AWS SQS FIFO at id 190.",
    }],
  },
  178: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Withdrawn on audit of the passing column. Re-fetched platform.claude.com/docs/en/build-with-claude/pdf-support as raw HTML on 2026-08-18: every quote is verbatim and unchanged. The demotion is not about the quotes — it is that a documentation sentence describing Anthropic's own internal billing of a PDF page was carrying a PASS_ABSOLUTE, which the register's rule caps at CONTRACTUAL_ONLY.",
    }],
  },
  74: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [
      {
        kind: "source-corrected",
        note: "The two phrases this entry presents in quotation marks — 'purely a serving-side directive — not rendered into the model's context' and 'stripped out before processing' — DO NOT APPEAR in the source it cites. platform.claude.com/docs/en/build-with-claude/prompt-caching was fetched as raw HTML on 2026-08-18 (2,370,690 bytes) by two independent refuters and again by the maintainer with a third instrument; 'serving-side' returns 0 hits and 'stripped out' returns 0 hits, while the control phrase 'no effect on output' returns 2, so the page is the right page and the search works. The entry also opens 'Independently verified this session', which is not true of those strings. This is a paraphrase dressed as a quote — the exact failure this register rejected an outside submission for on 2026-08-12, found here in its own passing column.",
      },
      {
        kind: "withdrawn-from-passing",
        note: "Withdrawn from PASS_METADATA as a consequence of the above. The numeric claims are unaffected and were re-verified as current on 2026-08-18 — 0.1x read, 1.25x five-minute write, 2x one-hour write, and the non-monotonic per-model minimum-token table all appear verbatim on the live page. What is lost is the evidence that cache_control is structurally invisible to the model; without it this rests on Anthropic's general statement that caching has no effect on output generation, which is the provider's word.",
      },
    ],
  },


  // ── tiebreaks: a third judge, holding both prior arguments ───────────────────────
  92: {
    verdict: "CONTRACTUAL_ONLY",
    name: "Responses API previous_response_id — provider-asserted billing-token parity vs full manual resend (documentation only, never measured)",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Split 1-1 on audit; a third judge re-fetched developers.openai.com/api/docs/guides/conversation-state as raw HTML on 2026-08-18, confirmed the sentence verbatim and live, and demoted anyway. Nobody in the dispute — not the entry's author, neither refuter, nor the judge — captured a usage.input_tokens field from a real paired call. The judge also noted the bar asks whether the model reads a different SEQUENCE of tokens, while the documentation establishes only billed-COUNT parity. The judge selected FAIL from the enum offered but wrote that this means 'fails to sustain PASS_ABSOLUTE, landing at CONTRACTUAL_ONLY, not at zero credibility'; recorded here as the judge described it rather than as the enum forced it.",
    }],
  },
  39: {
    verdict: "INSUFFICIENT_EVIDENCE",
    name: "Conditional-write claim/revert for Bedrock batch orchestration — described mechanism, never built or measured",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Split 1-1 on audit and demoted by a third judge, which named the pattern: the refuter who rescued the pass did so by importing an external provider-documentation citation for a mechanism the entry itself never cited. A pass rescued by evidence the entry does not contain is not the entry's pass.",
    }],
  },
  164: {
    verdict: "CONTRACTUAL_ONLY",
    name: "Anthropic explicit cache_control breakpoints (write/read pricing, TTL, 4-breakpoint cap) — pricing and mechanics verified; model-invisibility is Anthropic's word",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Split 1-1 on audit and demoted by a third judge. The pricing and mechanics were re-fetched as raw HTML on 2026-08-18 and are verbatim and current: 1.25x five-minute write, $2/MTok one-hour write, 0.1x read, four breakpoint slots. What failed is the identity argument. The entry reasons that cache_control sits outside the content string and is therefore not read by the model — and `role` is a same-schema counterexample, a field outside the content string that the model demonstrably does read. Position in the request JSON is not proof of invisibility. Without a measurement, model-invisibility here is Anthropic's documented assertion, which the register caps at CONTRACTUAL_ONLY. See the 2026-08-18 audit brief: the judge flagged this as systemic across the caching-metadata cluster, not as one row.",
    }],
  },
  176: {
    verdict: "CONTRACTUAL_ONLY",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Split 1-1 on audit and demoted by a third judge, which re-fetched platform.claude.com/docs/en/release-notes and confirmed both quotes verbatim — sourcing was never the dispute. The reasoning: a request demonstrably WAS sent and processed, because a safety classifier ran on it to produce stop_reason 'refusal'. So the 'no request was ever sent' exemption cannot apply, leaving only a measurement, and there is none. The judge selected FAIL from the enum but argued the CONTRACTUAL_ONLY case; recorded as argued.",
    }],
  },
  177: {
    verdict: "CONTRACTUAL_ONLY",
    name: "Anthropic states Sonnet 5's 2026-09-01 price rise will not occur (documentation only; no invoice measured)",
    corrections: [{
      kind: "withdrawn-from-passing",
      note: "Split 1-1 on audit and demoted by a third judge. A statement about a future price is the provider's word about its own conduct and cannot be measured until the date passes. The same judge reported that of the 30 PASS_ABSOLUTE entries it examined, 18 rest on primary-doc, release-notes or pricing-page provenance with nothing else — recorded in the 2026-08-18 audit brief as an open systemic finding.",
    }],
  },
  126: {
    name: "Native budget alerts and hard spend caps — Anthropic direct API (org and workspace level); the Microsoft Azure/Foundry claim is unverified by the cited source",
    corrections: [{
      kind: "superseded",
      note: "Split 1-1 on audit and UPHELD at PASS_ABSOLUTE by a third judge, which re-fetched platform.claude.com/docs/en/api/rate-limits as raw HTML on 2026-08-18 and confirmed the spend-cap table and the sentence 'Once you reach your tier's spend cap, API usage pauses until the next month' verbatim. The structural argument that survived: a spend cap is a binary gate with no delivered-but-different branch — worst case is no answer at all, so none of the bar's three questions has anything to apply to. This is what distinguishes it from the provider's-word cases demoted alongside it. The scope is narrowed because the judge searched the cited page and found zero prose about Microsoft Foundry or Azure spend-cap mechanics; that provider claim was unverified by the entry's own source.",
    }],
  },

  // ── scope narrowed, verdict kept: both refuters converged on the same remedy ──────
  102: {
    name: "AWS Marketplace Seller Private Offers — Marketplace-listed third-party models only; does not cover flagship Claude or account-level EDP",
    corrections: [{
      kind: "superseded",
      note: "Narrowed on audit of the passing column, on the pattern used at ids 187 and 220: the scope moves into the name so the claim cannot be read wider than its evidence. Both refuters independently re-fetched docs.aws.amazon.com/marketplace/latest/userguide/private-offers.html as raw HTML on 2026-08-18 and confirmed the quote is unchanged, but the program it describes covers Marketplace-listed sellers. Flagship Claude pricing and account-level EDP were carried by the entry with no citable primary source.",
    }],
  },
  125: {
    name: "Tagging/attribution layer for showback → chargeback — header and log capture only; excludes any tag field a gateway also uses for budget enforcement, routing or caching",
    corrections: [{
      kind: "superseded",
      note: "Narrowed on audit of the passing column. The mechanism as described — identity captured at API-key issuance, headers injected at a proxy, endpoint and token counts logged — is structural and passes. What did not survive is the entry's coverage of gateway products by name: a refuter fetched docs.litellm.ai on 2026-08-18 and found that in LiteLLM a tag attached at key issuance is the same field its tag_budgets feature enforces spend against, so the tag stops being inert metadata and starts deciding whether a request is sent.",
    }],
  },

  // ── source corrections: verdict unchanged, the citation was wrong or stale ────────
  44: {
    verifiedAgainst: "ai.google.dev/gemini-api/docs/pricing (re-fetched as raw HTML 2026-08-18)",
    corrections: [{
      kind: "source-corrected",
      note: "The entry's own correction was itself stale and is now corrected in turn. It warned readers not to repeat a 90% figure and to use 75%, citing a googleblog.com post dated 2025-05-08. The live pricing page on 2026-08-18 lists Gemini 2.5 Pro context caching at $0.125 against a standard input price of $1.25, and 2.5 Flash at $0.03 against $0.30 — 90% off in both cases, computed from the current table, with no implicit/explicit distinction present on the page. The warning told customers the opposite of what the provider now publishes.",
    }],
  },
  23: {
    verifiedAgainst: "github.com/router-for-me/CLIProxyAPI issue 3398 (re-checked via gh 2026-08-18: still OPEN, filed 2026-05-14)",
    corrections: [{
      kind: "source-corrected",
      note: "Status re-checked on 2026-08-18. The cited issue is real and the repository is active (47,759 stars, pushed 2026-08-18), but the issue remains OPEN and unmerged — the entry read as though the behaviour it describes had been resolved.",
    }],
  },
  28: {
    verifiedAgainst: "github.com/BerriAI/litellm issue 27763 (re-checked via gh 2026-08-18: CLOSED as completed on 2026-05-12)",
    corrections: [{
      kind: "source-corrected",
      note: "Status re-checked on 2026-08-18. BerriAI/litellm#27763 was CLOSED as completed on 2026-05-12 — the same day it was filed, and roughly three months before this entry was written. The entry treats it as a live defect. The repository itself is healthy (56,665 stars, pushed 2026-08-18).",
    }],
  },
  84: {
    verifiedAgainst: "developers.openai.com/api/docs/guides/prompt-caching (fetched 2026-08-18 — the entry previously carried no source at all)",
    corrections: [{
      kind: "source-corrected",
      note: "The entry cited no source and recorded no verifiedAgainst, despite turning on model-version-gated numbers. Fetched on 2026-08-18: OpenAI's live documentation describes two separate parameters that this entry conflates into a single TTL story. A source is now recorded; the conflation is noted here rather than rewritten away, because the original reasoning stays as written.",
    }],
  },
  117: {
    verifiedAgainst: "claude.com/platform/marketplace (fetched 2026-08-18 — the entry previously carried no source at all)",
    corrections: [{
      kind: "source-corrected",
      note: "The entry named a specific Anthropic product and recorded no source. Fetched on 2026-08-18 and the mechanism is confirmed verbatim: 'If your organization has an existing Anthropic spend commitment, you can apply some of it towards Claude-powered partner solutions.' The verdict is unchanged; it now has a citation behind it.",
    }],
  },
  64: {
    corrections: [{
      kind: "source-corrected",
      note: "Flagged on audit for inheriting its verdict wholesale from id 42 without restating what was checked, and for a headline figure carried with no URL. Recorded rather than repaired: the underlying claim was not re-established this pass, and an entry that rests on another entry's undated verification is exactly the weakness the staleness report exists to surface.",
    }],
  },
  141: {
    corrections: [{
      kind: "source-corrected",
      note: "The Anthropic half re-verified as current on 2026-08-18 against the cited primary doc — 0.1x read, 1.25x five-minute write, 2x one-hour write all match. The OpenAI half does not: developers.openai.com/api/docs/guides/prompt-caching, fetched as raw HTML the same day, does not support the entry's characterisation. Recorded here; the original reasoning stands above it unedited.",
    }],
  },
};

const cohorts = cohortFiles().map((f) => ({ f, entries: JSON.parse(readFileSync(join(RESEARCH_DIR, f), "utf8")) as Entry[] }));
const seen = new Set<number>();

for (const c of cohorts) {
  for (const e of c.entries) {
    const change = CHANGES[e.id];
    if (!change) continue;
    seen.add(e.id);
    if (change.verdict) e.strictVerdict = change.verdict as Entry["strictVerdict"];
    if (change.name) e.name = change.name;
    if (change.verifiedAgainst) e.verifiedAgainst = change.verifiedAgainst;
    e.corrections = [...(e.corrections ?? []), ...change.corrections.map((k) => ({ date: D, ...k }))];
  }
}

const missing = Object.keys(CHANGES).map(Number).filter((id) => !seen.has(id));
if (missing.length) { console.error(`ids not found in any cohort: ${missing.join(", ")}`); process.exit(1); }

for (const c of cohorts) writeFileSync(join(RESEARCH_DIR, c.f), JSON.stringify(c.entries, null, 2) + "\n");
console.log(`applied ${Object.keys(CHANGES).length} changes across ${cohorts.length} cohort files`);
