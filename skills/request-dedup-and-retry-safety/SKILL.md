---
name: request-dedup-and-retry-safety
description: Use when building a retry wrapper, idempotency layer, or queue in front of Anthropic/OpenAI/Bedrock/Vertex calls, when evaluating whether a job queue's "unique jobs" or "deduplication" feature actually prevents double-billing, when a caller reports getting back someone else's answer or a stale result instead of their own, when wiring AWS SQS FIFO, Step Functions, Bedrock batch jobs, Google Cloud Tasks, Sidekiq Unique Jobs, BullMQ, Temporal, Inngest, or a Kubernetes CronJob in front of a model call, when auditing whether an SDK's idempotency key or a client-side replay gateway is safe to trust with real money, when deciding whether to build request coalescing / singleflight for concurrent identical calls, when explaining why max_tokens truncation-retry cascades or SDK auto-retry-on-timeout are burning spend, or when someone asks "does the provider dedupe my retries for me".
---

# Request Deduplication and Retry Safety

## Overview

Every mechanism here sits between "a caller wants an answer" and "a model gets invoked," and each one answers a different question: was this request already sent, and if so, does the thing checking that actually look at what the request *contains*? The safe end of that spectrum never lets a duplicate request leave the machine at all, and checks it structurally (a Job object already exists, a state already Closed) or against a hash of the real payload. The dangerous end matches on a caller-chosen label — a job id, a Workflow Id, a business key — that was never guaranteed to correspond to the request behind it, so two different requests sharing a label collapse into one, and the second caller silently gets the first caller's answer with no error. That failure is worse than the double-billing this whole category exists to prevent, because double-billing wastes money on the right output and identity collapse serves the wrong output as though it were right.

This is not the prompt-caching category (see the `prompt-cache-ttl` skill) — caching changes a price multiplier on identical bytes the model still processes; dedup and retry mechanics decide whether a request is sent, or which stored response answers it, before the model is ever invoked. Coalescing concurrent in-flight calls into one forward pass belongs here too, and it fails the bar for a different reason: at temperature>0 it hands N-1 callers a sample they never drew.

## When to use

- Deciding whether SDK-level retries or a self-built retry wrapper need their own dedup, or whether the provider already covers it (it does not — id 151).
- Choosing or auditing a queue/workflow/scheduler primitive that will sit in front of a model call: SQS, Step Functions, Cloud Tasks, Sidekiq, BullMQ, Temporal, Inngest, K8s CronJob.
- Reviewing a "unique jobs" / "deduplication" feature's actual key before trusting it with money — is the key derived from the payload, or chosen by the caller?
- Diagnosing a bug report that looks like "I sent request B and got back the answer to request A."
- Deciding whether to build request coalescing (singleflight) for concurrent duplicate calls.
- Explaining a spend spike traced to retries — timeout-triggered double billing or truncation-retry cascades.

## No provider dedupes your retries at all — id 151, id 41 (FAIL)

Checked directly against Anthropic, OpenAI, Google Vertex/Gemini, and AWS Bedrock's synchronous `InvokeModel`: none exposes an idempotency key on the real-time inference endpoint. Every duplicate call — intentional retry or accidental double-send — is a fresh, separately-billed forward pass (id 151). The one place an idempotency key *looks* like it exists makes this worse, not better: both `anthropic-sdk-python` and `openai-python` generate one internally for retries but hardwire `_idempotency_header` to `None`, so it is never transmitted — dead code, not a working safety net, for any product assuming otherwise (id 41).

## Where identity-safe dedup actually lives: the enqueue-time family — id 36, id 187, id 188, id 215, id 217, id 218, id 220

| Mechanism | Check happens | Scope it actually holds | id | verdict |
|---|---|---|---|---|
| K8s CronJob `concurrencyPolicy: Forbid` | in-cluster controller, before any Pod is created | only if the job is provably idempotent — Kubernetes explicitly declines to guarantee that | 187 | PASS_ABSOLUTE |
| K8s CronJob `concurrencyPolicy: Replace` | in-cluster controller, after the prior Pod already dispatched | never for latency-bearing calls — kills the in-flight request but bills both it and its replacement | 188 | FAIL |
| AWS Step Functions `StartExecution` (STANDARD) | AWS control plane, name+input compared | same name+input inside the execution's life plus a 90-day reuse window; hard-errors (`ExecutionAlreadyExists`) on mismatch rather than silently merging; EXPRESS workflows get none of this | 215 | CONTRACTUAL_ONLY |
| AWS SQS FIFO `ContentBasedDeduplication` | AWS managed queue, SHA-256 of the message body | 5-minute window, content-derived; resets if the same body resends after the window, or if an ack is lost and the resend lands past the interval | 217 | CONTRACTUAL_ONLY |
| AWS Bedrock `CreateModelInvocationJob` `clientRequestToken` | AWS control plane, standard idempotency-token pattern | job-level only; the only one of Bedrock/Anthropic-1P-Batches/OpenAI-Batch/Google-Gemini-Batch with a documented key at all | 36 | CONTRACTUAL_ONLY |
| Inngest function `idempotency` (CEL expression over event data) | Inngest's servers, expression evaluated against real payload fields | 24-hour window; only as complete as the fields the expression concatenates | 218 | CONTRACTUAL_ONLY |
| Google Cloud Tasks task-ID dedup | Google Cloud control plane, ID-string equality | PASSES only where the ID is itself derived as a hash of the request content; up to 24h (9 days for legacy queues) before a reused ID is released | 220 | PASS_ABSOLUTE (scoped) |

All of these are structural or provider-asserted at the control plane — none is content-blind by accident the way a caller-chosen job id is. Where they cap at CONTRACTUAL_ONLY it's because the claim that the *downstream model call* was suppressed a second time rests on the provider's word, not a client-observable measurement (id 215, id 217, id 218, id 36).

## Content-blind keys are worse than overspending — id 189, id 190, id 216, id 219

A key the caller invents, rather than one derived from the request body, cannot tell "the same request retried" from "two different requests that happen to share a label." When that gap is hit, the second, genuinely different request is discarded and the caller silently receives the first request's answer — no error, no signal anything went wrong.

- **BullMQ Simple Mode** (id 189, FAIL): `SET deduplicationKey jobId NX` compares a caller string against a caller string, zero bytes of payload. BullMQ's own example encourages an arbitrary application-level id, which is exactly the usage that breaks the guarantee.
- **Sidekiq Enterprise Unique Jobs** (id 216, FAIL): default lock key is `(class, args, queue)` — safe only if `args` *are* the model request payload. Sidekiq's own docs recommend passing small references instead (args are serialized into Redis), which reintroduces the same failure mode from the opposite direction.
- **Temporal Workflow Id Reuse / Conflict Policy** (id 219, FAIL): pure Id-string equality, confirmed by full-text search that the docs never once say "input" or "argument." `Use Existing` returns the caller a handle to the OLD run; the new run's arguments never execute.
- **AWS SQS FIFO explicit `MessageDeduplicationId`** (id 190, CONTRACTUAL_ONLY): unlike content-based dedup on the same product, explicit-id mode compares only the supplied string — two different requests sharing an id through a producer bug collapse into one with nothing surfaced to the caller.

## The waste side: retries and truncation cascades — id 38, id 150, id 155, id 186, id 193

- **SDK auto-retry-on-timeout double billing** (id 150, INSUFFICIENT_EVIDENCE): the largest pure-waste vector in this family by reasoning — a client-side socket timeout re-sends a byte-identical prompt while the original generation may still be running server-side, paying for two forward passes. Held below PASS_REPLAY because Anthropic's own errors doc confirms retries also fire on genuine failures (5xx, connection errors), so naively holding and replaying the original in-flight promise can hand a customer a stale error or broken partial stream instead of the fresh, successful completion a normal retry would have produced.
- **Truncation-then-retry cascades** (id 155, FAIL as a lever, real as waste): confirmed directly against a GitHub issue — $4.31 actual vs $1.50 expected, output/input tokens near 1:1, the fingerprint of a hardcoded `max_tokens` cap discarding partial completions and retrying. Fails the strict bar because the fix (resize `max_tokens`, change chunking) changes the request shape; it's real customer misconfiguration to flag, not a byte-identical-preserving lever.
- **Local idempotency ledger over `Batches.create`** (id 38, FAIL): meant to catch a crash between job creation succeeding and the caller durably recording it — but the ledger is written by that same caller, so it has nothing to check against in exactly the window it exists to cover.
- **Read-path dedup on Claude Code traffic measures negative** (id 186, FAIL): an independent benchmark over 1,839 real transcripts found only 7-8% of file reads are re-reads, median session re-reads 0%, and a diff can exceed the file it patches — theoretical ceiling ~0.2%, measured -1.4% to -2.6%. Corroborates from outside this project that the dedup opportunity itself is close to gone.
- **gRPC token-bucket retry throttling** (id 193, FAIL): reads like scheduling a retry for later; gRFC A6 says throttled attempts are canceled and the failure returned to the app immediately. The bucket can't distinguish a doomed retry from one that would have succeeded, so part of what it "saves" is denied service. Also moot for Anthropic/OpenAI, which speak HTTP, not gRPC.

## Traps

### The dedup key doesn't cover what actually varies the call — id 218, id 216 (CONTRACTUAL_ONLY, FAIL)

Inngest's own worked example keys on `promptHash + userId`, not model, temperature, or system-prompt version — change any of those under the same key and the second, genuinely different call is silently swallowed for 24 hours with no error (id 218). Sidekiq's default key is only as content-aware as `args` actually is; a job that reads mutable state at execution time locks on a reference, not the request (id 216).

### "Use Existing" hands the caller someone else's finished run — id 219 (FAIL)

Reuse a Temporal Workflow Id as a natural correlation key (order number, user id) and a genuinely different request under that Id gets back the OLD run's result under `Use Existing` — the system never looked at the new input.

### Kill-and-restart bills twice, not once — id 188 (FAIL)

CronJob `Replace` kills the in-flight Job and starts fresh when the schedule ticks mid-run. Nothing retracts a request that Pod already dispatched — for any call with real latency, which is precisely the kind long enough to overlap, the provider bills the discarded generation and its replacement both.

### A hard-error dedup gets "fixed" by disabling itself — id 220 (PASS_ABSOLUTE, scoped)

Cloud Tasks dedup only holds where the task ID is a hash of the request content. Teams that reuse an arbitrary business ID hit `ALREADY_EXISTS` on a legitimately different payload and "fix" it by minting a fresh random ID per call — which quietly disables deduplication altogether.

## Verify it worked — id 150, id 155, id 186, id 187, id 188, id 189, id 190, id 216, id 219

| Signal | Means |
|---|---|
| Two calls, same account, byte-identical prompt+params hash, arriving within a short window, first connection closed before a response was delivered | SDK retry-after-timeout double billing (id 150) |
| `stop_reason`/`finish_reason == "length"` rate, output/input token ratio near 1:1 | Truncation-retry cascade (id 155) |
| A queue/workflow's suppression-event count (e.g. BullMQ's `deduplicated` event) with no cross-check against a body hash | Can't tell a true duplicate from a distinct request that collided on a caller-chosen id (id 189, id 216, id 219, id 190) |
| K8s: a scheduled tick with no matching Job `creationTimestamp`, vs. a Job deletion immediately followed by a new Job creation at the same tick | Forbid skipped it (id 187, safe only if the job is idempotent) vs. Replace killed and restarted it (id 188, bills twice) |
| Session-wide re-read / re-request rate on real traffic | Near 0% median is itself a finding — the content-blind dedup opportunity may already be close to gone (id 186) |

## Do NOT do these — they change the output

### Coalescing concurrent identical requests into one forward pass — id 6, id 35 (FAIL)

No gateway checked in the wild does this (Cloudflare AI Gateway, LiteLLM, Portkey, Helicone, Bifrost — id 6), and the one design that explicitly implements it says so in its own words: every waiter gets "the one sample that was actually drawn," identical for all of them at temperature>0 (id 35). That is not deduplication — it is silently deciding two logical calls only needed one answer between them.

### Client-side idempotency-key gateway without body-to-key binding — id 37 (FAIL)

Caches a response under a caller-supplied Idempotency-Key and replays it on reuse, but the reference implementation never verifies the key actually corresponds to the body attached to it. A key reused across two different requests — bug or namespace collision — silently serves the wrong stored answer. If you build your own, derive the key from a hash of the canonicalized body; don't adopt the referenced implementation as-is.

## Register ids cited

| id | name | verdict |
|----|------|---------|
| 6 | No request coalescing / singleflight dedup exists in any checked gateway | FAIL |
| 35 | In-flight request coalescing (N concurrent identical -> 1 forward pass) | FAIL |
| 36 | AWS Bedrock CreateModelInvocationJob clientRequestToken | CONTRACTUAL_ONLY |
| 37 | Client-side idempotency-key gateway without body-to-key binding | FAIL |
| 38 | Local idempotency ledger over non-idempotent Batches.create | FAIL |
| 41 | SDK-generated idempotency key never actually transmitted | FAIL |
| 150 | SDK auto-retry-on-timeout double billing | INSUFFICIENT_EVIDENCE |
| 151 | No idempotency key at any major provider's real-time endpoint | FAIL |
| 155 | Truncation-then-retry cascades (max_tokens mismatch) | FAIL |
| 186 | Read-path dedup in Claude Code sessions measures negative | FAIL |
| 187 | K8s CronJob concurrencyPolicy: Forbid | PASS_ABSOLUTE |
| 188 | K8s CronJob concurrencyPolicy: Replace | FAIL |
| 189 | BullMQ job deduplication (Simple Mode) | FAIL |
| 190 | AWS SQS FIFO MessageDeduplicationId (explicit) | CONTRACTUAL_ONLY |
| 193 | gRPC retry throttling (token-bucket retry budget) | FAIL |
| 215 | AWS Step Functions StartExecution idempotency (STANDARD) | CONTRACTUAL_ONLY |
| 216 | Sidekiq Enterprise Unique Jobs (default lock key) | FAIL |
| 217 | AWS SQS FIFO ContentBasedDeduplication (SHA-256 of body) | CONTRACTUAL_ONLY |
| 218 | Inngest function-level idempotency (CEL expression) | CONTRACTUAL_ONLY |
| 219 | Temporal Workflow Id Reuse Policy / Conflict Policy | FAIL |
| 220 | Google Cloud Tasks task-ID deduplication | PASS_ABSOLUTE |
