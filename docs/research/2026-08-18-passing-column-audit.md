<!-- The first time this register was pointed at its own passing column. -->

# The passing column, audited — 71 becomes 47

**226 entries · 47 pass · 61 on the provider's word · 69 rejected · 49 unresolved.**

> **Rounds two and three, same day.** This brief was first written after 36 of 69 passes had been attacked
> and reported 59. The other 33 — the ones triage had cleared *without* attacking — were then
> attacked too, and the number fell again to **49**. Round three then grepped every quoted string
> in the register against the source it cites and found 22% of them defective, taking it to
> **47**. Everything below is preserved as first written; the two sections at the end record what
> changed, including a finding that **rebuts this brief's own headline argument.**

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

---

# Round two — the 33 that were never attacked

The section above closed by admitting that 33 entries had been "cleared by a single triage pass
and never attacked", and counted them as unverified. That gap is now closed. Each of the 33 got
two independent refuters, and the ten that split 1-1 got a third judge, as did the six from
round one.

**Every pass in this register has now faced two independent adversaries.** The count falls from
59 to **49**.

| | |
|---|---:|
| attacked in round two | 33 |
| survived both refuters | 20 |
| overturned by both | 3 |
| split 1-1, decided by a third judge | 10 |
| of those splits, upheld | 3 |
| **withdrawn in round two** | **10** |

## This brief's own headline argument was wrong

Round one demoted `cache_control` (id 164) on the claim that "outside the content string" proves
nothing, because `role` is a same-schema counterexample the model demonstrably reads. That
argument was promoted here as the audit's second-biggest finding, and it was named as the burden
fifteen sibling entries would have to clear.

It does not survive. Refuters examining those siblings rejected the counterexample as
non-transferring, and they are right: **`role` is serialised into the chat template and becomes
input tokens — which is exactly why the model reads it — whereas `cache_control` is never
concatenated into any text value.** That is a structural distinction, not a positional one.

Tested against the nine entries named in advance, the argument scored one clean kill, three clean
survivals, three live disputes, and two failures attributable to something else entirely. The
prediction was wrong on the numbers, and ids 25 and 42 were **upheld** on exactly the reasoning
this brief had dismissed.

The register over-corrected, and this is the correction to the correction.

## Which makes the real finding worse, not better

Entry 164's demotion stands — on a ground nobody had checked when it was first demoted. A judge
re-fetching the page independently (2,370,690 bytes; control phrases `cache_control` 239 hits,
`ephemeral` 187) found that **every distinctive fragment of its core quote returns zero hits**,
under the words "Directly confirmed this session": `serving/pricing directive` 0,
`purely a serving` 0, `not read by the model as content` 0, `stripped out before processing` 0.

That is the same invented phrasing as entry 74. Two of this register's most load-bearing entries
quoted a page that does not contain their quotes.

**Five entries have now been caught this way in one week:**

| id | what was wrong with the quote |
|---:|---|
| 74 | two phrases, zero hits, under "Independently verified this session" |
| 164 | four fragments, zero hits, under "Directly confirmed this session" |
| 60 | zero hits on the cited page and on two other candidate pages |
| 166 | a splice — two bullets from different sections welded into one sentence |
| 114 | **inverted** — cited AWS as restricting eligibility; AWS expanded it |

Entry 114 is instructive about proportion: the inverted quote sat in an auxiliary `trap` field,
not in the sentence the verdict rests on, so the judge struck the false claim and **kept** the
`PASS_ABSOLUTE`. Failing a structurally sound entry over a bad caveat would have been the mirror
of the over-correction above.

## What the register is now worth, in a sentence

The round-two synthesis was asked for a sentence a sceptical customer would accept, and this is
what it wrote:

> "About three in five of these entries survive when two people check them independently the same
> way; the rest are either wrong or a coin flip depending who you ask, and at least three were
> caught citing text that isn't on the page they claimed to have verified — so a PASS in this
> column is not evidence, it's a starting point."

That is harsher than anything the site says, and it is the honest characterisation.

## Still not done

- **Nothing has been measured.** Still no `ANTHROPIC_API_KEY`. Every P1 demotion in both rounds —
  the most common failure by a wide margin — is exactly the class a single measurement settles.
  The register cannot get past "the provider says so" without one.
- **The 12 entries withdrawn in round one were not re-run** through round two's two-refuter check.
  Round one's method was triage-then-escalate; round two attacked everything. The withdrawals are
  not held to the same standard as the survivors.
- **The quote-integrity check has never been run across the whole register.** Five fabrications
  were found by refuters who happened to be looking at those entries. Nobody has grepped all 226
  entries' quotes against their sources, and on this week's hit rate there is no reason to assume
  the remaining ones are clean.

---

# Round three — every quoted string, grepped against its source

Round two closed by naming the last untested surface: "the quote-integrity check has never been
run across the whole register. Five fabrications were found by refuters who happened to be
looking at those entries. Nobody has grepped all 226 entries' quotes against their sources."

Now somebody has. **106 entries carry a quoted string and a fetchable source. 22% of them cite
text that is not in the source they name.** The pass count falls from 49 to **47**.

## The instrument was tested before its results were believed

Four entries already known to carry defective quotes — 74, 164, 60 and 166 — were seeded into
the batch without telling the agents which. The report was instructed that if the sweep missed
its own controls, it must say so first and must not report a clean bill of health.

**It caught three of four.** 74, 164 and 60 came back `absent`. **166 was missed** — its splice
was classified as harmless connective prose. The reporter led with that rather than burying it:

> "A known-bad control got waved through as harmless connective prose. That's a real gap in the
> instrument, not a clean sweep — 3 of 4, not 4 of 4."

So the 22% below is a floor. An instrument that misses a quarter of its known positives is not
finding everything.

The first attempt at this sweep failed outright — a bug passed the id list as a string, every
batch died, and the result came back empty. The same control design caught that too: the reporter
re-fetched the page itself, reproduced all four controls at zero hits, and opened with "The sweep
is unreliable." An empty result was not allowed to read as a clean one.

## What 22% is made of

| outcome | entries |
|---|---:|
| absent — the string is not on the page in any form | 13 |
| spliced — real fragments welded into a quotation the source never made | 9 |
| unreachable — a JavaScript-rendered page curl cannot see | 1 |

The unreachable one is excluded from the denominator rather than counted as a pass. 23 of 105
checkable, and 24 with the missed control.

Two defective passes were withdrawn, on the precedent set at id 164 — a quotation that does not
exist decides the entry regardless of whether the mechanism is sound:

- **44** cited "the same 75% token discount" against a Gemini pricing page where the string does
  not appear and every live figure computes to 90%. An earlier correction fixed the number; this
  one records that the string was never there.
- **66** attributed "don't see evidence of widespread issues" to two companies. The article
  carries two separate paraphrases — Anthropic's "does not see signs that overbilling is a
  widespread issue" and OpenAI's "has no evidence that those issues are happening among its
  customers" — neither presented as a direct quote. The entry welded a clause from each into a
  joint denial that nobody made.

Five passes kept their verdict and gained a correction: **61** (right figure, wrong page), **102**
(dropped "Seller" from a program name), **120** (silently dropped "now"), **220** (two real
fragments joined), and **126**, which is recorded as *contested* rather than resolved — see below.

## The two shapes, and the one that is not a defect

**Invented numbers** are the worst of it. id 50 cited throughput figures absent from the Mooncake
paper, whose actual numbers are "up to a 525% increase", a "50% to 525%" enhancement and "75% more
requests". id 225 quoted a range of "29-39%" that spans two different figures for two different
configurations in one sentence. id 214 presented three paraphrases of SDK behaviour as
quotations from source files that contain none of them.

**Splices** run from serious to pedantic, and the brief distinguishes them rather than banking the
count. id 77 joined a page's SEO meta description to a body paragraph as one continuous quote —
serious, because one half is never rendered to a reader. id 99 dropped "(response_format)" and
"in the input JSONL file" from the middle of two adjacent sentences with the ellipses honestly
marked and the meaning intact — a splice by this register's own definition, and close to
harmless. Both are recorded; only the register's definition is applied, not a feeling about
severity.

**And most of what the sweep surfaced was not a defect at all.** 59 of 106 entries came back
`not-a-source-quote`, because the extraction that fed this sweep split on apostrophes and
captured the register's own prose — "Anthropic's...", "the candidate's..." — as though it were
quoted material. That is a bug in the harness, not in the register, and the agents identified it
themselves rather than reporting a scandal.

## One finding is a conflict, and it is left open

id 126's quoted string returned zero hits, and the page's nearby language concerns self-set
spend-limit notifications rather than tier spend caps. That contradicts the round-one tiebreak
judge, which re-fetched the same page and reported "Once you reach your tier's spend cap, API
usage pauses until the next month" verbatim, with control phrases.

Two agents, the same method, the same page, opposite results. The `PASS_ABSOLUTE` stands, because
the structural argument that decided it — a spend cap is a binary gate with no
delivered-but-different branch — does not depend on the disputed string. The disagreement is a
finding about this audit's reliability, and it is recorded rather than resolved.

## Where the register stands

**226 entries · 47 pass · 61 on the provider's word · 69 rejected · 49 unresolved.**
**55 entries carry a correction, 63 in total, every one appended and none edited away.**

The passing column has gone 71 → 59 → 49 → 47 in a single day, and every step was the register
finding something wrong with itself rather than someone else finding it.

## Still open, and now more precisely

- **87 entries cite no source at all.** No quote sweep can ever check them. That is 38% of the
  register, uncheckable by construction, and it has never been stated on the site.
- **The sweep only asks whether a bracketed fragment is a substring.** Once a string was bucketed
  `not-a-source-quote`, the claim around it went unchecked. id 185's fabricated DeepSeek prices
  were caught only because one agent chose to keep going.
- **Nothing is measured.** Still no `ANTHROPIC_API_KEY`. Every P1 demotion across all three
  rounds is the class a single measurement would settle.
- **The instrument misses roughly a quarter of what it looks for**, on its own control data.
