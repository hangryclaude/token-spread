---
name: llm-bill-audit
description: Use when a token cost or spend dashboard (Langfuse, Helicone, Datadog LLM Observability, OpenLLMetry, tokencost, litellm, opencode, Claude Code /usage) disagrees with what the provider actually billed, when investigating a spend spike or "ghost charge", when checking whether a requested cache TTL, Batch API discount, or BYOK key was actually honored, when auditing streaming-disconnect billing or cache read/write token accounting, or when setting up spend caps and anomaly detection without touching prompts, routing, or output.
---

# LLM Bill Audit

## Overview

The provider's usage object is the only number that can't lie — id 29, PASS_ABSOLUTE. It's already-billed response metadata, not an estimate. Every dashboard, cost calculator, and observability tool sits downstream of it, and at every parsing/pricing/summing step something has been caught getting it wrong. None of that touches what you were actually charged. This skill is a reconciliation checklist for catching a dashboard lying, plus the provider-side levers that change whether or when a request is sent without changing what the model reads, answers, or thinks.

## When to use

- A cost dashboard's number for a call, trace, or period doesn't match the provider invoice.
- Cache hit rate or `cache_read_input_tokens` looks wrong and you don't know if it's the provider, a gateway, or the dashboard.
- Investigating a spend spike, a "ghost charge," or a billing-classification incident.
- Deciding what spend caps or anomaly detection to turn on for an account.
- A number moved after a model version bump and you're not sure if that's a real cost change.

## Ground truth: the usage object — id 29, id 81

Anthropic responses already carry `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, and the `ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` split inside `cache_creation`. `hit_rate = cache_read / (cache_read + cache_creation + input)`. For preflight estimates use `/v1/messages/count_tokens` — free, rate-limited independently of message creation (id 81, CONTRACTUAL_ONLY — provider's word, opt-in, never default; read-only, so nothing to opt out of on the output side). Trap: `cache_read_input_tokens == 0` proves a miss, never why — TTL expiry, dynamic content ahead of the breakpoint, a too-short prefix, and breakpoint-budget overflow all look identical from outside (id 29).

## Reconciliation checklist

Work top to bottom against a number that looks wrong.

**1. Is the price table current, not just recently checked?** tokencost's daily price-sync GitHub Action was silently red for 11 months — badge said active, last real update 2025-09-05 (id 269, PASS_ABSOLUTE). Check the workflow run history, not the README badge. models.dev priced Gemini 3.6 Flash at its January-2027 standard rate instead of the live introductory rate, exactly 2x (id 273, FAIL as a "technique" but a real static-registry drift — diff against the provider's live pricing page). litellm silently drops a custom above-200k tiered-pricing override on proxy startup, ~5% margin erosion over 2,600 requests (id 272, same category). A cited Azure-Luna "copy-paste price cut" turned out to be litellm's team confirming the price change was real, not a bug (id 271) — the lesson survives even though that specific case didn't: verify a suspicious price-table entry against the provider's own page before assuming the table is wrong.

**2. Is the dashboard reading the field the provider actually populates?** LiteLLM's Prometheus integration reads the OpenAI-shaped `usage.prompt_tokens_details.cached_tokens`, which Anthropic's native `/v1/messages` passthrough never fills — real cache hits vanish from that one metric while the bill is correct (id 28, PASS_METADATA, closed). opencode's OpenAI-compatible-gateway path subtracts cache-write tokens out of its own displayed total instead of tracking them — `cache.write` reads permanently 0 while `cache.read` climbs into the millions, a physical impossibility that's the tell (id 231, PASS_ABSOLUTE). OpenLLMetry's Groq/Bedrock span code references `SpanAttributes.GEN_AI_USAGE_CACHE_*` constants that don't exist on the SDK yet; the `AttributeError` is swallowed at debug level and cache tokens vanish from the span (id 287, PASS_ABSOLUTE, unmerged as of source check).

**3. Is a gateway silently breaking caching instead of just mis-displaying it?** Portkey's Vertex-routing path drops `cache_control` before forwarding, so Anthropic prompt caching never fires — `cache_creation_input_tokens` and `cache_read_input_tokens` both stay 0 (id 284, FAIL — this is a real cost increase, a full recompute every call, not a display bug; open and unfixed since March 2026 as of source check). If cache reads never leave zero on a gateway-routed path that should be caching, check the gateway before concluding your workload can't cache.

**4. Is a provider name normalization gap routing BYOK traffic through markup billing?** Helicone's provider-lookup helper covers 17 of 21 canonical providers; xai/perplexity/mistral/helicone fall through to `null` and three call sites silently drop the stored BYOK key, forcing a fallback to Helicone's own pay-through-billing with no error or log (id 292, FAIL — real billing divergence, unmerged fix as of source check).

**5. Is it double-counting a shared trace or a nested span?** Langfuse's Dataset Run summary sums one trace's cost once per dataset item referencing it — 163 items sharing a trace inflated a real $1.46 into a displayed $238 (id 268, PASS_ABSOLUTE). Datadog's LangChain+Anthropic integration ran two `llm`-kind spans per call because its demotion allowlist only had `openai` — ~2.2x overcount, fixed dd-trace-js PR #8938 (id 288, PASS_ABSOLUTE, merged); the same shape hit LangChain+google_genai for 2x, fixed dd-trace-py PR #18868 (id 290, PASS_ABSOLUTE, merged). OpenLLMetry accumulates Anthropic streamed output tokens by adding `message_delta`'s running total onto `message_start`'s already-partial count instead of overwriting — ~1.75% overcount, worse on cache/tool-heavy turns (id 289, PASS_ABSOLUTE, unmerged). Before calling something double-billed, trace it to the wire: a duplicated `message_start` SSE frame in Bifrost looked like two Anthropic calls but was the gateway's own event-translation layer re-emitting one response twice, independently confirmed no second request was sent (id 285, PASS_ABSOLUTE, merged, closes #4556). A retracted aider issue claimed live cache-token double-counting in displayed cost; the author's own follow-up narrowed it to a rarely-hit fallback most users never exercise (id 230, PASS_ABSOLUTE by category, savings "None in the common case" — read the retraction before citing the headline).

**6. Is it under-counting — a suspiciously low number isn't automatically good news.** Langfuse's generic cost calculator silently skips any usage key without a matching price-table row; Gemini's `thoughts_token_count` has no row, so a real $0.064 call displayed as $0.029, ~2.2x under (id 266, PASS_ABSOLUTE). Mirror bug, same tool, opposite direction: Langfuse overestimates Claude cost 2.5x because the upstream OTel exporter doesn't send cache-token data at all, so a cache-heavy call prices as if every token were full-rate input, $3.71 shown vs $1.47 actual (id 267, PASS_ABSOLUTE, blocked on a third-party exporter shipping first). Helicone's cache-write cost calculator always uses the base-tier price even past the 200k-token long-context threshold, roughly halving what long-context cache writes should cost (id 264, PASS_ABSOLUTE, unmerged). Helicone's threshold-pricing function only has tier logic for vertex/google-ai-studio/anthropic/xai; OpenAI/Azure/OpenRouter fall through to a constant-zero threshold, so large-context requests on those providers under-price by roughly 43% (id 265, PASS_ABSOLUTE, unmerged, worked example: $2.625 expected vs $1.50 shown). Datadog's Claude Agent SDK integration reads usage off the SDK's own message stream and drops folded input entirely on a fully cache-served turn (`input_tokens == 0`, large `cache_read_input_tokens`) — the tell, not a free call (id 291, CONTRACTUAL_ONLY — provider's word, opt-in, never default; adjudicated from a PR description, unmerged).

**7. Does the billed cache TTL match the requested TTL?** Compare `cache_control.ttl` on the request against `ephemeral_1h_input_tokens` vs `ephemeral_5m_input_tokens` on the response — a 1h request landing entirely in the 5m bucket is a pure-metadata anomaly (id 30, closed server-side incident, root cause never disclosed — watch for it, don't expect it). 1h writes bill at 2x base input vs 1.25x for 5m; reads stay 0.1x either way, so check whether the premium is actually earning at least 2 within-hour reads (id 61, PASS_METADATA). A LiteLLM Bedrock PR claims 1h-TTL cache writes mis-price ~37% low on the Converse path; it's open, unreviewed by any human maintainer, authored by a bot self-certifying its own fix (id 250, INSUFFICIENT_EVIDENCE — don't build on it yet).

**8. Did the tokenizer change under you?** Identical text is not guaranteed identical billed tokens across model versions. Claude Sonnet 5 (and every model on the new-tokenizer side of the 4.7 boundary) bills ~30% more tokens than Sonnet 4.6 for byte-identical text, confirmed on both the model page and the pricing-page footnote (id 274, FAIL as a technique since it's a real change in what's read — but exactly the fact that makes a cost jump look like a caching regression when nothing else changed). Settle it with `/v1/messages/count_tokens` (id 81) against both versions on the same text.

**9. Did the stream get cut mid-generation?** Tokens already generated before a client disconnect are billed regardless — correct provider behavior, not a bug (Google confirmed primary-doc, OpenAI practitioner consensus, Anthropic inferred — id 152, PASS_ABSOLUTE). The audit job is matching disconnect/cancellation events to partial-generation usage on the same request ID, pure metadata. If reselling through a gateway, don't trust a naive "read `BilledUsage` off the cancellation chunk" — one cited case study got it right only 19 of 40 times; reconcile from an accumulated-usage handle instead (id 153, FAIL as a technique, real accounting risk for a reseller).

**10. Is the misattribution inside your own agent runtime?** Claude Code's `/usage` overattributed cost to MCP servers — a server's bucket grew on every turn following any call to it, not just turns that consumed its result — fixed in v2.1.222 (id 298, CONTRACTUAL_ONLY — provider's word, opt-in, never default; one changelog line, no independent measurement). On an older build, a specific MCP server's cost share looking too high is the likely cause.

## Spend caps and anomaly detection

These change whether a request is sent at all, or which bucket its cost lands in — never what the model reads or answers.

- **Org/workspace spend caps** (Anthropic direct API): Start/Build/Scale tiers cap at $500/$1,000/$200,000 per month; hit it and usage pauses until next month, an all-or-nothing gate with no delivered-but-different branch (id 126, PASS_ABSOLUTE). The Azure/Foundry version of this claim is unverified by the cited source — don't repeat it.
- **Claude Code `--max-budget-usd`**: client-side kill switch in the CLI orchestrator — blocks a subagent spawn once hit (no request sent) and stops still-running background subagents (generation past that point never happens). Requires v2.1.217+ (id 297, CONTRACTUAL_ONLY — provider's word, opt-in, never default).
- **Spend Limits API** (Claude Enterprise): per-member caps resolved `user > seat_tier > rbac_group > organization`, plus a request→approve/deny workflow. `amount: null` = unlimited, `"0"` = can't exceed plan-included usage (id 308, CONTRACTUAL_ONLY — provider's word, opt-in, never default; behavior when a nonzero cap is hit mid-period isn't confirmed by the source).
- **Anomaly detection on spend**: a monitoring layer over billing data that never touches a live request — rolling baseline per key/account, alert on a multiple of trailing baseline (id 127, PASS_ABSOLUTE). AWS Cost Anomaly Detection only sees spend routed through AWS billing; a direct provider invoice paid outside a marketplace is invisible to it.
- **Tagging/attribution for showback→chargeback**: capture team/cost-center/key identity at issuance or via proxy-injected headers, pure metadata (id 125, PASS_METADATA, narrowed on audit). Caveat that survived the narrowing: in LiteLLM, the same tag used for attribution is also what `tag_budgets` enforces spend against — at that point it decides whether a request is sent, so audit any gateway's "attribution" feature separately before assuming it's inert.
- Cited but unverified: a viral "$1,382.59 / 1.3B tokens" Cursor runaway-agent incident — sole source 402'd on re-fetch, no second primary source found (id 296, INSUFFICIENT_EVIDENCE). Cursor's changelog confirms soft/hard account-level limits with alerts exist; it says nothing about this incident.
- Cited but unconfirmed by the provider: a $16.6M "ghost charge" story has press-only coverage and an undisclosed root cause (id 67, FAIL as "not a technique," lowest-confidence item here). A billing-classification incident (usage briefly routed to metered credits instead of plan allocation) was withdrawn from a prior passing verdict on re-check — the issue is open and unconfirmed by Anthropic (id 159, CONTRACTUAL_ONLY — provider's word, opt-in, never default; withdrawn from a prior passing verdict on re-check). Know the failure shape; don't cite either dollar figure as settled fact.

## Verify it worked

| You did this | Check this field | Confirms |
|---|---|---|
| Requested 1h cache TTL | `ephemeral_1h_input_tokens` > 0, `ephemeral_5m_input_tokens` == 0 for that call | Server honored the TTL (id 30, 61) |
| Expect a cache hit | `cache_read_input_tokens` rising relative to `input_tokens` over the session | Cache is being read, not just written (id 29) |
| Routed eligible traffic to Batch | Endpoint/path used (`/v1/messages/batches` vs sync); billed unit price is exactly 50% of sync rate | Batch tier engaged — visible on the invoice as a flat-discount line, no content inspection needed (id 63, CONTRACTUAL_ONLY — provider's word, opt-in, never default) |
| Set an org/workspace spend cap | Cumulative org spend vs. tier cap; whether new requests pause at threshold | Cap enforced, not just displayed (id 126) |
| Compared a dashboard number to the real cost | Pull the same request's raw usage object, recompute by hand from the provider's price page | Dashboard math checked against ground truth, not against itself (id 29 and every entry above) |

## Do NOT do these — they change the output

Each is pitched as billing hygiene or budget safety. Every one fails the bar: the model reads different tokens, a different model answers, or it thinks differently.

- **LiteLLM Budget Fallbacks** — id 211, FAIL. Once a virtual key's per-model cap is hit, silently reroutes to a different model, sometimes a different vendor, and attributes spend to the fallback. A 200 response looks identical either way; only the echoed `model` field reveals the swap.
- **LiteLLM "Headroom" prompt compression** — id 221, FAIL. Rewrites tool-output, RAG, file-read, and DB-result content in the pre-call hook before forwarding; the model reads a shorter, edited message list than the client sent.
- **Context editing / `clear_tool_uses_20250919`** — id 225, FAIL. Deletes the oldest tool_result blocks and substitutes placeholder text once a conversation crosses a length trigger. Sold as an 84% token-consumption cut — real, but the model reads a materially different document every time it fires.
- **Aider's synthetic `max_tokens=1` keep-alive pings** — id 229, FAIL. Fires a real background inference call every ~295 seconds to outrun the 5-minute cache TTL — more model work, not less, regardless of how cheaply that one token is priced.
- **Anthropic `task_budget` (beta)** — id 302, FAIL. Injects a budget-countdown marker into context every turn; the model paces itself, scales down thinking as budget depletes, and may decline or truncate the task early. Explicitly unsupported in Claude Code.
- **Semantic caching** (example: Bifrost's `semanticcache` plugin) — id 0, FAIL. Cache hits keyed by embedding similarity, not exact byte match — can replay a stored response for a prompt that only resembles the one that produced it.

## Register ids cited

| id | name | verdict |
|----|------|---------|
| 0 | Streaming-response caching via semantic-similarity match (Bifrost) | FAIL |
| 28 | cache_read_input_tokens → OpenAI-standard normalization gap in LiteLLM | PASS_METADATA |
| 29 | Anthropic API usage-object cache accounting | PASS_ABSOLUTE |
| 30 | Server-side TTL override / 1h-requested-but-5m-billed | FAIL (trap, not a technique) |
| 61 | Anthropic extended 1-hour cache TTL | PASS_METADATA |
| 63 | Batch API (async, 50% flat discount) | CONTRACTUAL_ONLY |
| 67 | Anthropic $16.6M "ghost charge" billing glitch | FAIL (not a technique, low confidence) |
| 81 | Token counting endpoint (/v1/messages/count_tokens) | CONTRACTUAL_ONLY |
| 125 | Tagging/attribution layer for showback → chargeback | PASS_METADATA |
| 126 | Native budget alerts and hard spend caps (Anthropic) | PASS_ABSOLUTE |
| 127 | Anomaly detection on token/LLM spend | PASS_ABSOLUTE |
| 152 | Streaming disconnect billing | PASS_ABSOLUTE |
| 153 | Gateway-side under/over-accounting on cut streams | FAIL (real reseller risk, not a technique) |
| 159 | Anthropic July 17 2026 billing-classification incident | CONTRACTUAL_ONLY (withdrawn from passing, disputed) |
| 211 | LiteLLM Budget Fallbacks reroute to a different model | FAIL |
| 221 | LiteLLM "Headroom" pre-call prompt compression | FAIL |
| 225 | Context editing (clear_tool_uses_20250919) | FAIL |
| 229 | Synthetic max_tokens=1 keep-alive pings (aider) | FAIL |
| 230 | Client-side double-counting of Anthropic cache tokens (aider) | PASS_ABSOLUTE (mostly retracted/dead code) |
| 231 | OpenAI-compatible gateway loses cache-write accounting (opencode) | PASS_ABSOLUTE |
| 250 | LiteLLM Bedrock 1h-TTL cache-write mispricing PR | PASS_ABSOLUTE |
| 264 | Anthropic long-context cache tiering bug (Helicone) | PASS_ABSOLUTE |
| 265 | Threshold-pricing dead code for OpenAI/Azure/OpenRouter (Helicone) | PASS_ABSOLUTE |
| 266 | Gemini thinking-token omission undercounts Langfuse cost ~2.2x | PASS_ABSOLUTE |
| 267 | Missing cache-token OTel attributes overestimate Langfuse cost 2.5x | PASS_ABSOLUTE |
| 268 | Trace-cost double-counting inflates Langfuse dataset-run totals ~163x | PASS_ABSOLUTE |
| 269 | tokencost's daily price-sync workflow dead 11 months | PASS_ABSOLUTE |
| 271 | Azure GPT-5.6 Luna "price-cut regression" (litellm) | FAIL (confirmed intentional, not a bug) |
| 272 | litellm drops custom above-200k tiered pricing overrides | FAIL |
| 273 | models.dev records Gemini 3.6 Flash at wrong pricing epoch | FAIL |
| 274 | Claude Sonnet 5's new tokenizer bills ~30% more tokens | FAIL |
| 284 | Portkey gateway drops cache_control on Anthropic-via-Vertex | FAIL |
| 285 | Bifrost duplicated SSE frame is a client artifact, not double-billing | PASS_ABSOLUTE |
| 287 | OpenLLMetry references non-existent cache SpanAttributes (Groq/Bedrock) | PASS_ABSOLUTE |
| 288 | Datadog LangChain+Anthropic double-span overcount ~2.2x | PASS_ABSOLUTE |
| 289 | OpenLLMetry Anthropic streamed output tokens double-accumulated | PASS_ABSOLUTE |
| 290 | Datadog LangChain+google_genai double-span overcount 2x | PASS_ABSOLUTE |
| 291 | Datadog Claude Agent SDK drops input tokens on cache-served turns | CONTRACTUAL_ONLY |
| 292 | Helicone silently drops BYOK keys for xai/perplexity/mistral/helicone | FAIL |
| 296 | Cursor unattended-agent spend-cap incident | INSUFFICIENT_EVIDENCE |
| 297 | Claude Code --max-budget-usd hard-halts subagent spend | CONTRACTUAL_ONLY |
| 298 | Claude Code /usage MCP-server cost misattribution, fixed | CONTRACTUAL_ONLY |
| 302 | Anthropic task_budget (beta) | FAIL |
| 308 | Spend Limits API per-Claude-Enterprise-member hierarchy | CONTRACTUAL_ONLY |
