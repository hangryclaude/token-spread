# The Strict Identity Register

**Every way to cut LLM cost without changing what the model does.**

Date: 2026-08-10 · 176 candidate techniques adjudicated · 66 pass · 50 rejected · 36 unresolved

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
| Breakpoint placement at volatility boundaries | stops a fast-changing layer invalidating a slow-changing one | placement only — **never reorder content** |
| Canonical 4-breakpoint pattern | system + tools + last-2-user-turns, within the hard cap of 4 | exceeding 4 → HTTP 400 on tool-dense turns |
| 20-block lookback handling | a breakpoint checks at most 20 positions back | a turn adding >20 blocks misses totally, silently |
| TTL selection (5m vs 1h) | 1h for agent loops that pause | **1h requested, 5m silently granted** — verify granted vs requested |
| Per-model minimum thresholds | 512 → 4,096 tokens, **non-monotonic** across generations | below minimum = `cache_creation_input_tokens: 0`, HTTP 200, no error |
| Model-capability gate | don't hard-code a model allowlist | every new model release silently zeroes caching |
| Bedrock dialect translation | `cache_control` ↔ Converse `cachePoint` | checkpoints chain tools→system→messages; editing early invalidates all later |
| **Never send `cache_control` to Gemini** | it is actively harmful there | **6–14× cost penalty** — verified verbatim from primary source |

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

**Not universal:** caching and batch stack on Anthropic/OpenAI/Azure. On **Bedrock, prompt
caching is explicitly unsupported with batch inference.**

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
