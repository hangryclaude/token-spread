---
name: batch-tier-work
description: Use when moving evals, backfills, nightly enrichment jobs, or embeddings runs off the synchronous API and onto a provider's batch/async tier to cut token costs and API bills by 50%, deciding whether a job is latency-tolerant enough to qualify, resubmitting a partial or expired batch, picking cache TTL or flex/priority service tiers for batch work, or checking that a "batch discount," "cost," or "resubmission" claim didn't quietly change which tokens the model reads.
---

# Batch-Tier Work

## Overview

Every major provider's async/batch endpoint bills the same model, the same weights, the
same tokens at half price — in exchange for giving up the guarantee of an immediate
answer. That trade is free money for any workload that doesn't have a human waiting on
it. This skill is the list of ways to take that trade correctly, and the list of ways
teams break it by accident.

**The bar:** in scope only if it does not change the token sequence the model reads, the
model that answers, or the amount of thinking the model does. `CONTRACTUAL_ONLY` means
the provider's documentation is the only evidence — no measurement proves byte-identity
to the sync path, because the request never runs the sync path at all. That's still a
pass: it's an opt-in tier switch, not a content change. Ship it opt-in, never as a silent
default.

## What qualifies as batch-eligible

A job qualifies if nothing downstream is polling for the answer within seconds. Concretely:

- **Evals** — you're scoring a model run, not serving a chat turn.
- **Backfills** — reprocessing historical data through a new prompt or schema.
- **Nightly enrichment** — cron/scheduled jobs that write results a human reads tomorrow.
- **Embeddings** — bulk vectorization for search/RAG indexes built ahead of query time.

Anthropic's Message Batches API is messages-only (no embeddings endpoint exists at
Anthropic today). OpenAI's Batch API accepts `/v1/embeddings` alongside
`/v1/chat/completions`. Check your provider's batch-endpoint list before assuming a
workload type is covered — the discount only applies to endpoints the batch surface
actually exposes.

## The levers

| # | Lever | Verdict | id(s) |
|---|---|---|---|
| 1 | Sync → async batch endpoint, flat 50% off input+output | `CONTRACTUAL_ONLY` | 34, 63, 69, 77, 85, 97, 99, 104, 128, 137 |
| 2 | Batch discount stacks with prompt-cache reads (Anthropic) | `CONTRACTUAL_ONLY` | 77 |
| 3 | 1h vs 5m cache TTL selection for batch-length turnaround | `PASS_METADATA` | 173 |
| 4 | Errored/canceled/expired batch requests bill at zero | `CONTRACTUAL_ONLY` | 181 |
| 5 | Partial-batch resubmission — resend only the unfinished subset | `PASS_REPLAY` | 258 |
| 6 | Provider-native idempotent job creation (Bedrock) | `CONTRACTUAL_ONLY` | 36 |
| 7 | Transparent auto-batcher over eval traffic (inspect_ai) | `CONTRACTUAL_ONLY` | 261 |
| 8 | Queue/time-threshold accumulation dispatcher | `CONTRACTUAL_ONLY` | 263 |
| 9 | Flex processing (`service_tier=flex`, OpenAI) | `CONTRACTUAL_ONLY` | 86 |
| 10 | K8s CronJob `concurrencyPolicy: Forbid` skips a redundant overlap run entirely | `PASS_ABSOLUTE` | 187 |

### 1. Sync → async batch endpoint

Flat 50% off both input and output tokens. Confirmed independently against primary docs
for Anthropic, OpenAI, Google Gemini, Azure OpenAI, and AWS Bedrock (ids 34, 63, 69, 77,
85, 97, 99, 104, 128, 137 — all `CONTRACTUAL_ONLY`). Mechanics: separate submission
endpoint, most jobs complete under an hour, hard cap 24h, each request processed
independently. Detectable purely from which API surface was hit — batch vs synchronous
is a routing fact, not a content fact.

Trap: **Bedrock batch inference does not support tool calling or structured output**
(id 99) — any tool-using workload is categorically ineligible without restructuring the
request (which is itself a separate, non-passing change).

### 2. Stacking with prompt-cache reads

Anthropic's batch pricing and prompt-cache discount stack — three independently
documented sentences confirm it (id 77, `CONTRACTUAL_ONLY`). Gemini is the opposite case:
stacking batch with context caching is **not documented as supported** (id 97's own trap)
— don't assume compounding discounts port across providers.

### 3. Cache TTL for batch turnaround

Caching breaks even after 1 read on the 5-minute TTL or 2 reads on the 1-hour TTL (id 173,
`PASS_METADATA`, quoting Anthropic's pricing doc directly). For a batch job that may sit
in queue for up to 24h before its second read, the 1h TTL is usually the right pick.

Trap: a correctly-formed 1h-TTL request has been observed silently billed and retained as
5m server-side (register id 30, `FAIL` — a provider bug, not a technique; cited here as
the evidence behind id 173's own trap note). Verify the **granted** TTL from
`usage.cache_creation.ephemeral_1h_input_tokens` vs `ephemeral_5m_input_tokens`, never
assume the ttl parameter you sent is the ttl you got.

### 4. Errored/canceled/expired requests bill at zero

Anthropic states Message Batches results with `result_type` in `errored`, `canceled`, or
`expired` are not charged (id 181, `CONTRACTUAL_ONLY`). Don't build "cost of failed batch
attempts" into a margin model as if it were a real line item — it isn't one. Zero-output
refusals are the same shape at the single-request level (id 176, `CONTRACTUAL_ONLY`,
`stop_reason="refusal"` with `output_tokens=0`, unbilled).

### 5. Partial-batch resubmission

On failure or expiry, resend only the rows that don't yet have a result — never the whole
batch (id 258, `PASS_REPLAY`). A batch that expired 95% complete should only re-cost the
remaining 5%. Verify by checking that the resubmitted request file's line count equals
`total_requests − already_answered`, never the original total.

This is the one lever in this skill where the popular open-source tooling gets it wrong
more often than right — see **Known-broken implementations** below before you build on
any of them, or write your own resubmission layer instead.

### 6. Provider-native idempotent job creation

AWS Bedrock's `CreateModelInvocationJob` accepts a caller-supplied `clientRequestToken`:
repeat the call with the same token during an orchestrator retry and you get back the
same `jobArn`, not a second billed job (id 36, `CONTRACTUAL_ONLY`). It is the only one of
the four major batch providers with this — Google's own docs state outright that a
duplicate batch-creation request creates two separate billed jobs. Anthropic 1P Batches
and OpenAI Batch have no documented equivalent either; don't assume one.

Trap: rolling your own idempotency ledger client-side to cover this gap is tempting and
was checked — it doesn't work. If the orchestrator crashes between `create()` succeeding
and the caller durably writing that fact to its own ledger, the ledger is exactly what the
crash prevented from being written (id 38, `FAIL` — withdrawn after two independent
reviewers found the same self-referential flaw). Use the provider's own idempotency key
where one exists; don't build a substitute.

### 7–8. Auto-batching and accumulation dispatchers

`inspect_ai`'s `BatchConfig` routes eligible eval traffic onto the ~50%-discounted batch
tier by size/time threshold, with captured request bodies unchanged between batched and
unbatched runs (id 261, `CONTRACTUAL_ONLY`). The general pattern — accumulate synchronous
requests until a size or time threshold, then flush as one batch submission — is real and
portable, but the specific reference implementation checked (id 263, `CONTRACTUAL_ONLY`)
is a 6-star, 13-month-stale demo: treat it as illustrating the shape, not as a citation
for wide production use.

Trap if you build this on a message queue: AWS SQS `ContentBasedDeduplication` only
catches duplicates within a **5-minute** window (id 217, `CONTRACTUAL_ONLY`). A daily cron
that legitimately re-submits the same content on a 24-hour cadence is not deduped by this
— you'll pay for it twice and the queue won't warn you.

### 9. Flex processing (OpenAI)

`service_tier=flex` gets roughly the batch-API discount rate plus stacked cache savings,
on the synchronous endpoint, no polling required (id 86, `CONTRACTUAL_ONLY`). Trap: no
primary-doc statement confirms identical weights/precision to standard serving, and flex
requests occasionally return an unbilled 429 "Resource Unavailable" instead of an answer —
fine for a retry-tolerant nightly job, wrong for anything a user is waiting on.

Anthropic's equivalent capacity levers point the other way. Priority Tier is a
capacity/latency **premium**, not a discount, and the source that surfaces it frames it as
a cost-increase pattern commonly mis-bought as savings (id 123, `CONTRACTUAL_ONLY`, its
own `class` field literally reads `NOT_A_SAVING`) — don't recommend it as a batch-tier
lever. `inference_geo` region pinning costs a flat +10% (part of id 78). Fast Mode's
output-identity relative to standard mode has no primary-source confirmation either way
(id 78, `INSUFFICIENT_EVIDENCE` — not a recommendation, flagged so silence here doesn't
read as a pass).

### 10. Skip redundant scheduled runs entirely

For nightly/cron enrichment specifically: Kubernetes CronJob's
`concurrencyPolicy: Forbid` means the controller checks only whether a previous Job is
still running before deciding whether to create a new one — if one is, no Job, no Pod, no
request is ever sent (id 187, `PASS_ABSOLUTE`, structural, not provider's word). Nothing
was sent, so nothing about a request can have changed.

Scope caveat carried in the entry's own title: this only holds where the skipped job is
provably idempotent — Kubernetes' own docs decline to guarantee that and put it on the
operator. **Do not use `concurrencyPolicy: Replace`** as the "safer-sounding" alternative:
it kills the in-flight Pod and starts a new one, but nothing retracts a model request the
killed Pod already dispatched — the provider bills the discarded generation and then bills
its replacement (id 188, `FAIL`, split out of the same source specifically because the
first pass had graded both policies as one passing entry and dropped the half that failed).

## Do NOT do these — they change the output

Everything below either feeds the model fewer/different tokens, routes it down a
different path, or silently substitutes a stored answer for a fresh one. None of it
belongs in a batch-tier pitch even though it shows up adjacent to batch/backfill/cron
workloads in the wild.

**Classic shape — prompt trimming, semantic caching, routing, compaction:**

- **id 146**, `FAIL` — trimming tool/function schema description verbosity. Shrinks the
  actual request payload; the model reads a materially smaller sequence.
- **id 157**, `FAIL` — stripping unused tool schemas and memory from scheduled/cron agent
  runs. Measured 88–93% token reduction — that reduction *is* the model reading a
  different, smaller input on every run. Directly relevant to this skill's own "nightly
  enrichment" use case: fixing genuine context bloat in a cron agent is real engineering
  value, but it is not a batch-tier saving and must not be pitched as one.
- **id 171**, `FAIL` — getting the model to emit fewer, larger tool-call turns is a
  prompt/behavior change (client-side concurrent tool *execution* is fine and is itself
  `PASS_SCHEDULING`-shaped; only the "get the model to behave differently" half fails).
- **id 174**, `FAIL` — not `prompt_cache_key` itself (that part is a clean routing hint, no
  different from Anthropic's `cache_control`). The failing half is the OpenAI Agents SDK's
  MCP `cache_tools_list=True`: it caches a server's tool-list response client-side with no
  auto-invalidation, so when the upstream tool schema changes and nobody calls
  `invalidate_tools_cache()`, the model silently reads a stale tool list — that stale list is
  serialized straight into the request, so it's prompt content, not metadata.
- **id 222**, `FAIL` — embedding-based semantic response caching (Kong, Apigee,
  TrueFoundry). Serves a stored answer for a "similar enough" query, not the same one.
- **id 223**, `FAIL` — Higress "AI Cache" plugin keys its cache on the final message only,
  ignoring the rest of the request.
- **id 238**, `FAIL` — schema `$ref` dedup + optional-field trimming + embedding-similarity
  tool retrieval, bundled as one change.

**Batch-specific — tools that silently corrupt or re-bill instead of replaying correctly:**

- **id 259**, `FAIL` — a whole-pipeline resume cache (bespokelabs/curator) keyed on a hash
  of the prompt-*function's* source, not the full rendered request. A `prompt_func` that
  reads wall-clock time, an env var, or an external API produces a different real request
  on the next run while the fingerprint — and the cache hit — stay identical; a stale
  stored answer gets served for a request that was never actually re-derived.
- **id 306**, `FAIL` — BatchLLM's checkpoint fingerprint hashes model/prompt-template/params
  but not the multi-field template substitutions its own README advertises as a headline
  feature. Edit a non-hashed template field, resume from checkpoint, and the row the model
  would actually read on a fresh call is never sent — a stale translation gets replayed
  verbatim instead.
- **id 304**, `FAIL` — langbatch's `AnthropicBatch.retry()` resubmits the **entire original
  batch file** on every call, including already-succeeded rows — the model redoes work it
  already finished, at full cost, every retry. The gated `is_retryable_failure()` path that
  looks like it should prevent this can never fire (see reference doc below).

Full code-level detail on the wrapper-library bugs — exact lines, commit hashes, and the
two lower-severity siblings that mislabel status but don't lose or re-bill results (ids
303, 305) — is in
[references/wrapper-library-bugs.md](references/wrapper-library-bugs.md).

## Verify it worked

| Signal | What it proves |
|---|---|
| Request hit the `/batches` or Batch Mode endpoint, not the synchronous endpoint | Lever 1 engaged — visible in your own request routing, not the provider's response |
| Batch-tier unit price on the invoice (≈50% of standard per-token rate) | Lever 1 actually billed at the discount, not just routed |
| `usage.cache_read_input_tokens` / `cache_creation_input_tokens` present on batch results | Lever 2 — cache stacking is active inside the batch job |
| `usage.cache_creation.ephemeral_1h_input_tokens` vs `ephemeral_5m_input_tokens` | Lever 3 — confirms the **granted** TTL, not just the requested one |
| Batch `result_type` in `errored`/`canceled`/`expired` with no matching charge line | Lever 4 |
| Resubmitted batch's line count = `total_requests − already_answered`, never the original total | Lever 5 working correctly (id 304's bug is line count == original total every time) |
| CloudTrail shows >1 `CreateModelInvocationJob` calls with an identical `clientRequestToken` resolving to one `jobArn` | Lever 6 |
| Provider dashboard shows fewer, larger batch submissions for the same eval workload vs one-off calls | Lever 7 |
| `service_tier: "flex"` in request/response metadata, plus watch for elevated latency or 429 rate | Lever 9 |
| Scheduled tick with no corresponding Job `creationTimestamp` in job history | Lever 10 (Forbid skip) — a Job deletion immediately followed by a new Job creation at the same tick means you're on `Replace` instead and losing money on overlaps |

## Quick reference

| Situation | Do | Don't |
|---|---|---|
| Nightly enrichment cron job, no one reading the output for hours | Route to batch endpoint (lever 1), pick 1h TTL if turnaround > 5min (lever 3) | "Optimize" by trimming its tool schemas/memory (id 157 — that's a FAIL, not a batch lever) |
| Batch expired 60% complete | Resend only the unfinished 40% (lever 5) | Call a wrapper library's `.retry()` without checking it does partial resubmission (id 304 resubmits 100%) |
| Orchestrator might crash mid-submit | Use the provider's native idempotency key if one exists (lever 6, Bedrock only) | Build your own crash-recovery ledger (id 38 — self-defeating by construction) |
| Need batch-rate pricing but can't tolerate 24h queue latency | OpenAI flex processing (lever 9) if request-level retry is acceptable | Anthropic Priority Tier, expecting a discount (id 123 — it's a premium) |
| Building a resubmission/checkpoint layer yourself | Hash the full rendered request, byte-identical (id 258's shape) | Hash a "recipe" — function source, config fields — that can drift from the real request (ids 259, 306) |

## Register ids cited

| id | name | verdict |
|----|------|---------|
| 30 | Server-side TTL override / 1h-TTL-requested-but-5m-TTL-billed (Claude... | FAIL |
| 34 | Async/batch billing path — 50% discount vs synchronous API, same mode... | CONTRACTUAL_ONLY |
| 36 | AWS Bedrock CreateModelInvocationJob clientRequestToken — provider-na... | CONTRACTUAL_ONLY |
| 38 | Local idempotency ledger over non-idempotent Batches.create (crash-re... | FAIL |
| 63 | Batch API (async, 50% flat discount) | CONTRACTUAL_ONLY |
| 69 | OpenAI / Anthropic / Google Batch APIs | CONTRACTUAL_ONLY |
| 77 | Batch API: 50% discount, availability, and stacking with prompt-cache... | CONTRACTUAL_ONLY |
| 78 | Service tiers: Priority Tier status change, Standard, Batch; Fast mod... | INSUFFICIENT_EVIDENCE |
| 85 | Batch API (asynchronous 50% discount) | CONTRACTUAL_ONLY |
| 86 | Flex processing (service_tier=flex) | CONTRACTUAL_ONLY |
| 97 | Gemini Batch API / Vertex Batch prediction | CONTRACTUAL_ONLY |
| 99 | AWS Bedrock batch inference — and the 'Bedrock lacks Anthropic Batch... | CONTRACTUAL_ONLY |
| 104 | Azure OpenAI Batch API | CONTRACTUAL_ONLY |
| 123 | Priority/Scale tiers as capacity levers (commonly mis-bought as 'savi... | CONTRACTUAL_ONLY |
| 128 | Batch API discount — flagged as technical/boundary item | CONTRACTUAL_ONLY |
| 137 | Async Batch API vs synchronous real-time API | CONTRACTUAL_ONLY |
| 146 | Trimming tool or function schema description verbosity for token savings | FAIL |
| 157 | Zombie context in scheduled/cron agents (unused tool schemas + memory... | FAIL |
| 171 | Batching multiple tool calls into one model turn ("parallel tool call... | FAIL |
| 173 | 1-hour vs 5-minute cache TTL selection for long-latency agent loops | PASS_METADATA |
| 174 | OpenAI prompt_cache_key routing hint and MCP cache_tools_list | FAIL |
| 176 | Zero-output refusals are not billed (Anthropic, from 2026-06-02) | CONTRACTUAL_ONLY |
| 181 | Message Batches: errored, canceled and expired requests bill at zero | CONTRACTUAL_ONLY |
| 187 | K8s CronJob concurrencyPolicy: Forbid — skip-on-overlap, valid only w... | PASS_ABSOLUTE |
| 188 | K8s CronJob concurrencyPolicy: Replace — kill-and-restart on overlap | FAIL |
| 217 | AWS SQS FIFO ContentBasedDeduplication — SHA-256 of message body | CONTRACTUAL_ONLY |
| 222 | Embedding-based semantic response caching shipped as a first-class fe... | FAIL |
| 223 | Higress "AI Cache" plugin's default cache key covers only the final m... | FAIL |
| 238 | SEP-1576: schema $ref dedup + optional-field trimming + embedding-sim... | FAIL |
| 258 | Partial-batch resubmission on failure/expiry (only resend the unfinis... | PASS_REPLAY |
| 259 | Whole-pipeline resume cache keyed on prompt-function source hash | FAIL |
| 261 | Native transparent auto-batcher: size/time-threshold scheduling layer... | CONTRACTUAL_ONLY |
| 263 | Queue-threshold / time-threshold accumulation dispatcher for moving s... | CONTRACTUAL_ONLY |
| 303 | instructor (567-labs) Anthropic batch provider: dead processing_statu... | FAIL |
| 304 | langbatch (EasyLLM) AnthropicBatch.retry() resubmits the full origina... | FAIL |
| 305 | batchata (agamm) Anthropic get_batch_status(): same dead processing_s... | FAIL |
| 306 | BatchLLM (he-yufeng) — SHA-256 checkpoint fingerprint gates crash-res... | FAIL |
