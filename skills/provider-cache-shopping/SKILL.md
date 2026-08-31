---
name: provider-cache-shopping
description: Use when comparing prompt-cache economics across two or more LLM providers before picking a vendor split or gateway route, when auditing a multi-provider cost dashboard for the right cache telemetry field per vendor, when someone hands you a provider's "caching doesn't change the output" claim and asks whether that's proven, when a Gemini bill looks 6-14x higher than expected after copying Anthropic-style cache_control markers over, when a Bedrock request keeps paying full input price despite a stable system prompt, when comparing Anthropic vs OpenAI vs Gemini vs Bedrock vs Azure vs DeepSeek vs Moonshot/Kimi vs Qwen/DashScope vs Baidu ERNIE vs StepFun vs Groq vs Fireworks prompt-caching pricing or TTLs, or when someone proposes routing traffic to whichever provider currently has the cheapest cache discount.
---

# Provider Prompt-Cache Shopping

## Overview

Every provider's prompt cache answers two separate questions, and they get graded differently. First: is the cache marker itself (`cache_control`, `cachePoint`, a cache-ID reference, or nothing at all because it's automatic) just metadata — never rendered into the prompt? That's often independently checkable and can earn PASS_METADATA. Second: is the model's output on a cache hit actually byte-identical to what an uncached run would produce? Nobody outside the vendor has run that replay. Every entry that answers it with "the provider's docs say so" caps at CONTRACTUAL_ONLY — and every provider that never even raises the question caps lower still, at INSUFFICIENT_EVIDENCE. That ceiling is structural, not a vendor-specific ding: it's true of Anthropic, OpenAI, Gemini, Bedrock, DeepSeek, Groq, and Fireworks alike, because a cache hit can genuinely land a request in a different batch shape than a cold run (see the Fireworks trap below).

This skill is for comparing *pricing mechanics and telemetry fields* across providers — never for comparing output quality, and never as license to route live traffic toward whichever provider's cache happens to be cheapest this week (that's model routing wearing a caching costume; see the Do NOT section). It also doesn't cover TTL right-sizing on a single provider — that's `prompt-cache-ttl` — or semantic/response caching, which changes what's rendered and is a different category entirely.

## When to use

- Building or reviewing a cross-provider LLM cost dashboard and need the correct cache-hit field name per vendor.
- Deciding how much weight a vendor's "output is unchanged on a cache hit" sentence deserves before repeating it to a customer.
- A Gemini bill spiked after porting an Anthropic-style caching integration over unchanged.
- A Bedrock, Azure, or any provider's cache-read tokens are stuck at zero despite an obviously stable prefix.
- Someone proposes picking a provider based on whose cache discount is deepest this week.
- Onboarding a new inference-specialist route (Groq, Fireworks, or similar) and need to know what its caching claim actually is versus what other cost claims from the same vendor cover.

## Price structure and TTL, provider by provider — id 60, id 82, id 98, id 105, id 93, id 94, id 44, id 185, id 199, id 206, id 207, id 205, id 335, id 336

| Provider | Cache write | Cache read discount | TTL | citation |
|---|---|---|---|---|
| Anthropic | 1.25x base (5m) / 2x base (1h) | 90% off (0.1x) | 5m or 1h, customer-set | id 60 (CONTRACTUAL_ONLY) |
| OpenAI | free — fully automatic | 50-90% off by model tier | not published | id 82 (PASS_METADATA) |
| Bedrock | 1.25x/2x, structurally same as Anthropic | discounted (exact % not re-fetched) | optional, duration not stated | id 98 (PASS_METADATA) |
| Azure OpenAI | none stated | 90% confirmed (GPT-5 Global tier) | not published | id 105 (PASS_METADATA) |
| Gemini (implicit) | free — fully automatic | ~90%-class, not confirmed at this specific source | not published | id 93 (INSUFFICIENT_EVIDENCE) |
| Gemini (explicit) | pay-per-write + continuous storage fee for the TTL window | 90% (2.5-tier), confirmed on live pricing page | customer-set | id 94, id 44 (CONTRACTUAL_ONLY) |
| DeepSeek | free — default-on | 98-99% off | **no fixed ceiling** — "a few hours to a few days" | id 185 (CONTRACTUAL_ONLY) |
| Moonshot/Kimi | free — automatic above 256 tokens | UNQUANTIFIED at the primary source | not published | id 199 (INSUFFICIENT_EVIDENCE) |
| Qwen/DashScope explicit | 125% surcharge | 90% off (0.1x) | 5 minutes | id 206 (CONTRACTUAL_ONLY) |
| Qwen/DashScope implicit | 100%, non-disableable | 80% off (0.2x) | not published | id 206 (CONTRACTUAL_ONLY) |
| Baidu ERNIE | free — mandatory default-on | 60% off (0.4x) | not published; hit not guaranteed even on byte-identical input | id 207 (INSUFFICIENT_EVIDENCE) |
| StepFun | free — automatic above 256 tokens | 80% off (0.2x) | not published | id 205 (CONTRACTUAL_ONLY) |
| Groq | free — no write/storage fee, cannot disable | 50% off | 2h, recency-based; only 3 models today | id 335 (CONTRACTUAL_ONLY) |
| Fireworks | free — default-on everywhere | 50% serverless (varies by model); near-free on dedicated | not published | id 336 (CONTRACTUAL_ONLY) |

## Invariance language — what each vendor actually publishes

Some vendors state the identity claim explicitly, in their own words, and that claim caps their entry at CONTRACTUAL_ONLY: Groq — "The actual model inference and response generation occur normally, maintaining identical output quality whether caching is used or not" (id 335, CONTRACTUAL_ONLY). Fireworks — "The response you receive will be identical to what you would get if prompt caching was not used. Each generation is sampled from the model independently on each request" (id 336, CONTRACTUAL_ONLY). StepFun — "Caching does not affect model quality. Each generation still uses the full prompt" (id 205, CONTRACTUAL_ONLY). Qwen/DashScope — "不影响回复效果" ("without affecting reply quality"), found verbatim in both the page body and its `<meta>` description tag (id 206, CONTRACTUAL_ONLY).

Other vendors never raise the question at all, which is a different and weaker evidence class than CONTRACTUAL_ONLY — INSUFFICIENT_EVIDENCE, because there's no claim to even cede to the vendor. Moonshot/Kimi's docs describe only the mechanism (a full raw-HTML grep found zero hits for "identical," "unchanged," "same output," or "no impact" anywhere) — id 199 (INSUFFICIENT_EVIDENCE). Baidu ERNIE's docs are the same shape but more extreme: mandatory default-on for every caller, and a grep of the full 951KB page for "不影响" (does not affect) and "质量" (quality) returns zero matches each — id 207 (INSUFFICIENT_EVIDENCE).

## Traps

### Anthropic's own invariance quote was never on the page it cited — id 60 (CONTRACTUAL_ONLY)
An earlier pass of this entry quoted Anthropic's docs as saying caching "does not alter model behavior, outputs, or reasoning." A later raw-HTML re-fetch of that exact page, done specifically to check the quote, found zero hits for the string — the identity sentence wasn't there. (The pricing numbers, 1.25x/2x write and 0.1x read, come from a separate confirmation and weren't re-checked in that same pass.) A verdict resting on a quote is only as good as the last time somebody actually grepped the source.

### cache_control markers actively hurt Gemini — id 169 (PASS_METADATA)
Sending an Anthropic-style explicit `cache_control` block to a Gemini/Vertex-Gemini endpoint is confirmed, verbatim against the OpenHands SDK source: "Do NOT add Gemini: explicit cache_control markers freeze its cache at the static prefix and disable Google's implicit caching on the growing body (~6-14x cost)." A cost increase, not a saving. The corrective technique (PASS_METADATA) is a routing-layer guardrail that strips `cache_control` before it reaches Gemini rather than porting it over from an Anthropic integration unchanged.

### Bedrock's cache_control never translates to cachePoint — id 27 (PASS_METADATA)
The Vercel AI SDK's Bedrock provider was found emitting Anthropic-dialect `cache_control` while Bedrock's Converse API only reads Bedrock-dialect `cachePoint` — caching silently never engages, confirmed by a binary grep of the built artifact finding zero `cachePoint` writers. Fingerprint: `input_tokens` equal to the full prompt size every turn, `cache_read_input_tokens`/`cache_creation_input_tokens` permanently 0, on `provider=bedrock`+`client=vercel-ai-sdk` traffic specifically.

### Azure's cache_control auto-gate for GPT-5.1 was never shipped — id 228 (INSUFFICIENT_EVIDENCE)
A PR claiming to skip incompatible caching fields on Azure-detected requests was closed unmerged; its replacement was also closed unmerged; a third attempt remains open. The repo is now archived. A direct pull of the current source shows `cache_control` still applied unconditionally with no Azure gate anywhere near it — don't cite this fix as live in production anywhere.

### The whole class caps at CONTRACTUAL_ONLY, and here's why — id 336 (CONTRACTUAL_ONLY)
From the Fireworks entry's own trap field: "batch-nondeterminism (Thinking Machines Lab) means a cache hit can land the request in a different batch shape than a cold run, so byte-identical OUTPUT is a stronger claim than the docs can carry — true of this whole verdict class, which is why the class caps at the provider's word." A mechanism refuter tried to fail Fireworks specifically on this basis; the maintainer overruled it back to CONTRACTUAL_ONLY precisely because the argument applies with identical force to every provider cache in this family — grading one vendor FAIL for a structural property shared by the whole class would make the category incoherent.

## Verify it worked — ground-truth telemetry per provider — id 29, id 82, id 94, id 98, id 105, id 185, id 199, id 207, id 335, id 336

| Provider | Field | citation |
|---|---|---|
| Anthropic | `cache_creation_input_tokens` / `cache_read_input_tokens` (+ `ephemeral_5m`/`1h` split) | id 29 (PASS_ABSOLUTE) |
| OpenAI | `cached_tokens` (in the response's `usage` object) | id 82 (PASS_METADATA) |
| Gemini | `usageMetadata.cachedContentTokenCount` | id 94 (CONTRACTUAL_ONLY) |
| Bedrock | `cacheReadInputTokens` / `cacheWriteInputTokens` | id 98 (PASS_METADATA) |
| Azure OpenAI | `cached_tokens` | id 105 (PASS_METADATA) |
| DeepSeek | `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` | id 185 (CONTRACTUAL_ONLY) |
| Moonshot/Kimi | `usage.cached_tokens` | id 199 (INSUFFICIENT_EVIDENCE) |
| Baidu ERNIE | `cached_tokens`, billed at the 40% rate | id 207 (INSUFFICIENT_EVIDENCE) |
| Groq | `usage.cached_tokens` alongside `usage.prompt_tokens` | id 335 (CONTRACTUAL_ONLY) |
| Fireworks | `fireworks-cached-prompt-tokens` response header (dedicated); usage dashboard (serverless) | id 336 (CONTRACTUAL_ONLY) |

A miss on any of these (`0` where a stable prefix should hit) doesn't by itself say why — TTL expiry, a dialect-translation trap like id 27, or a genuine content change all look identical from the field alone.

## Do NOT do these — they aren't caching levers

### Routing traffic to whichever provider's cache pricing is cheapest — id 62 (FAIL)
Framed as a caching comparison, but Anthropic and Gemini are different weights entirely — moving traffic to chase a lower cache price means a *different model answers the request*. That's model routing, which this register fails outright regardless of how it's dressed up; it does not become a caching lever just because the trigger was a price table. The same logic voids "move new traffic to DeepSeek for its 98% cache-read discount" — id 185's own reasoning is explicit that its economics apply only to traffic already on DeepSeek, not as a reason to route new traffic there.

### Bundling a content-changing field with a metadata-safe one under one caching verdict — id 174 (FAIL)
OpenAI's `prompt_cache_key` alone is a pure routing hint and metadata-safe. But an earlier pass graded it PASS_METADATA bundled together with `cache_tools_list`, which caches an MCP server's tool-list response and serializes it straight into the request's tool-definitions section — if the server's tools change and nobody calls the manual invalidation escape hatch, the model silently reads a stale tool list it would not otherwise have read. That's the model reading different bytes, a straight FAIL, and a reminder to grade each field in a caching feature separately rather than by the feature's headline name.

## Register ids cited

| id | name | verdict |
|----|------|---------|
| 27 | Bedrock cache-dialect translation fix (cache_control <-> cachePoint) | PASS_METADATA |
| 29 | Anthropic API usage-object cache accounting | PASS_ABSOLUTE |
| 44 | Google Gemini Context Caching (implicit + explicit) | CONTRACTUAL_ONLY |
| 60 | Anthropic prompt caching (cache_control breakpoints) | CONTRACTUAL_ONLY |
| 62 | Provider caching-pricing-model divergence (Gemini vs Anthropic) | FAIL |
| 82 | OpenAI automatic prompt caching (cache reads) | PASS_METADATA |
| 93 | Gemini implicit context caching (Developer API & Vertex AI) | INSUFFICIENT_EVIDENCE |
| 94 | Gemini explicit context caching | CONTRACTUAL_ONLY |
| 98 | AWS Bedrock prompt caching | PASS_METADATA |
| 105 | Azure OpenAI prompt caching | PASS_METADATA |
| 169 | Cross-provider trap: explicit cache_control markers actively HURT Gemini | PASS_METADATA |
| 174 | OpenAI prompt_cache_key routing hint and MCP cache_tools_list | FAIL |
| 185 | DeepSeek on-disk context caching | CONTRACTUAL_ONLY |
| 199 | Moonshot/Kimi context caching — no output-invariance statement | INSUFFICIENT_EVIDENCE |
| 205 | StepFun prompt-cache FAQ invariance claim | CONTRACTUAL_ONLY |
| 206 | Alibaba Qwen (Model Studio/DashScope) three-mode Context Cache | CONTRACTUAL_ONLY |
| 207 | Baidu ERNIE/Qianfan mandatory default-on prompt cache | INSUFFICIENT_EVIDENCE |
| 228 | Azure-OpenAI cache_control auto-gating for GPT-5.1 (never shipped) | INSUFFICIENT_EVIDENCE |
| 335 | Groq automatic prompt caching | CONTRACTUAL_ONLY |
| 336 | Fireworks AI prompt caching | CONTRACTUAL_ONLY |
