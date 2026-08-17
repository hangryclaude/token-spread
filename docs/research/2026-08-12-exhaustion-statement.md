<!-- The answer to "find every method possible", written after the twelfth sweep, 2026-08-12. -->

# token-spread — Sweep 12 Merge Brief
Axes: subscription-arbitrage · non-english · newest-surfaces · workload-shape · hedging-and-insurance
Dedupe'd against `2026-08-10-verdicts-final.json` (176) + `2026-08-12-addendum.json` (8) = 184. All 21 survivors confirmed non-duplicate by name/mechanism.

---

## 1. New entries by tier

**Tally effect** (strict register, four-bucket count only — CHANGES_RESULTS and DO_NOT_TOUCH are excluded from this tally on purpose, see notes below each):

| | before | +new | after |
|---|---:|---:|---:|
| PASS (all pass classes) | 66 | +6 | **72** |
| CONTRACTUAL_ONLY | 27 | +3 | **30** |
| Rejected | 51 | +2 | **53** |
| Unresolved | 40 | +4 | **44** |
| **Total** | 184 | +15 | **199** |

### PASS_ABSOLUTE — new Family (enqueue-time dedup, sibling to Family E)

| id | Name | Quote | Note |
|---|---|---|---|
| 185 | K8s CronJob `concurrencyPolicy: Forbid/Replace` | kubernetes.io: *"if it is time for a new Job run and the previous Job run hasn't finished yet, the CronJob skips the new Job run"* | Time-overlap only — no content check. Passes only if the job is independently known idempotent. |
| 186 | BullMQ job deduplication (Simple Mode) | docs.bullmq.io: *"any subsequent job with the same deduplication ID will be ignored"* | taskforcesh/bullmq: 9,279★, MIT, pushed 2026-08-12. ID-gated, cleaner than 185. |
| 187 | AWS SQS FIFO `MessageDeduplicationId` | AWS docs: *"If you retry the SendMessage action within the 5-minute deduplication interval, Amazon SQS doesn't introduce any duplicates into the queue."* | Same mechanism family as 186. |
| 188 | Reservation amortization (pure accounting) | learn.microsoft.com: *"Amortization is the process of breaking the one-time cost into periodic costs... available only for reservations and savings plans."* | Nothing on the wire changes — recognition-timing only, applies to PTU reservations specifically. |

**Maintainer note:** 185–187 are three citations of one mechanism — *enqueue-time ID/hash dedup stops a duplicate LLM call before it's ever sent*. Register idiom (Family E) already keeps related items as separate rows, so kept separate here; collapse to one row with three citations if you'd rather.

### PASS_SCHEDULING

| id | Name | Quote | Caveat |
|---|---|---|---|
| 189 | gRPC retry throttling (token-bucket retry budget) | grpc.io: token_count/maxTokens/tokenRatio mechanism, *"retries are paused until the count recovers"* below half of maxTokens | Content-blind, real, shipping. But: (a) it's one client's aggregate retry budget, not the concurrent-caller thundering-herd problem id-158 named; (b) Anthropic/OpenAI's public APIs are HTTP — only actionable behind a gRPC gateway the customer runs themselves. |

### PASS_METADATA

| id | Name | Quote | Why it qualifies |
|---|---|---|---|
| 190 | Cache-write TTL flips 1h→5m on the subscription→usage-credit billing boundary | code.claude.com/docs/en/costs: *"The lifetime is an hour on a subscription and drops to five minutes once you're drawing on usage credits... on an API key or cloud provider, it's five minutes by default. You can keep the one-hour lifetime while drawing on usage credits by setting `ENABLE_PROMPT_CACHING_1H=1`."* | TTL is metadata the model never reads. Distinct mechanism from the register's existing "API-key auth requests 1h, silently granted 5m" entry — this one is billing-regime-triggered, with a named override env var. |

### CONTRACTUAL_ONLY

| id | Name | Quote | Cap reason |
|---|---|---|---|
| 191 | Team/Enterprise per-seat pricing as the sanctioned alternative to account sharing | claude.com/pricing: Standard $20/mo annual, Premium $100/mo annual ("5x more usage"), Enterprise "$20/seat" + API-rate usage | Procurement fact, not a request-identity technique — same cap class as batch/PTU. |
| 192 | DeepSeek on-disk context caching (default-on, no TTL ceiling) | api-docs.deepseek.com: *"enabled by default for all users... without needing to modify their code"*; cache clears "usually within a few hours to a few days"; *"The hard disk cache only matches the prefix part... The output is still generated through computation and inference."* v4-flash $0.0028/$0.14 (98% off), v4-pro $0.003625/$0.435 (99.2% off) | Output-neutrality is DeepSeek's own doc, never independently replayed — same evidentiary gap the register already applies to every provider's self-reported invariance claim. |
| 193 | Azure PTU Reservations — exit/cancellation mechanics | learn.microsoft.com (ms.date 2026-05-22): "Cancelable, with limits" table row; exchange page (ms.date 2026-07-22): $50,000/12-month cap, *"no early termination fee... in the future there might be a 12% early termination fee"* | New angle on already-registered base lever (ids 103, 112) — the exit mechanics specifically weren't covered. Still execution-tier, opt-in. |

### Rejected — new REFUTED findings (hedging axis)

| id | Name | Quote | Verdict |
|---|---|---|---|
| 194 | AWS Bedrock Provisioned Throughput has no exit | docs.aws.amazon.com: *"1 month – You can't delete the Provisioned Throughput until the one month commitment term is over... Billing continues until you delete the Provisioned Throughput."* | REFUTED — no cancellation, no exchange, no resale. It's a bet, not a hedge. |
| 195 | No EC2-RI-Marketplace-style secondary market exists for LLM capacity | docs.aws.amazon.com: *"Only Amazon EC2 Standard regional and zonal Reserved Instances can be sold... Reserved Instances for other AWS services, such as Amazon RDS and Amazon ElastiCache, cannot be sold in the Reserved Instance Marketplace."* | REFUTED structurally — Bedrock PT isn't an EC2 RI product, so it's categorically outside this marketplace's own eligibility text. |

These belong in "Rejected — and why it matters that they are": both premises (that a hedge/resale path exists for LLM capacity commitments) are plausible-sounding and now closed by the providers' own words, not by absence of search effort.

### INSUFFICIENT_EVIDENCE (unresolved)

| id | Name | What's missing |
|---|---|---|
| 196 | Automated/non-human access ban — does Claude Code's product docs satisfy Section 3's API-key carve-out for subscription logins | No source states this explicitly; it's the submitter's inference from adjacent, individually-true quotes. Needs an explicit Anthropic statement, not more doc-reading. |
| 197 | Moonshot/Kimi cache — no output-invariance statement anywhere in their docs | Thinner than Gemini's already-demoted analogous entry (id=93) — Kimi's doc describes only mechanism/threshold, zero invariance language. Needs live temp-0 diffs against their API. |
| 198 | PromptXRay (karminski) — read-only cache-hit diagnostic, 50★, MIT, active | The "never rewrites" guarantee is the tool's own self-description, not independently exercised against live traffic this sweep. |
| 199 | Who captures a mid-term list-price decrease on committed-spend/PTU agreements | Anthropic's and Azure's rate-change clauses are quoted correctly, but "no doc says X" isn't evidence that the answer is no — could be silent because it's handled off-doc in account-team negotiation. |

### CHANGES_RESULTS — separate tier, route to the Context Survival Register, not this tally

Five newest-surfaces findings are honest, well-sourced, and correctly self-labelled as *not* identity-preserving. They fail the strict bar by construction (each appends, deletes, or reprices tokens the model reads) but are real, documented, deliberate-tradeoff levers of the same shape the 2026-08-11 Context Survival Register already exists to hold. Recommend appending there rather than diluting "51 rejected" with entries submitted honestly rather than caught dishonestly:

| Name | One line | Source, verified 2026-08-12 |
|---|---|---|
| Mid-conversation system messages (GA) | New role:system content mid-conversation, by design changes model behavior from that point — same structure the register already failed as entry 73's sibling (tool-changes) | platform.claude.com/docs/.../mid-conversation-system-messages |
| Context management API (`clear_tool_uses_20250919`) | Deletes tool_result content, forces a fresh cache write on the gate | platform.claude.com/docs/.../context-editing |
| Memory tool (`memory_20250818`) | Agent reads back curated memory instead of full history; billed as ordinary tokens, no discount | platform.claude.com/docs/.../memory-tool |
| Computer use tool pricing + screenshot pruning | 466–499 sys-prompt tokens + 735/tool-def is a non-lever background fact; pruning old screenshots is the same deletion-of-visible-content mechanism the register already rejects for compaction | platform.claude.com/docs/.../computer-use-tool |
| Structured outputs (added tokens + cache invalidation on schema change) | More input tokens by construction; changing `output_config.format` invalidates cache | platform.claude.com/docs/.../structured-outputs |

**Correction to the submitted mid-conversation-system-messages finding:** it was submitted tagged `PASS` ("none-same-tokens, high confidence"). That's a misclassification — file it as CHANGES_RESULTS, not a pass, per the register's own precedent on the sibling tool-changes entry.

### DO_NOT_TOUCH — appendix, not the technique tally

Not techniques under adjudication; boundary facts. All three re-verified verbatim by direct fetch 2026-08-12 (not just taken on the sweep's word, since this section is going on the site):

- **Consumer Terms §2** — anthropic.com/legal/consumer-terms: *"You may not share your Account login information, Anthropic API key, or Account credentials with anyone else. You also may not make your Account available to anyone else."*
- **Acceptable Use Policy, "Do Not Abuse our Platform"** — anthropic.com/legal/aup: *"Circumvent a ban through the use of a different account, such as the creation of a new account, use of an existing account, or providing access to a person or entity that was previously banned"*; *"Coordinate malicious activity across multiple accounts to avoid detection or circumvent product guardrails"*; *"Utilize automation in account creation or to engage in spammy behavior."*
  **Precision correction to the survivor's paraphrase:** the clause bans coordinating *malicious* activity across accounts, not merely "activity" — narrower than the sweep's summary implied. Use the exact wording above, not the paraphrase, if this goes on the site.
- **Commercial Terms, assignment clause (§M.4)** — anthropic.com/legal/commercial-terms: *"Neither party may assign its rights or delegate its obligations under these Terms without the other party's prior written consent, except that Anthropic may assign its rights and delegate its obligations to an affiliate or as part of a sale of all or substantially all its business."*

### Correctly excluded — no entry (audit trail, not pasted)

Non-novel or refuted-on-their-own-thesis, checked and correctly dropped by the sweep itself: Consumer/Commercial Terms resale-vs-API-key restatement · fast-mode-billing restatement · subscription/API-key "non-overlap" (unsourced inference) · Alibaba Qwen dual-cache (Gemini already does this) · Zhipu/GLM storage billing (Gemini already does this) · cache-diagnostics 4-row matrix (already in Family A2) · stacked-retry-layer amplification (already Family E; billing claim likely wrong for the cited issues) · kthena cache-aware routing (already id-53/id-50 FAIL territory; doesn't apply to hosted-API customers anyway) · TTL-aligned session resumption (restates existing PASS_SCHEDULING/PASS_METADATA) · ProsperOps commitment-optimizer gap (n=1, too weak to publish) · FX/currency hedging (Anthropic half was a paraphrase dressed as a quote — rewrite as analysis before it's usable, even though the underlying claim held up on re-check).

---

## 2. The subscription line (publishable)

> **What's legitimate:** using your own Claude subscription, within its stated limits, for your own work — including through Claude Code's CLI, CI integrations, and Routines, which Anthropic's Consumer Terms carve out as an explicit exception to the automation ban: *"Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it, to access the Services through automated or non-human means, whether through a bot, script, or otherwise."*
>
> **What's banned, in Anthropic's own words:** sharing your account — *"You may not share your Account login information, Anthropic API key, or Account credentials with anyone else. You also may not make your Account available to anyone else"* (Consumer Terms §2) — regardless of the technical mechanism used to do it (proxy, token relay, or otherwise). Evading a ban by moving to a new or existing account, automating account creation, or coordinating malicious activity across multiple accounts to avoid detection or circumvent guardrails is separately and explicitly prohibited under the Acceptable Use Policy's "Do Not Abuse our Platform" clauses. And transferring a committed-spend agreement or prepaid credits to another entity requires Anthropic's prior written consent under the Commercial Terms' assignment clause (§M.4) — there is no self-service resale path for either a subscription seat or a committed-spend contract.
>
> **The permitted alternative, priced:** Team and Enterprise seats — Standard $20/mo (annual) or $25/mo (monthly), Premium $100/mo (annual, "5x more usage than standard seats") or $125/mo (monthly), Enterprise from $20/seat plus API-rate usage — are Anthropic's own priced structure for exactly the multi-user access that account-sharing tries to reach informally, without the terms violation.
>
> One sentence: **your own login doing your own work is fine; any version of one account serving more than one person or entity, by any mechanism, is not — and there is no priced or contractual path around that except buying more seats.**

---

## 3. After twelve sweeps — the exhaustion statement

**What's genuinely dry:**
- **Terms/boundary axis.** The four clauses that fence this territory — credential-sharing (Consumer Terms §2), automation (§3), multi-account ban-evasion (AUP), and committed-spend/credit assignment (Commercial Terms §M.4) — are now all primary-sourced, quoted verbatim, and cross-checked against each other for overlap. Twelve sweeps found no fifth clause. This boundary is complete *as Anthropic's terms read on 2026-08-12*.
- **Hedging/insurance.** The structural answer is now settled, not merely unfound: no provider offers an exit, exchange, or resale right on an LLM capacity commitment comparable to AWS EC2 Standard RIs. Two independent REFUTED findings (Bedrock PT, RI Marketplace scope) close this rather than leaving it open.
- **Workload-shape.** The enqueue-time-dedup family (K8s/BullMQ/SQS) and the retry-budget family (gRPC) cover the shapes that exist on customer-controlled infrastructure. What remains unswept here is customer-infra-specific enough (message-broker-of-the-week) that further sweeps will find restatements, not new mechanisms.

**What is NOT dry, and structurally can't be:**
- **Newest-surfaces.** Five CHANGES_RESULTS findings came off *one* pass over recently-shipped API features. This axis doesn't exhaust — it re-opens every time a provider ships a release note. "Every method possible" on this axis is a snapshot claim, true only for 2026-08-12, not a permanent state.
- **Non-english.** DeepSeek passed to CONTRACTUAL_ONLY; Kimi and a diagnostic tool landed INSUFFICIENT_EVIDENCE; two other candidates (Qwen, Zhipu) were checked and refuted on their own "no Western analogue" thesis. Diminishing returns for major players, but regional/smaller providers (dozens, mostly non-English-documented) are untouched by construction — this sweep checked three.

**What only a live account can settle** — no further document sweep converts these, because the missing evidence is behavioral, not textual:
1. Whether Batch/Flex/PTU run identical weights/precision (original register's unresolved #3 — still open).
2. DeepSeek's and Kimi's output-invariance claims — both are the provider's own doc, never independently replayed the way Anthropic's and OpenAI's were.
3. Whether Claude Code via a subscription login actually satisfies the Section 3 API-key carve-out (id 196) — needs an explicit Anthropic statement, not inference.
4. Who captures a mid-term list-price decrease on committed spend (id 199) — needs an actual account-team negotiation or a live price cut to test against.

**The honest sentence:** twelve sweeps and 199 adjudicated candidates have not reached "every method possible" and cannot, because one of the five axes checked this round (newest-surfaces) is generated by providers' own release cadence rather than by search effort — the set is provably open on that axis and provably closed on two others (terms/boundary, hedging). What's been reached is the honest edge of what primary-document reading alone can settle; the remaining open items are now correctly filed as needing an experiment or a live negotiation, not another sweep.

**Files read:** `/Users/angus/dev/token-spread/README.md`, `/Users/angus/dev/token-spread/docs/research/2026-08-10-strict-identity-register.md`, `/Users/angus/dev/token-spread/docs/research/2026-08-10-verdicts-final.json`, `/Users/angus/dev/token-spread/docs/research/2026-08-12-addendum.json`, `/Users/angus/dev/token-spread/docs/research/2026-08-11-context-survival-register.md`. Terms quotes independently re-fetched from `anthropic.com/legal/consumer-terms`, `/legal/aup`, `/legal/commercial-terms` on 2026-08-12 rather than taken on the sweep's paraphrase, since section 2 of this brief is meant for the site.

---

**Superseded in part, 2026-08-17,** by [`2026-08-17-sweep-12-recovery.md`](2026-08-17-sweep-12-recovery.md),
which merged the thirteen entries this brief adjudicated and never landed. This document stays as
written. Two things about it are now known to be wrong and are corrected there rather than here:
the numbering it used (185–199) is brief-local and collided with ids the verdict files had already
spent, and five of the six entries it proposed as passes did not survive an adversarial re-read.
See the successor for the ids these entries actually carry and the verdicts they actually hold.
