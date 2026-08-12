# The Strict Identity Register

**Every way to cut LLM cost without changing what the model does.**

Date: 2026-08-10 · 176 candidate techniques adjudicated · 66 pass · 50 rejected · 36 unresolved

> **Errata, 2026-08-11.** A primary-doc re-verification pass found **nine** entries below that are
> now wrong or incomplete. Each is marked inline with `⚠ CORRECTED 2026-08-11`. Three of them —
> automatic caching, long-context pricing, and the 4.7 tokenizer — change what this register
> *recommends*, not merely what it states. Full working:
> [The Context Survival Register](2026-08-11-context-survival-register.md), Part 4.

---

## The bar

A technique is in this register only if the answer to this question is **no**:

> Does the model read a different sequence of tokens, does a different model answer,
> or does a different amount of thinking happen?

Everything else — however small, however harmless it looks — is out. That includes the
single most-recommended "caching fix" on the internet (remove the timestamp from your
system prompt) and the second (move static content to the front). Both change what the
model reads. Both are rejected here.

### Evidence classes

Byte-identity for a *fresh* generation cannot be proven. Hosted inference is not
bit-reproducible: GPU reduction order varies with concurrent batch composition, and no
major provider exposes deterministic-kernel attestation. So the register grades what
*can* be proven, and never claims more.

| Class | What it proves | Strength |
|---|---|---|
| `PASS_ABSOLUTE` | nothing on the wire changed; only price, or whether an unauthorised request was sent at all | strongest |
| `PASS_METADATA` | only a non-content field changed — one the model never reads | strong |
| `PASS_SCHEDULING` | content byte-identical; only *when* requests are sent changed | strong |
| `PASS_REPLAY` | a stored response hash-matches a byte-identical repeat of one logical operation | cryptographic, but narrow |
| `CONTRACTUAL_ONLY` | provider documents output-neutrality; request unchanged, but execution moved fleets | ships opt-in, never default |
| `FAIL` | the model reads different bytes | excluded |

---

## Results

| Verdict | Count |
|---|---:|
| PASS_METADATA | 38 |
| PASS_ABSOLUTE | 26 |
| CONTRACTUAL_ONLY | 24 |
| PASS_SCHEDULING | 1 |
| PASS_REPLAY | 1 |
| **Total passing** | **66** |
| FAIL | 50 |
| INSUFFICIENT_EVIDENCE | 36 |

Of the 66, **54 are levers** (something a system can do), 14 are prerequisites, 7 are
background facts, 8 are catalogued non-savings.

---

## Family A — Cache breakpoint management

*`PASS_METADATA`. The largest lever by a wide margin. `cache_control` is a field the model
never reads as content; Anthropic states plainly: "Prompt caching has no effect on output
token generation. The response you receive is identical to what you would get if prompt
caching were not used."*

**Economics (primary-doc, verified 2026-08-10):** cache read = **0.1× base input** (90% off).
Write premium = **1.25×** (5-minute TTL) or **2×** (1-hour). Break-even after **one** read
at 5m, **two** reads at 1h.

| Lever | What it does | Trap |
|---|---|---|
| Insert `cache_control` | the whole lever. A team that never added it sits at 0% forever | opt-in per request; naive integrations get nothing |
| **⚠ CORRECTED 2026-08-11 — automatic caching** | *"Add a single `cache_control` field at the top level of your request. The system automatically manages cache breakpoints as conversations grow."* Now the documented **recommended starting point** | this supersedes manual placement as the baseline. The 4-breakpoint cap and the 20-block lookback below are the *fine-grained* path, not the default one |
| Breakpoint placement at volatility boundaries | stops a fast-changing layer invalidating a slow-changing one | placement only — **never reorder content** |
| Canonical 4-breakpoint pattern | system + tools + last-2-user-turns, within the hard cap of 4 | exceeding 4 → HTTP 400 on tool-dense turns |
| 20-block lookback handling | a breakpoint checks at most 20 positions back | a turn adding >20 blocks misses totally, silently |
| TTL selection (5m vs 1h) | 1h for agent loops that pause | **1h requested, 5m silently granted** — verify granted vs requested |
| **⚠ CORRECTED 2026-08-11 — the granted TTL is observable, and it is not free** | `usage.cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` reports the split per request. **Measured across 7,454 deduped Claude Code requests: 40.4M cache-write tokens, 100% at the 1h TTL, zero at 5m.** | a 1h write bills at **2x** base input, a 5m write at **1.25x**. Any cost model carrying one unqualified "cache write" rate under-charges 1h traffic by 60% — ours did, understating a $1,632 sample by **$150.69 (9.2%)** until this was fixed |
| Per-model minimum thresholds | 512 → 4,096 tokens, **non-monotonic** across generations | below minimum = `cache_creation_input_tokens: 0`, HTTP 200, no error |
| Model-capability gate | don't hard-code a model allowlist | every new model release silently zeroes caching |
| Bedrock dialect translation | `cache_control` ↔ Converse `cachePoint` | checkpoints chain tools→system→messages; editing early invalidates all later |
| **Never send `cache_control` to Gemini** | it is actively harmful there | **6–14× cost penalty** — verified verbatim from primary source |

**New lever, measured 2026-08-11 — TTL right-sizing (`PASS_METADATA`).**

Buying the 1h TTL costs 2x base input; the 5m TTL costs 1.25x. The extra 0.75x buys nothing
unless the prefix is still being read after five minutes — and a 5m entry *refreshes on every
read*, so an unbroken chain of sub-five-minute turns keeps it alive indefinitely.

Measured on 7,454 deduped Claude Code requests, grouped by session and ordered by timestamp:

| gap to the next request in the same session | 1h write tokens | share |
|---|---:|---:|
| **≤ 5 minutes** | 38,453,853 | **95.1%** |
| never re-read (last request of a session) | 1,147,324 | 2.8% |
| everything longer | ~835,000 | 2.1% |

**$143.50 of a $1,632 bill — 8.8% — was spent on TTL that was never used.** `ttl` is a field
the model never reads: same prompt, same model, same output.

Two things this deliberately does not claim. The 2.8% never re-read at all is *waste*, a
different family, and counting it here would double-count it later. And shortening the TTL
makes the 2.1% tail miss, paying a fresh write instead of a 0.1x read — about one percent of
the figure on this traffic shape, but capable of dominating on another.

Detector: `src/detect/ttlRightSizing.ts`.

**Minimum thresholds (Anthropic-operated platforms, verified 2026-08-10):**

| Model | Min cacheable tokens |
|---|---:|
| Opus 5, Fable 5, Mythos 5 | 512 |
| Opus 4.8, Sonnet 5, Sonnet 4.6/4.5, Opus 4.1 | 1,024 |
| Mythos Preview, Opus 4.7 | 2,048 |
| Opus 4.6, Opus 4.5, **Haiku 4.5** | 4,096 |

Not monotonic. Opus 4.6's minimum is 8× Opus 5's. A 3K-token prefix caches on Opus 5 and
silently never caches on Haiku 4.5.

---

## Family A2 — Cache diagnosis (the instrument, not a lever)

*`PASS_METADATA`. Verified from primary docs 2026-08-11. Saves nothing by itself; it tells
you which of the Family A levers is broken and by how much — which is the thing nobody
could previously see.*

Beta header **`cache-diagnosis-2026-04-07`**. Send it every turn, pass the previous
response `id` as `diagnostics.previous_message_id`, and the response carries a
`diagnostics` object naming the **first** point at which the prefix diverged.

| `cache_miss_reason.type` | Cause | Fix named by the doc |
|---|---|---|
| `model_changed` | a router, A/B test or fallback picked a different model | hold the model constant inside a cached conversation |
| `system_changed` | a timestamp or request id interpolated into the system prompt | make system byte-stable; move dynamic data after the breakpoint |
| `tools_changed` | tools added, removed, reordered, or schemas serialised non-deterministically | fixed order, deterministic serialisation |
| `messages_changed` | history truncated or edited rather than appended | treat history as append-only; echo assistant content verbatim |
| `previous_message_not_found` | no stored fingerprint | **not evidence your request changed** — header missing, wrong workspace, or too much time passed |
| `unavailable` | another prompt-affecting param differed (`tool_choice`, `thinking`, `context_management`, `output_config`, `output_format`, the active beta set), or divergence beyond the comparison horizon | keep those params constant for the life of a cached conversation |

The four `*_changed` types carry **`cache_missed_input_tokens`** — how much cacheable
prefix fell after the divergence. The doc is explicit about its status: *"derived from byte
lengths before tokenization, so treat it as a magnitude indicator rather than a billing
number. It can differ from (and occasionally exceed) `usage.input_tokens`."* **Never price
a saving off it.**

**Why it qualifies.** `diagnostics` is a request field the model never reads, and the doc
states diagnostics *"never blocks or fails your request."* ZDR eligible: the stored
fingerprint is *"only cryptographic hashes and token-count estimates"*, never raw prompt
text — the same content-blind footing the rest of this register stands on.

**The four-state response is a trap.** `diagnostics` absent means the header was missing.
`null` means either first turn **or** no divergence found — two very different facts sharing
one value. `{"cache_miss_reason": null}` means the comparison had not finished when the
response serialised: inconclusive, check the next turn. Only the fourth state is a finding.
Code that treats `null` as "healthy" will report a clean bill of health on a request that
was never compared.

**What it does not cover:** Claude API only — *"not available on Claude Platform on AWS,
Amazon Bedrock, Google Cloud, Microsoft Foundry."* Fingerprints expire quickly, so
comparisons must be between closely spaced turns, and both must come from the same
organisation and workspace.

**Consequence for anyone selling cache observability:** "a broken cache is invisible" was
true and is now only conditionally true. The signal exists. What remains is that it is
opt-in, beta, first-party only, requires threading an id through every turn, and reports one
divergence at a time.

---

## Family B — Cache routing hints

*`PASS_METADATA` / `PASS_SCHEDULING`. Raises the hit rate on caching you already have.*

- **`prompt_cache_key` (OpenAI)** — OpenAI's own words: *"routing hint metadata… not content
  processed by the model."* Where caching is already automatic, this is the only
  strictly-safe way to improve it. Threshold: >15 rpm per key.
- **Prefix-affinity routing** — hash the cacheable scope locally (model + system-to-breakpoint
  + tools, canonicalised) and route same-prefix requests to the same worker. Never
  transmitted to the provider. Purely our own routing decision.

---

## Family C — Scheduling

*`PASS_SCHEDULING`. Content byte-identical; only timing changes.*

- **Stagger concurrent identical prefixes.** A cache entry is readable only *after the first
  response begins streaming.* N parallel requests via `Promise.all` all miss and all write —
  N full-price writes instead of 1 write + (N−1) reads. Fix: await the first token, then fan out.
- **Temporal clustering.** Send same-prefix requests close together, inside the TTL.
- **Cache warming.** A synthetic priming request sending the byte-identical prefix real
  traffic would send anyway. *Net-negative on low-QPS services* — it pays a full write every
  TTL interval through idle periods.

---

## Family D — Exact-duplicate replay

*`PASS_REPLAY`. Cryptographically provable, and the narrowest lever here.*

Replay a stored response only when **all** hold:
1. the request is byte-identical (canonicalised hash of model + params + body), **and**
2. the caller declared it one logical operation (idempotency key assigned before the first attempt), **and**
3. `temperature = 0` or a fixed seed.

**Why all three.** Cloudflare AI Gateway replays byte-identical requests *regardless of
temperature*, TTL up to one month, with no idempotency gate. A caller running best-of-N at
temp>0 silently gets the same draw twice for a month. That is a behaviour change sold as a
cost saving — and it is the default in the most widely deployed free gateway.

**LiteLLM's cache key is structurally unsound.** `get_cache_key()` concatenates
`f"{param}: {param_value}"` in raw dict order with **no delimiter and no sorting**, so
`param='a', value='1:b'` and `param='a:1', value='b'` collide. A false hit returns a full
response for a different request with the model never invoked.

---

## Family E — Waste elimination

*`PASS_ABSOLUTE`. The request produced nothing anyone used, so nothing can change.*

| Lever | Detail |
|---|---|
| Protocol-translation retry duplication | gateway layers each retrying → one logical call billed many times |
| Bedrock `clientRequestToken` | the **only** documented inference-side idempotency key across the four batch APIs. Google's docs state duplicate batch-creation requests create two separate billed jobs |
| Local idempotency ledger over `Batches.create` | crash-recovery dedup; the endpoint is not idempotent |
| Conditional-write claim/revert | exactly-once batch orchestration over an at-least-once API |
| Zombie jobs | forgotten nightly evals and crons still billing production keys |
| Truncate-then-retry cascades | one measured case: **2.9× cost overhead** |

**Caveat on retry dedup.** SDK auto-retries fire on connection errors, 429s and 5xx — real
failures. Holding the original promise and replaying it can return a broken partial where a
fresh retry would have succeeded. Must distinguish *"client gave up on a healthy generation"*
from *"the original actually failed."* Unresolved; needs an experiment.

---

## Family F — Procurement

*`PASS_ABSOLUTE`. The cleanest category in the register — nothing about the request changes at all.*

- Committed-spend / enterprise discount (no provider publishes a schedule)
- **AWS Marketplace private offer drawing down existing EDP/PPA commitment** — spend you already owe
- Anthropic Claude Marketplace commit drawdown
- Invoice-error recovery — audit that negotiated rates were actually applied
- Startup credits · nonprofit sector discount · SLA service-credit recovery

**Sequence this after optimisation, not before** — or you lock in a spend floor while still
wasting on uncached traffic. And every specific percentage found in this sweep ("$1M–$5M →
15–25% off") traced to unsourced consulting blogspam. Negotiate off your own optimised run-rate.

---

## Family G — Opt-in tier (`CONTRACTUAL_ONLY`)

Same model, same parameters, same input — but execution moves to a different fleet or
scheduling regime, so byte-identity **cannot be proven**. Providers document these as
output-neutral. Ship them off by default; let the customer switch them on per workload.

| Lever | Discount | Cost |
|---|---|---|
| Batch API | flat 50%, all major providers | up to **24h** turnaround — never an SLA |
| Flex / lower-priority tiers | provider-specific | best-effort latency |
| Provisioned throughput / PTU + reservations | unit-price cut | **negative EV below ~90% sustained utilisation** |
| Cross-region / global inference profiles | ~10% on Bedrock global vs geo | changes serving geography |
| **⚠ CORRECTED 2026-08-11 — `inference_geo:"us"`** | the first-party equivalent: **1.1×** on input, output, cache writes *and* cache reads, on 4.6+ | a cost **increase**, not a lever. The lever is not setting it. Earlier models 400 on the parameter |

**Not universal:** caching and batch stack on Anthropic/OpenAI/Azure. On **Bedrock, prompt
caching is explicitly unsupported with batch inference.**

### ⚠ CORRECTED 2026-08-11 — five entries this family got wrong or missed

| # | What changed | Primary doc, verified 2026-08-11 |
|---|---|---|
| 1 | **Long-context premium: gone.** This register priced a 1M-token window as carrying a premium | *"Claude 4.6 and later models … include the full 1M token context window at standard pricing. (A 900k-token request is billed at the same per-token rate as a 9k-token request.)"* No beta header either |
| 2 | **The 4.7 tokenizer is a ~30% cost rise on identical text** — previously carried as an unsourced "1×–1.35×" range | *"Claude 4.7 and later models … use a newer tokenizer … approximately 30% more tokens for the same text."* Boundary is exact: Sonnet 4.6 and earlier use the previous one. Opus 4.6 → 4.7 at an unchanged $5/MTok costs ~30% more |
| 3 | **Fast mode doubles the bill** — absent entirely | Opus 5 / 4.8 at `speed:"fast"` bill **$10/$50 vs $5/$25**, *"across the full context window"*, and are **not available with the Batch API**. Errors on 4.7; silently runs standard on 4.6 |
| 4 | ~~**Sonnet 5 intro pricing expires 2026-08-31**~~ — **this erratum was itself wrong** | **Corrected again 2026-08-12.** It called a 50% rise "the most time-boxed item in the register". Anthropic's API release notes, dated **2026-08-10** — the day *before* this erratum was written — say: *"The introductory pricing for Claude Sonnet 5 ($2 / $10 per MTok) is now the standard price: the previously scheduled increase to $3 / $15 per MTok on September 1, 2026 will not occur."* The rise was already cancelled when we flagged it as urgent. A register that re-reads primary sources only for the entries it suspects will keep finding the errors it went looking for and none of the others |
| 5 | **Code execution has a free tier** — absent entirely | **1,550 free container-hours per org per month**, then $0.05/hour; **free entirely** alongside web search or web fetch. Files in the request bill execution time *even if the tool is never called* |

Entries 1 and 2 move in opposite directions and both were being priced wrong. A customer who
"just upgraded to 4.7" saw a ~30% bill rise from the tokenizer alone — which will be misread as
waste and mis-attributed to whatever else changed that month.

---

## Rejected — and why it matters that they are

These are what the rest of the market sells.

| Rejected | Why |
|---|---|
| Model routing / cascades | a different model answers |
| Semantic caching | returns an answer generated for a *different* prompt |
| Prompt compression (LLMLingua) | −13.2 EM points on BBH at 5–7× in the same paper that claims near-lossless on GSM8K |
| Context editing / compaction | removes content the model can see — **and cancels caching every time it fires** |
| Prompt reordering (static-first) | changes token order |
| Removing timestamps/UUIDs from prefixes | changes what the model reads |
| `stop_sequences`, `max_tokens` truncation | changes `stop_reason` and output completeness |
| Tool-schema trimming, minification | changes what the model reads |
| MCP `cache_tools_list` | caches the tool list *sent to the model*; docs: "does not automatically detect changes" |
| Image transport swaps (base64 ↔ URL ↔ file_id) | lossy recompression changes pixels |
| **⚠ CORRECTED 2026-08-11** — image token cost is **not** `(w×h)/750` | primary doc: *"An image costs `⌈width / 28⌉ × ⌈height / 28⌉` visual tokens."* Caps: 1,568 (standard tier) / 4,784 (high-res, 4.7+). The `/750` rule is still what most token calculators use |

---

## Unresolved — 36 open questions

The most consequential, each with the experiment that settles it:

1. **Does aborting a stream stop the billing?** Confirmed billed-up-to-abort on Vertex
   (named engineer, official forum). Practitioner consensus only for OpenAI. Unconfirmed for
   Anthropic. *Test:* hard-close the TCP connection mid-stream, then query usage for that request ID.
2. **Gemini implicit caching — is it behaviour-neutral?** Google never states it (Anthropic and
   OpenAI both do), publishes no discount number, and describes matching with soft hints
   ("similar prefix"). It is **default-on for all Gemini 2.5+ traffic with no opt-out.**
   Until settled, **no identity claim is possible on Gemini.**
3. **Do Batch / Flex / provisioned tiers run identical weights and precision?** No primary doc
   says either way, for any provider. *Test:* large-N identical-prompt diffs across tiers at
   temperature 0, comparing logprobs.
4. **Does continuous batching perturb a single request's output?** Demonstrated in principle —
   1,000 temp-0 completions → 80 unique outputs before batch-invariant kernels, all identical after.

---

## The compounding maths

Multipliers on the same tokens **multiply**. They never add.

```
effective_cost = Σᵢ ( tokensᵢ × priceᵢ × Πⱼ multiplierᵢⱼ )
```

Cache-read (0.1×) with batch (0.5×) = **0.05× = 95% off**, not 90+50=140%.

**Worked, realistic enterprise mix** — 500M in / 100M out, Sonnet tier:

| | Cost |
|---|---:|
| Naive baseline | $3,000 |
| Typical vendor pitch ("caching + batch ≈ 70% off") | $900 |
| **Actual** | **$1,912.50** |
| Real reduction | **36.25%** |

The headline overclaims by more than 2×, because only ~20% of tokens land in the
deep-stacked bucket. Cache *writes* are a multiplier **above 1.0** — rarely-re-read cached
content is net-negative.

**Report the blended number computed from the customer's own hit rate. Never the best
individual lever's number as if it applied to the whole bill.**

---

## Everything is detectable without reading prompts

Every high-value lever above is detectable from response usage metadata alone:

`cache_read_input_tokens` · `cache_creation_input_tokens` · `cached_tokens` ·
`cacheReadInputTokens` · request timing · block counts · status codes

No prompt content required. A content-blind deployment can find the money.

---

## Provenance

| Grade | Count |
|---|---:|
| primary-doc | 97 |
| practitioner-data | 31 |
| inferred | 14 |
| unsourced-claim | 15 → excluded from findings |
| primary-blog | 10 |
| peer-reviewed | 9 |

Method: 14-modality sweep (30 agents) → adversarial screen per modality → strict
adjudication of 176 deduped candidates (22 agents) → independent crosscheck hunting false
passes, which demoted 14. Two independent Codex/GPT passes, one blind and one adversarial,
run against the same brief. Key claims re-verified by direct fetch of primary documentation.

**Numbers deliberately not repeated here:** "43% of LLM spend is wasted," "95% savings,"
"$1M–$5M commit → 15–25% off," Gemini's "90% cache discount" (primary source says 75%).
Each traced to blogspam or contradicted a primary source.
