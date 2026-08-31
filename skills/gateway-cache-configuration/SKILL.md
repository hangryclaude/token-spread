---
name: gateway-cache-configuration
description: Use when configuring or auditing a response cache on an LLM gateway (Cloudflare AI Gateway, Portkey, Kong AI Gateway, Higress, Bifrost, OpenRouter, Fastly AI Accelerator, or a hand-rolled Vercel AI SDK caching middleware), when a "cache hit" might be returning someone else's answer, when choosing or reviewing a cache-key shape (full-body hash vs custom label vs partial-message extraction vs embedding similarity), when deciding whether to trust a `cf-aig-cache-status`, `X-Cache-Status`, or similar hit/miss header as proof of correctness, when a semantic or similarity-based cache is being proposed as a cost-saving feature, when streaming responses behave differently under caching than non-streaming ones, or when auditing whether a gateway's cache can silently collapse two independent temperature>0 samples into one.
---

# Gateway Response-Cache Configuration

## Overview

A gateway response cache stores a full (request, response) pair and replays the response on a later "matching" request, skipping the model call entirely. The only key shape that can never cross-serve is one that hashes the complete, literal request bytes — provider, endpoint, model, auth, and full body — with no reserialization step. Anything looser (a developer-asserted label, a hash of only part of the request, or an embedding-similarity threshold below 1.0) can return a response the model never generated for the tokens actually sent, which is a silent answer swap, not a savings mechanism.

This skill is about the shape of the cache **key** at the gateway response-cache layer — full-body hash, partial-message hash, developer label, or embedding match — and whether it can honestly promise "same request in, same tokens read." It is not about Anthropic's own prompt-cache TTL sizing (`cache-breakpoint-hygiene`, `prompt-cache-ttl` skills cover that placement/timing question) and it is not a spend-dashboard reconciliation tool (`llm-bill-audit` covers that). Every mechanism below is evaluated purely on whether the wire content differs on a hit, never on latency or dollar figures.

## When to use

- Turning on or reviewing a caching feature on any LLM gateway before trusting it in production.
- A "cache hit" rate looks suspiciously high, or a response looks like it answers a different question than the one sent.
- Deciding between a gateway's default exact-match cache and an opt-in custom-key or semantic-cache feature.
- Running best-of-N, ensemble voting, or eval harnesses at temperature>0 through a gateway that caches.
- Auditing whether streaming responses are cached under the same rules as non-streaming ones.

## Key shapes across gateways — id 5, id 361, id 8, id 223 (FAIL)

| Gateway | Key covers | Verdict |
|---|---|---|
| Cloudflare AI Gateway, default | provider + endpoint + model + auth + full body, SHA-256 | FAIL — id 5 |
| Cloudflare AI Gateway, `cf-aig-cache-key` override | whatever string the caller supplies, unrelated to content | FAIL — id 361 |
| Portkey OSS "simple" cache | `SHA-256(JSON.stringify(body)+url)`, no operation scoping | FAIL — id 8 |
| Higress "AI Cache", default | `messages.@reverse.0.content` — the final message only | FAIL — id 223 |

Cloudflare's *default* hash is the only row here that is provably tied to content — it fails only because it never gates on `temperature=0` or a caller-declared idempotency intent, so two deliberately-independent temperature>0 samples with identical bytes collapse into one delivered twice — id 5 (FAIL). The `cf-aig-cache-key` override throws away even that: Cloudflare's own docs say the header "opts the request into caching" under a key the developer picks, with no check that grouped requests are actually equivalent — "there is no equivalence claim to evaluate in the first place," per the register's own adjudication — id 361 (FAIL). Portkey's key at least covers the full body, but with a default 24h TTL and no operation-identity/idempotency scoping, any byte-identical repeat within that 24h window is replayed — id 8 (FAIL). Higress is the worst shape of the four: the key formula structurally cannot see the system prompt, conversation history, model, or temperature, so two different callers whose final message happens to coincide ("yes", "continue", "summarize this") get served each other's stored answer — id 223 (FAIL).

## Traps

### Higress's key is a poisoned default, not a misconfiguration — id 223 (FAIL)

Don't treat this as "an admin forgot to configure it right." The documented alternative GJSON-path examples in Higress's own docs still don't extend the key to system prompt, model, or temperature — even the "more careful" configurations remain exposed to the same class of collision, just a narrower one.

### Portkey silently drops `cache_control` on Anthropic-via-Vertex routing — id 284 (FAIL)

Separate from Portkey's response-cache key shape above: on the Vertex route specifically, `cache_control` blocks are stripped before the request reaches Vertex, so Anthropic's own prompt caching never engages — measured at 0 `cache_read_input_tokens` through Portkey vs 139K+ on an identical request sent directly. Portkey's own team confirmed the mechanism ("this isn't expected behavior"). Open since March 2026 with no linked PR — check the direct route (`@anthropic-ai/vertex-sdk`) if this path matters.

### Kong retries the same dead upstream target on failover — id 282 (CONTRACTUAL_ONLY)

`ai-proxy-advanced`'s balancer could resend an identical, fully-billed request to the target that just failed instead of moving to the next one. Fixed in Kong's own changelog (>=3.10.0.4, >=3.11.0.2, >=3.12.0.0) but caps at CONTRACTUAL_ONLY — a documentation sentence, not a reproduced live test this sweep. Confirm the deployed version before assuming failover doesn't double-bill.

### Kong can duplicate or drop streamed content on truncated SSE — id 283 (FAIL)

A confirmed, dated counterexample to "the gateway is a transparent passthrough": under truncated SSE events, Kong's AI Proxy could reconstruct the client-side stream with duplicated or dropped content relative to what the model actually produced. Fixed in 3.11.0.2, but it's evidence the passthrough guarantee isn't unconditional — verify streamed content length/hash against the upstream provider's own completion if this matters to you.

### A duplicated SSE frame isn't automatically a double bill — id 285 (PASS_ABSOLUTE)

Not every streaming anomaly is a caching or billing defect. Bifrost's `message_start` frame appeared twice per Anthropic response, which looks exactly like a re-billed second call — but tracing the actual merged fix (commit `71708fe3`) showed the duplication was generated entirely inside Bifrost's own inbound-event-translation layer after one upstream Anthropic call had already returned; Anthropic's own usage/cost log carried a single entry the whole time. Confirm structurally (a code trace or a merged fix, not just "the reporter says it's fine") before treating a repeated frame as either a billing bug or a caching bug.

### OpenRouter's "routing key never reaches the model" claim doesn't check out — id 7 (INSUFFICIENT_EVIDENCE)

The `session_id` / `prompt_cache_key` sticky-routing field is marketed as pure routing metadata that never becomes part of the call to the underlying model. Re-fetching OpenRouter's own docs four times could not locate the sentence claimed to support that — one fetch explicitly stated the docs don't say fields are stripped before forwarding. This is a load-bearing identity claim for an unread-by-the-model promise, and it doesn't hold up on independent re-verification, so it caps below PASS. Don't budget this as a confirmed-safe passthrough without running the settling experiment yourself (compare `input_tokens` across fixed-key vs churned-key groups on byte-identical bodies).

### Semantic caching is FAIL by construction — id 222, id 362, id 0 (FAIL)

Embedding-similarity caching is a structural, not implementation, failure: below a similarity threshold of 1.0, a response generated for one prompt gets replayed for a merely-similar one, and 1.0 is not any shipped vendor's default. Kong AI Gateway, Google Apigee, and TrueFoundry all ship this as a first-class feature — Apigee's own default threshold is 0.9, its example policy XML uses 0.95, and TrueFoundry's guidance range is 0.85–0.95 — id 222 (FAIL). Fastly AI Accelerator does the identical thing under a different name: hits are gated by an `x-semantic-cache-key` header and a configurable similarity threshold (default 0.75), and Fastly's own docs concede lowering it "increase[s] the likelihood of a cached response at the risk of returning a lower quality response" — the vendor documenting the tradeoff itself — id 362 (FAIL). Bifrost's `semanticcache` plugin keys stream-cache hits on vector-store embedding distance, not a byte hash, for exactly the same reason — id 0 (FAIL). None of these three reach even CONTRACTUAL_ONLY: that cap requires a vendor claim of content identity to discount, and a similarity threshold below 1.0 is the vendor asserting the opposite.

### Streaming exclusions differ per gateway — id 8, id 223, id 0 (FAIL)

There's no shared convention for whether a streaming response participates in caching at all, so check each gateway's own docs rather than assuming parity with its non-streaming behavior: Portkey's "simple" cache excludes streaming entirely — id 8. Higress explicitly caches "both streaming and non-streaming responses" under the same (broken) key formula — id 223. Bifrost builds dedicated chunk-accumulation-and-ordered-replay machinery specifically to cache streaming responses — but that machinery serves its embedding-similarity keyed plugin, so the extra engineering doesn't rescue the identity guarantee — id 0.

## Verify it worked — ground-truth signals

| Signal | Means |
|---|---|
| `cf-aig-cache-status: HIT` / `X-Cache-Status: Hit` present | The provider was skipped — but the header alone never proves the served content matches what was asked, only that *something* was served — id 361, id 222 |
| Hit rate spikes on a proxy fronting varied system prompts | Possible key-collision signature (Higress-shape) — needs request-content comparison to confirm, not visible from aggregate metrics alone — id 223 |
| `cache_read_input_tokens == 0` on every Portkey→Vertex call | `cache_control` is being dropped in transit, not a TTL or breakpoint issue — id 284 |
| Identical `input_tokens` across fixed-key and churned-key OpenRouter groups, but different cache-hit rates | The routing key affected scheduling, provably not token content — the settling experiment for id 7 |
| Streamed content length/hash differs from the upstream provider's own completion | Wire-level corruption, not a caching decision — id 283 |

## Do NOT do these — they change the output

### Trusting a custom cache key as "grouped correctly" — id 361 (FAIL)

Trusting a `cf-aig-cache-key` custom-key setup without independently diffing full request bodies per key value — Cloudflare's own telemetry cannot show what was skipped.

### Turning on semantic/similarity caching for precision-sensitive output — id 222, id 362 (FAIL)

Turning on Kong, Apigee, TrueFoundry, or Fastly semantic/similarity caching for anything precision-sensitive — a number, a name, code, a date.

### Assuming Higress's default cache key behaves like an exact cache — id 223 (FAIL)

Assuming Higress's default cache key behaves "like an exact cache, just easier to turn on."

### Leaving Portkey's identity-unscoped cache live under resampling — id 8 (FAIL)

Leaving Portkey's identity-unscoped, 24h-TTL body-hash cache live on a route that also does best-of-N or temperature>0 resampling.

### Relying on Cloudflare's default cache under a sampling loop — id 5 (FAIL)

Relying on Cloudflare's default exact-hash cache under a sampling loop without a temp=0 or idempotency-intent gate the docs don't provide.

### Copy-pasting Vercel AI SDK's caching-middleware recipe into an ensembling app — id 363 (FAIL)

Copy-pasting Vercel AI SDK's official "Caching Middleware" recipe (`JSON.stringify(params)` key, no TTL, no sampling-intent gate) into an app that also does ensembling or evals.

### Budgeting OpenRouter's sticky-routing key as a confirmed passthrough — id 7 (INSUFFICIENT_EVIDENCE)

Budgeting OpenRouter's sticky-routing key as a confirmed content-blind passthrough on the vendor's word alone.

## Register ids cited

| id | name | verdict |
|----|------|---------|
| 0 | Bifrost streaming-response caching via chunk accumulation (semanticcache plugin) | FAIL |
| 5 | Cloudflare AI Gateway default exact-hash full-response cache | FAIL |
| 7 | OpenRouter provider-native prompt-cache passthrough via sticky-routing key | INSUFFICIENT_EVIDENCE |
| 8 | Portkey OSS gateway "simple" cache, streaming excluded | FAIL |
| 222 | Embedding-based semantic response caching (Kong, Apigee, TrueFoundry) | FAIL |
| 223 | Higress "AI Cache" default key covers only the final message | FAIL |
| 282 | Kong ai-proxy-advanced balancer retries same failed target | CONTRACTUAL_ONLY |
| 283 | Kong AI Proxy truncated SSE could duplicate/drop streamed content | FAIL |
| 284 | Portkey drops cache_control on Anthropic-via-Vertex routing | FAIL |
| 285 | Bifrost duplicated message_start SSE frame, confirmed no double billing | PASS_ABSOLUTE |
| 361 | Cloudflare AI Gateway custom cache key (cf-aig-cache-key) | FAIL |
| 362 | Fastly AI Accelerator semantic-similarity caching | FAIL |
| 363 | Vercel AI SDK "Caching Middleware" recipe, unscoped no-TTL cache | FAIL |
