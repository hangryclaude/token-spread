# LLM Cost-Reduction Decision Tool
### Built from the 8-dimension research sweep + adversarial screens

**How to read tiers (from the brief, unchanged):**
A = same forward pass, only compute-reuse/billing/transport differs — output provably unaffected.
B = exact byte-identical repeat replayed from storage — safe only because it's a true duplicate; at T>0 this freezes one historical sample (a real behavior change, disclose it).
C = different input reaches the model, different amount of "thinking," or a different model answers — excluded from an "identical output" product, catalogued anyway.

**Technique legend** (used throughout):

| Code | Technique | Tier | Confidence |
|---|---|---|---|
| PC | Prompt/context caching (Anthropic/OpenAI/Gemini/Azure/Bedrock) | A | High — primary-doc, cross-checked live |
| BATCH | Async Batch API (all 4 major providers) | A* | High for cost mechanics; *no provider guarantees bit-identical output under load — see §2 footnote |
| DEDUP | Request coalescing + idempotency layer (customer-built; no provider offers this natively) | A | High — verified at SDK source level |
| RETRYFIX | Cancel-not-retry on client timeout (fixes SDK auto-retry double-billing) | A | High — confirmed in anthropic-sdk-python & openai-python source |
| PT | Provisioned/Reserved Throughput (Bedrock Reserved Tier, Azure PTU, Vertex GSU) | A | High mechanism confidence, **usually negative $ EV** — see §2 |
| FAST | Fast/Priority service tier | A (cost-**increase** lever) | High |
| ROUTE | Model downgrade / cheaper-model routing | C | — |
| COMPACT | Context compaction / context-editing (Anthropic compact_20260112, clear_tool_uses) | C | High |
| SEMCACHE | Semantic (similarity-match) caching | C | High |
| SUBAGENT | Sub-agent context isolation | C, and **cost-negative** | High — Anthropic's own published 4–15x figures |
| ZOMBIE | Decommissioning forgotten cron/eval jobs, right-sizing max_tokens | A | Medium — practitioner-confirmed, not fleet-quantified |
| SCHEMA | Stable tool schemas / deterministic serialization discipline | A (enabling, not itself a discount) | High |

---

## 1. COMPATIBILITY MATRIX

### 1a. Core pairwise matrix

✅ = stacks multiplicatively &nbsp;&nbsp; ⚠️ = compatible with a real interaction, read the note &nbsp;&nbsp; ❌ = mutually exclusive or silently cancels

| | PC | BATCH | PT | FAST | DEDUP | ROUTE | COMPACT | SEMCACHE |
|---|---|---|---|---|---|---|---|---|
| **PC** | — | ✅ Anthropic/OpenAI/Azure confirmed stacking; ❌ **Bedrock: caching explicitly unsupported on batch inference** | ✅ cached tokens burn down committed capacity at 0.1x–0x rate (not a $ stack, a *capacity* stack — PT itself is a fixed subscription) | ❌ switching speed tier invalidates the cache | ✅ independent layers, fully additive | ⚠️ compatible mechanically; breaks "identical output" the moment ROUTE fires | ❌ **compaction rewrites the cached prefix → forces a full cache-write on the next turn.** The more you compact, the less caching helps you. | ⚠️ layered, not stacked — a semantic-cache hit skips the model call entirely, so PC never gets metered on that request |
| **BATCH** | (see above) | — | ⚠️ different traffic class (async vs sustained interactive); rarely combined, not clearly documented as supported | ❌ explicitly documented as mutually exclusive | ✅ marginal (dedup mainly matters pre-submission, to avoid submitting duplicate rows) | ✅ multiplicative — different axis (schedule × model) | ✅ orthogonal — batch jobs are one-shot, rarely have a growing agent context to compact | ✅ orthogonal, rarely co-occur |
| **PT** | (see above) | (see above) | — | ⚠️ can combine per docs ("usable across Standard and Priority") but stacks *cost increases*, not savings | ✅ orthogonal | ✅ orthogonal | ✅ orthogonal | ✅ orthogonal |
| **FAST** | ❌ | ❌ | ⚠️ | — | ✅ | ✅ | ✅ | ✅ |
| **DEDUP** | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| **ROUTE** | ⚠️ | ✅ | ✅ | ✅ | ✅ | — | ⚠️ compounds *risk*, not just savings — two independent Tier-C divergences stacked | ⚠️ compounds risk similarly |
| **COMPACT** | ❌ | ✅ | ✅ | ✅ | ✅ | ⚠️ | — | ⚠️ compaction changes the history a semantic-cache embedding is computed over — untested interaction, flag unknown |
| **SEMCACHE** | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | — |

### 1b. Silent-cancellation antipatterns (not technique-vs-technique — implementation bugs that erase a technique's own benefit)

These don't error. They just quietly reduce your hit rate to ~0% and no dashboard tells you.

1. **Non-deterministic prefix serialization.** Unsorted dict/map keys, unsorted tool-definition lists, a per-second timestamp baked into the system prompt — any of these change the byte content ahead of the cache breakpoint. Result: 100% cache-write, 0% cache-read, forever, with no error. This is the single most common way a team believes caching is "on" while paying the 1.25–2x write premium every single call. **Detection**: track `cache_read_input_tokens` vs `cache_creation_input_tokens` in usage payloads — config existing proves nothing.
2. **Mid-session tool schema mutation.** Anthropic's own docs: changing a tool's name/description/schema invalidates the *entire* cache — tools, system, and message history, not just the tools block. Fix: never mutate the tools array; use the `tool_addition`/`tool_removal` system-message mechanism instead, which leaves the array byte-stable.
3. **Compaction/context-editing firing on a schedule tuned for context-size control, not cache economics.** OpenHands' own engineering team states this outright: "condensation destroys the prompt cache." Every compaction event forces a full uncached rewrite on the next turn. Compact only when you must, not proactively.
4. **Switching service tier (fast/priority ↔ standard) mid-session** invalidates the cache — documented trap, applies on Anthropic.
5. **Naive concurrent fan-out.** A cache entry is only *readable* after the first response with that prefix begins streaming. N parallel requests fired via `Promise.all`/`asyncio.gather` before any of them has streamed a first token will *all* miss simultaneously and *all* write — turning what should be 1 write + (N−1) reads into N full-price writes. Fix: fire the first request, await its first streamed token, *then* fan out the rest.
6. **Below-minimum-prefix caching.** Anthropic's minimum cacheable prefix is **not uniform across model generations** — 512 tokens on the newest tier, up to 4,096 tokens on Opus 4.6/4.5 and Haiku 4.5. A prompt that caches fine on one model silently caches *never* after a routing change to another, with `cache_creation_input_tokens: 0` and no error.

---

## 2. THE COMPOUNDING MATHS

### The rule

**Multipliers on the same tokens multiply. They never add. A "90% off" and a "50% off" applied to the same tokens do not sum to 140% off (impossible) or even to 100% off — they multiply to 95% off.**

$$\text{effective\_cost} = \sum_i \left( \text{tokens}_i \times \text{price}_i \times \prod_j \text{multiplier}_{i,j} \right)$$

For each token *category* `i` (a fraction of your traffic sharing the same technique-stack), take the *product* of every applicable technique's multiplier for that category, then weight by that category's share of total tokens. Never apply one blended discount percentage to the whole bill — different slices of traffic qualify for different stacks, and most traffic qualifies for fewer techniques than your best-case slice.

### Minimal illustration — why naive addition breaks

Cache-read (0.1x, "90% off") + Batch (0.5x, "50% off") on the *same* tokens:

| Method | Computation | Result |
|---|---|---|
| ❌ Naive sum | 90% + 50% | 140% off — **impossible, exceeds 100%** |
| ❌ Naive "cap at 100%" | min(140%, 100%) | "free" — **wrong, and dangerous to promise** |
| ✅ Correct | 0.1 × 0.5 | **0.05x = 95% off** |

95% off is still an excellent number. It is also a *specific, derivable* number — not a hand-wave that happens to land near 100%.

### Worked example — realistic enterprise mix

Baseline (no optimization), Sonnet-tier pricing ($3/MTok input, $15/MTok output), 500M input tokens + 100M output tokens/month:

| | Tokens | Rate | Cost |
|---|---|---|---|
| Input, unoptimized | 500M | $3/MTok | $1,500 |
| Output, unoptimized | 100M | $15/MTok | $1,500 |
| **Naive baseline total** | | | **$3,000** |

Now partition real traffic into the categories it *actually* falls into — not every token qualifies for the best stack:

**Input side:**

| Category | Share | Technique stack | Multiplier | Contribution |
|---|---|---|---|---|
| A. Cacheable prefix, read | 40% | PC read | 0.1x | 0.04 |
| B. Cacheable prefix, write | 10% | PC write (5-min TTL) | 1.25x | 0.125 |
| C. Non-cacheable, sync | 20% | none | 1.0x | 0.20 |
| D. Cacheable + Batch (backfill/classification) | 20% | PC read × Batch | 0.1 × 0.5 = 0.05x | 0.01 |
| E. Non-cacheable, Batch | 10% | Batch | 0.5x | 0.05 |
| **Weighted input multiplier** | | | | **0.425** |

Effective input cost = $1,500 × 0.425 = **$637.50**

**Output side** (caching only discounts prefill/input in every provider's documented mechanism — it does not discount output tokens; Batch discounts both directions):

| Category | Share | Multiplier |
|---|---|---|
| Sync (categories A/B/C) | 70% | 1.0x |
| Batch (categories D/E) | 30% | 0.5x |
| **Weighted output multiplier** | | **0.85** |

Effective output cost = $1,500 × 0.85 = **$1,275**

**Total optimized cost = $637.50 + $1,275 = $1,912.50 → 36.25% total reduction.**

Compare to a naive pitch ("we do caching *and* batch, call it 70% off blended") → claimed cost $900. **The naive number overclaims by more than 2x** ($900 claimed vs. $1,912.50 actual) because most traffic doesn't sit in the deepest-stacked category — only 20% of tokens here hit the 0.05x combo; the rest are spread across shallower or zero-discount categories. This is the exact gap a customer's own invoice will expose if you sell the headline number instead of the blended one.

**Two things this math must never smuggle in:**
- Every multiplier above is Tier A or the documented Batch mechanism. The moment ROUTE (model downgrade) or COMPACT enters the stack, you are no longer discounting a fixed numerator — you're changing what gets computed. Compound those separately, and disclose the tier change, never fold a C-tier multiplier into an "identical output, X% cheaper" claim.
- Write premiums are *negative* multipliers (>1.0x). Category B above costs *more* than baseline. If cached content is rarely re-read, its true weighted contribution can be net-negative — model this explicitly, don't just assume every cacheable byte helps.

---

## 3. LATENCY COST

| Technique | p50 | p99 | Notes |
|---|---|---|---|
| **PC** (prompt caching) | ↓ (Anthropic: "up to 85% latency reduction" on hits) | ↓ or flat | No downside case found. Write-turn latency overhead is negligible. |
| **BATCH** | **↑↑↑ — target SLA is 24h**, not a guarantee | **↑↑↑ — unbounded up to 24h**; anything unfinished at 24h expires unbilled | One practitioner measured 5.8-min *average* turnaround across ~2,800 calls — **this is not an SLA and must never be sold as one**. An enterprise interactive path cannot accept this; batch must be architecturally walled off from any user-facing latency budget. |
| **PT / Reserved capacity** | flat-to-slightly-↓ | **↓↓ — this is PT's real value**: dedicated capacity removes multi-tenant contention and 429 noise | Sell this as a **tail-latency/SLA lever**, not a cost lever — §2's math shows it's usually cost-*negative* below ~90% sustained utilization. |
| **FAST/Priority mode** | ↓↓ (2–2.5x reported) | ↓↓ | Costs ~2x base rate. Never combine with a savings pitch — it's the opposite lever, buy it only when latency is the product requirement. |
| **DEDUP** (request coalescing) | flat for the leader; **can ↑ for a follower** stuck waiting on a slow leader's response | ⚠️ can worsen tail for unlucky followers, but reduces total system load which can improve p99 indirectly under high concurrency | Net-positive at fleet scale, not guaranteed positive per-request. |
| **RETRYFIX** (cancel-not-retry) | flat or ↓ (removes a wasted retry round-trip on the timeout path specifically) | ↓ on the timeout tail specifically | Pure upside — this closes a bug, not a tradeoff. |
| **ROUTE** (model downgrade, C) | ↓ (smaller/faster models) | ↓ | The rare cost lever that *also* helps latency — at the cost of the biggest disclosed fidelity risk in this table. |
| **COMPACT / context-editing (C)** | **↑ on the turn it fires** — it is a full extra sampling pass before the "real" response | **↑↑ disproportionately hits p99** — it fires on your longest, tail-end sessions specifically | Threshold-gate it; never compact proactively "just in case." |
| **SEMCACHE (C)** | ↓↓ on a hit (skips generation) | **↑ on a miss** — every request pays an extra embedding-call round trip whether it hits or not | Net latency effect depends entirely on hit rate; miss-heavy traffic is *slower* than doing nothing. |
| **SUBAGENT (C)** | workload-dependent — parallel subagents can *reduce* perceived latency for the whole task despite raising total tokens | ↑ orchestration round-trips add tail risk | Latency and cost pull in *opposite* directions here — do not conflate "faster because parallel" with "cheaper." It is reliably not cheaper (4–15x tokens). |
| **Batch-invariant kernels** (true bit-determinism, self-hosted only) | ↑ 1.6–2.1x slower | ↑ same | Not available on any hosted API today. Included because it's the only lever that buys provable output-determinism — and it costs latency+compute, not saves it. |

**The one sentence to put in front of any enterprise buyer:** batch touches only traffic that can wait up to 24 hours and has no real-time floor; every other technique in this table is latency-neutral-to-positive and safe to apply to interactive paths.

---

## 4. SEQUENCING

Ranked by dollars-saved-per-engineering-hour, assuming the customer starts with none of this in place.

### First three (do these, in this order)

| # | Action | Why first | Effort | Risk |
|---|---|---|---|---|
| **1** | **Prompt caching + deterministic serialization discipline** (PC + SCHEMA) | Largest guaranteed Tier-A saving available (up to 90% on repeated-prefix tokens), lowest effort (config flag + canonical JSON serializer), *improves* p50 latency as a side effect. The single highest $/eng-hour move in the entire sweep. | Low (hours, not days) | Near-zero — pure Tier A, self-verifying via usage telemetry |
| **2** | **Eliminate retry-storm double-billing** (RETRYFIX + DEDUP) | Confirmed at the SDK source-code level: default retry-on-timeout behavior in both major official SDKs double-bills the abandoned original call. Pure waste, not a tradeoff — every dollar recovered is a dollar that bought nothing. No provider offers server-side idempotency for real-time inference, so this must be built once as infrastructure and then applies everywhere. | Low–medium (build a request-hash + in-flight cache once) | Near-zero if implemented as cancel-not-retry |
| **3** | **Batch API for the latency-tolerant slice of traffic** (BATCH) | Flat, provider-guaranteed 50% off, stacks with #1 on Anthropic/OpenAI/Azure (confirm it does *not* on Bedrock before assuming stacking). Requires correctly identifying which traffic can tolerate the SLA — evals, backfills, classification, offline extraction, nightly enrichment. | Medium (async job plumbing, polling/webhook handling) | Low, IF scoped only to genuinely deferred-tolerant traffic — see §3's warning |

### Next five

| # | Action | Why | Effort |
|---|---|---|---|
| 4 | **Zombie job / truncation-cascade cleanup** (ZOMBIE) — kill forgotten cron/eval jobs still billing against production keys; right-size `max_tokens` to stop truncate-then-retry cascades (one measured case: 2.9x cost overhead from this alone) | Pure waste elimination once found; the hard part is *finding* it, which needs #5 first | Low once instrumented |
| 5 | **Tagging/attribution layer (showback)** | Not itself a saving — it's the prerequisite that makes #4 (and every subsequent optimization) *auditable* rather than guessed at. Run showback 4–6 weeks until ~80% of spend is attributed before moving to chargeback. | Medium — real engineering, despite looking "just organizational" |
| 6 | **Committed-spend / Enterprise negotiation** | Real leverage once volume is proven — but sequence it *after* optimization, not before, or you lock in a spend floor while still wasting on retries/uncached traffic. No provider publishes a discount schedule; every specific percentage found in this sweep traced to unsourced blogspam. Negotiate off your own optimized run-rate. | High (sales cycle, contract) |
| 7 | **Model-tier routing** (ROUTE, disclosed Tier C) | Real savings, real risk. Requires an eval harness proving quality parity for the specific task before shipping — the sweep found *zero* rigorous ablations anywhere proving "cheaper model, same quality" without measurement; every practitioner claim of a routing win was met with unanswered skepticism in its own thread. | Medium–high (eval harness is the real cost) |
| 8 | **Stable tool schemas + volatility-segmented cache breakpoints** | Prevents the full-cache-invalidation antipattern (§1b, item 2) and maximizes hit rate in agent loops specifically by separating fast-moving context (open files, live turn) from slow-moving context (system prompt, tool defs) into separate breakpoints. | Medium (real engineering discipline, not a flag) |

**Do not sequence toward:** PT/Reserved capacity as a cost move (it's usually negative EV below ~90% sustained utilization — see §2), Fast/Priority mode in a savings context (it's the inverse lever), or Compaction as a proactive default (it cancels caching every time it fires — §1b, item 3).

---

## 5. WORKLOAD ARCHETYPES

The same technique set has genuinely different value per workload. Ranked per archetype, highest-value first.

### (a) Long-running coding agent (Claude-Code-style loop)

1. **PC with volatility-segmented breakpoints** — the dominant lever. Agent-loop context grows ~quadratically turn-over-turn and is mostly repeated; caching discounts the *constant factor* on that quadratic term (not the exponent — that distinction matters, see the compounding math above), typically the single biggest line item in the bill.
2. **SCHEMA stability** — never mutate the tools array mid-session; use volatility-segmented breakpoints (system/tools stable, live-turn volatile) to stop one fast-moving layer from busting a slow-moving one.
3. **Avoid SUBAGENT proliferation for cost reasons** — Anthropic's own data: 4–15x more tokens than single-agent chat for equivalent work. Use subagents only when the *quality* case justifies it, never as a cost lever.
4. COMPACT — necessary evil past a context-size threshold, expensive every time it fires (extra sampling pass + forced cache rebuild); threshold-gate hard, never compact proactively.
5. BATCH — essentially N/A (fully interactive).

### (b) High-volume classification

1. **BATCH** — near-perfect fit. Classification is rarely latency-critical; flat 50% off at volume dominates every other lever.
2. **ROUTE to cheapest capable model** (with an eval set) — classification is exactly the task class where "good enough" cheap models most often are good enough. High $/eng-hour once validated.
3. **PC on the shared instruction/output-schema prefix** — near-free if a fixed instruction block repeats every call, which it almost always does in classification pipelines.
4. Confirm PC + BATCH actually stack on your provider (yes on Anthropic/OpenAI/Azure; **no on Bedrock**) before assuming the combined multiplier.

### (c) RAG question answering

1. **PC on the fixed system prompt / instructions / tool schemas** — the retrieved-document content is the variable part; everything else is a large, stable, cacheable prefix.
2. **Envelope hygiene** (SCHEMA-class discipline — canonical JSON, no base64-encoding of already-text data) — real, low-effort, Tier A.
3. **SEMCACHE is tempting here** (repeated similar questions) but is Tier C by construction — a stored answer to a *different* question gets served. If offered at all, it must be a disclosed, opt-in tier, never silently blended into an "identical output" guarantee.
4. ROUTE for simple factual lookups — viable, but risks recall/citation-accuracy degradation; needs the same eval-harness discipline as (b).
5. BATCH — only fits offline/precompute (FAQ pre-generation), not live QA.

### (d) Batch document processing

1. **BATCH** — the textbook use case, flat 50%, no latency conflict since there's no interactive user waiting.
2. **PC on repeated instructions/schema across the document set** — stacks with #1 on Anthropic/OpenAI/Azure; confirm platform first (not on Bedrock).
3. **Envelope canonicalization** to maximize hit rate across the whole run — one non-deterministic serializer anywhere in the pipeline silently zeroes out #2 for the entire job.
4. **PT/Reserved capacity — only if utilization can be proven ≥90% sustained** across the commitment window. Batch-shaped workloads are usually bursty, which is exactly the profile that makes PT a losing bet per §2's Bedrock/Vertex/Azure break-even numbers. Default to skip.

### (e) Chat product (consumer-facing, interactive, T>0)

1. **PC on system prompt + early turns** — same quadratic dynamic as the coding agent, usually shorter sessions so the absolute dollar impact is smaller but the *rate* is identical.
2. **RETRYFIX/DEDUP** — unusually high-value here specifically, because impatient users hitting "resend" on a slow response is exactly the client-timeout-retry pattern that double-bills.
3. **Exact-match response caching (Tier B), disclosed and opt-in only** — tempting for FAQ-style repeated questions, but at T>0 it freezes one historical sample instead of drawing fresh. This must be a customer-facing choice, never a silent default, because it changes what "the model's response" means for that traffic.
4. **ROUTE for simple turns** (cheap-first-then-escalate) — viable, but users notice quality cliffs in real time in a way a backend classification pipeline's users never do; tune conservatively.
5. **BATCH — N/A**, fully interactive by definition.

---

### One-line summary for the deck

*Caching is the highest-value, lowest-risk, latency-positive lever and should be step one everywhere. Batch is the second-highest-value lever but only for the fraction of traffic that can wait. Committed capacity is usually a latency lever wearing a savings costume — check the utilization math in §2 before selling it as one. Every Tier-C technique (model downgrade, compaction, semantic cache, subagents) buys real dollars at the cost of a disclosed, unprovable-identical output — stack those separately, price them separately, and never let their multiplier hide inside an "identical output" number.*