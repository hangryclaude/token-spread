<!-- The first time this register was pointed at its own passing column. -->

# The passing column, audited — 71 becomes 59

**226 entries · 59 pass · 51 on the provider's word · 68 rejected · 48 unresolved.**

The register sells one thing: a passing column small enough to be true. Until 2026-08-18, **69 of
its 71 passes had never been adversarially challenged.** The two that had were challenged on the
day they were written.

Two sweeps that did apply that test killed five of six proposed passes, twice. Nobody had ever
pointed it at the entries already published.

## What it cost

| | |
|---|---:|
| passes audited | 69 |
| graded clean by triage, never actually attacked | 33 |
| escalated to two independent refuters | 36 |
| survived both attacks unanimously | **21** |
| overturned by both refuters | 9 |
| split 1-1, sent to a third judge | 6 |
| **passes withdrawn** | **12** |
| passes narrowed in scope but kept | 3 |

**Only 21 of 69 were proven under fire.** The 33 graded "clean" were cleared by a single triage
pass and never attacked — that is *unverified*, not *verified*, and this brief will not call it
anything else.

The published pass count falls from **71 to 59**.

## The three findings that matter more than the count

### 1. A quote in this register does not exist in the source it cites

Entry 74 opened with *"Independently verified this session"* and presented two phrases in
quotation marks: *'purely a serving-side directive — not rendered into the model's context'* and
*'stripped out before processing'*.

`platform.claude.com/docs/en/build-with-claude/prompt-caching` was fetched as raw HTML on
2026-08-18 — 2,370,690 bytes — by two independent refuters and again by the maintainer with a
third instrument. `serving-side`: **0 hits**. `stripped out`: **0 hits**. The control phrase
`no effect on output`: 2 hits, so the page is the right page and the search works.

This register rejected an outside submission on 2026-08-12 for exactly this — a paraphrase
dressed as a quote. It was sitting in the passing column the whole time, under a claim of
verification.

### 2. "Outside the content string" was never a proof of invisibility

The register's central lever is `cache_control` (id 164). Its identity argument was that the
field sits outside the content string and is therefore not read by the model.

`role` is a same-schema counterexample. It sits outside the content string and the model
demonstrably reads it. Position in the request JSON proves nothing about visibility.

The pricing and mechanics survive intact and re-verified — 1.25x five-minute write, $2/MTok
one-hour write, 0.1x read, four breakpoint slots, all verbatim on the live page. What does not
survive is the claim that we *know* the model cannot see the marker. Absent a measurement, that is
Anthropic's documented assertion, and this register caps a provider's assertion at
`CONTRACTUAL_ONLY`. Applied here to its own most important row.

### 3. The characteristic failure is not fabrication — it is epistemic laundering

Nearly every quote checked out verbatim against a live fetch. This register does not invent
sources. What it does is **silently upgrade real documentation from "the provider's word" to
"structural proof" without anyone measuring the wire.**

Of the flags raised in triage, P1 — a documentation sentence doing a structural argument's job —
was the most common at 17, with P5 (a citation gone stale) at 14 behind it. The deciding question
in nearly every demotion was the same: *did the request leave the customer's machine?* If it did,
and the provider says it discarded, deduplicated or declined to bill it, that is the provider's
word however plainly it reads.

## The twelve withdrawn

| id | was | now | why, in one line |
|---:|---|---|---|
| 38 | PASS_ABSOLUTE | **FAIL** | the ledger is written by the caller whose crash it exists to survive |
| 124 | PASS_ABSOLUTE | **FAIL** | no cited source at all; a heuristic about a deployment, not a mechanism |
| 39 | PASS_ABSOLUTE | **INSUFFICIENT_EVIDENCE** | rescued by a citation the entry itself never contained |
| 138 | PASS_REPLAY | **INSUFFICIENT_EVIDENCE** | a pattern nobody built or observed; its own fields convict it |
| 36 | PASS_ABSOLUTE | **CONTRACTUAL_ONLY** | AWS says it dedupes server-side; nobody measured it |
| 74 | PASS_METADATA | **CONTRACTUAL_ONLY** | the quote is not in the source |
| 92 | PASS_ABSOLUTE | **CONTRACTUAL_ONLY** | billed-count parity is not token-sequence identity |
| 159 | PASS_ABSOLUTE | **CONTRACTUAL_ONLY** | the cited issue is still open and unconfirmed |
| 164 | PASS_METADATA | **CONTRACTUAL_ONLY** | see finding 2 |
| 176 | PASS_ABSOLUTE | **CONTRACTUAL_ONLY** | a classifier ran, so "no request was ever sent" cannot apply |
| 177 | PASS_ABSOLUTE | **CONTRACTUAL_ONLY** | a statement about a future price cannot be measured yet |
| 178 | PASS_ABSOLUTE | **CONTRACTUAL_ONLY** | Anthropic's own account of how it bills a PDF page |

Three more kept their verdict and had their scope moved into their name, the remedy set at ids 187
and 220: **102** (AWS Marketplace private offers — Marketplace-listed models only, not flagship
Claude or EDP), **125** (cost tagging — header and log capture only, excluding any tag a gateway
also enforces budgets against), and **126**, which was *upheld* at `PASS_ABSOLUTE` by a third
judge on a genuinely structural argument: a spend cap is a binary gate with no
delivered-but-different branch, so the worst case is no answer at all, and none of the bar's three
questions has anything to apply to. That is what a real pass looks like standing next to eleven
that were not.

## Entries that came out stronger

An audit that only subtracts is not an audit. Four entries are better sourced than before they
were attacked: **152**, whose demotion had claimed Anthropic's billing docs were silent on
streaming disconnects — a refuter found the actual Help Center page and upgraded it from
`inferred` to a dated primary source; **9** and **175**, which survived dependency-skipped
challenges because someone read the suspect library's source instead of trusting a paraphrase; and
**148**, whose missing citations were traced back to an upstream research file and restored.

## The open finding: this is not finished

Three judges, deciding different entries without conferring, arrived at the same systemic
conclusion.

The judge on id 164 named fifteen sibling entries resting on the identical "outside the content
string, therefore invisible" argument: **ids 9, 10, 11, 42, 60, 61, 68, 82, 83, 98, 141, 166, 168,
173** — and 74, already withdrawn. The judge on id 177 reported that of the 30 `PASS_ABSOLUTE`
entries it examined, **18 rest on primary-doc, release-notes or pricing-page provenance and nothing
else**.

None has been individually re-litigated, and this brief does not claim they are wrong — the judge
that raised it was explicit that some may have a stronger basis it did not check. The claim is
narrower and worse: **the burden that just failed for id 164 is the burden every one of them still
has to clear, and nobody has asked them to.**

So 59 is not a floor. It is the number that survives the audit actually performed, and the next
audit has a named list to start from.

## What this audit could not do

- **Nothing was measured.** Every finding here is source-reading. No request was sent, no response
  byte-diffed, no invoice line read. P1 — the most common failure — is precisely the pattern only
  a measurement settles, and settling it needs an `ANTHROPIC_API_KEY` this project does not have.
- **33 entries were never attacked.** Triage cleared them on one pass. They are unverified, and
  the table above says so rather than folding them in with the 21 that were tested.
- **The six splits were decided by one judge each.** Better than leaving them tied, weaker than
  the two-refuter standard applied everywhere else in this audit.
