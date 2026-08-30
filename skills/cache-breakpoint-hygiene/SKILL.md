---
name: cache-breakpoint-hygiene
description: Use when placing or debugging cache_control / cachePoint breakpoints for Anthropic, Bedrock, Gemini, OpenAI, or Azure prompt caching — cache_read_input_tokens staying at zero, a token bill or cost that jumped for no obvious reason, a tool-heavy turn silently missing cache, deciding where the 4 breakpoints go, choosing 5m vs 1h TTL, or hitting a Bedrock/Gemini cross-provider caching trap. Covers only placement changes that leave the token sequence the model reads untouched.
---

# Cache Breakpoint Hygiene

## Overview

`cache_control` (and its Bedrock cousin `cachePoint`) is a directive field that tells the
provider's serving layer where to snapshot the KV cache. It sits beside content blocks, never
inside them — the model never reads it. That means WHERE you put it is a pure placement problem:
get it right and you cut 90% off the input-token price on a hit with zero effect on the answer;
get it wrong and you pay full price with no error, ever, on any turn.

This skill is about placement only. Every technique below carries a register verdict —
`PASS_ABSOLUTE` (nothing on the wire changed), `PASS_METADATA` (only a non-content field changed),
`PASS_SCHEDULING` (only send-time changed), or `CONTRACTUAL_ONLY` (the provider's word, not a
measurement — ships opt-in, never default). Source: the register at
`/Users/angus/dev/token-spread/docs/research/` (ids below, cohorts listed in `cohorts.json`).

**If a technique isn't here, it's because it changes what the model reads.** The
[Do NOT section](#do-not-do-these--they-change-the-output) below exists specifically because the
most commonly recommended "harmless" caching fixes — strip the timestamp, sort the keys, trim the
schema — do not clear this bar. They FAIL in the register, every one of them, and this skill will
not launder them back in.

## The canonical 4-breakpoint pattern

Anthropic caps you at 4 `cache_control` breakpoints per request. Spend them where content changes
at different frequencies, not evenly:

| slot | content | changes |
|---|---|---|
| 1 | system prompt | almost never |
| 2 | tool definitions | rarely |
| 3–4 | last 2 user turns | every turn |

This is id 167 (`PASS_METADATA`) — system + tools + last-2-user-turns. Breakpoints closer to the
front of the conversation survive longer; the live tail stays uncached because tagging it would
just buy a write premium you throw away next turn.

Don't hardcode "last 2 user turns" as a slice — on a tool-heavy turn that slice can blow past the
4-breakpoint cap and the API 400s. id 22 (`PASS_METADATA`) is the budget algorithm that fixes
this properly: `windowSize = min(3, max(0, 4 - alreadyUsed))`. System takes 1, the last tool
block takes 1, and the trailing message window shrinks to fit whatever's left — same messages,
same order, same content, only which blocks get the metadata tag changes.

## The 20-block lookback limit

Anthropic's cache lookup only scans back 20 content blocks from a breakpoint to find a matching
prefix. A tool-heavy turn — several `tool_use`/`tool_result` pairs in a row — can push the actual
prefix boundary more than 20 blocks past your last breakpoint, and the lookup silently gives up.
No error. `cache_creation_input_tokens` just stays high forever on a turn shape that should be
hitting.

id 165 (`PASS_METADATA`): on tool-dense turns, plant extra breakpoints roughly every dozen
content blocks instead of only at the 4 canonical slots — still metadata-only, still zero content
change, it just spends some of your 4 breakpoints mid-conversation instead of purely at
system/tools/last-2-turns.

id 75 (`PASS_METADATA`) adds the concurrent-request corollary: fire N requests that share an
uncached prefix at nearly the same instant and the first one hasn't finished writing the cache
before the others check it — all N miss. Fix is scheduling, not placement: send the first request,
wait for its first streamed token (confirms the write landed), then fire the rest. Byte-identical
requests, only send-order changes.

## Model-specific minimum cacheable prefix

A prefix has to clear a per-model token floor before it's eligible to cache at all — send less
and `cache_creation_input_tokens` stays 0 forever, no error, no warning. id 26 (`PASS_ABSOLUTE`,
verified against Anthropic's own skills repo) has the exact table, and it's non-monotonic across
generations:

| model | minimum prefix |
|---|---|
| newest models | 512 tokens |
| Sonnet-class | 1,024 tokens |
| older / mid-tier | 2,048 tokens |
| Opus 4.6 / 4.5, Haiku 4.5 | 4,096 tokens |

Haiku needing a *longer* floor than Sonnet/Opus is the trap — swap models expecting the same
caching behavior and Haiku alone goes cold. Pricing multipliers that ride alongside this table
(0.1x cache read, 1.25x five-minute write, 2x one-hour write) are confirmed primary-doc via id 68
(`PASS_METADATA`, clean — Anthropic's docs: caching "has no effect on output token generation,"
the response is identical to uncached). Treat the multiplier *numbers* from id 74 as `CONTRACTUAL_ONLY` — provider's word — opt-in, never
default: the mechanism-invisibility claim there rests on a quote that didn't survive a source
audit, even though the numbers themselves were re-confirmed live on the same audit pass.

## TTL: 5-minute vs 1-hour

`ttl` is a value inside the same `cache_control` field (id 61, `PASS_METADATA`) — it changes how
long the provider keeps the snapshot warm, nothing about what's in it. id 173 (`PASS_METADATA`)
gives the break-even math straight from Anthropic's pricing docs: the 5-minute write (1.25x) pays
for itself after 1 cache read; the 1-hour write (2x) needs 2 reads within the hour to come out
ahead. Pick 1h for long-latency agent loops (multi-minute tool chains, human-in-the-loop waits)
where the 5-minute window would expire before the next turn arrives; pick 5m for tight
request-response loops where you'll read it back inside a minute anyway.

**Trap, not a technique — verify, don't assume:** id 30 documents a reproduced case of Anthropic's
server billing/retaining a correctly-formed `ttl:"1h"` request as 5m anyway, silently. It's a
closed bug with no confirmed root cause, not a lever — the fix is checking that the granted TTL
matches the requested one (see Verify it worked below), not a workaround to ship.

## Cross-provider dialect traps

**Bedrock speaks `cachePoint`, not `cache_control`.** Same job, different field name and shape —
Bedrock's Converse API wants `{"cachePoint":{"type":"default"}}` inserted into the content array,
not an Anthropic-style `cache_control` block. id 27 (`PASS_METADATA`) is the translation fix for
this exact mismatch: send Anthropic-dialect `cache_control` through an SDK that only understands
Bedrock-dialect `cachePoint` and caching silently never engages — `cache_read_input_tokens` and
`cache_creation_input_tokens` sit at 0 forever, 100% of the discount lost, no error. id 98
(`PASS_METADATA`) confirms the mechanism and adds the invalidation shape: checkpoints chain
tools→system→messages, and editing an earlier section invalidates every checkpoint after it — not
supported at all on the batch inference API.

**Gemini: sending `cache_control` at all actively hurts you.** id 169 (`PASS_METADATA`, verified
against OpenHands' model-feature registry): "explicit `cache_control` markers freeze [Gemini's]
cache at the static prefix and disable Google's implicit caching on the growing body (~6-14x
cost)." Gemini's implicit caching is on by default and needs no marker; bolting on an
Anthropic-shaped breakpoint doesn't add anything, it turns off the automatic behavior underneath
it. The fix is a routing-layer guardrail: strip or reject any `cache_control` block before it
reaches a Gemini/Vertex-Gemini endpoint. Gemini's *explicit* caching (`createCachedContent` + a
cache-ID reference, id 94, `CONTRACTUAL_ONLY` — provider's word — opt-in, never default) is real
and works, but it's separately billed for idle storage for the TTL duration, so a rarely-hit
explicit cache can cost more than it saves.

**OpenAI and Azure need no marker at all.** id 43 (`PASS_ABSOLUTE`) and id 82 (`PASS_METADATA`):
prompt caching is fully automatic above a 1,024-token prefix, zero code change, byte-identical
match. `prompt_cache_key` (id 83, `CONTRACTUAL_ONLY` — provider's word — opt-in, never default)
is a hint for shard affinity, not a breakpoint — cap request bursts around 15/min per key or you
fragment across backend machines and miss cache anyway. Azure (id 105, `PASS_METADATA`) mirrors
this: automatic under 1,024 tokens, with GPT-5.6+ getting explicit `prompt_cache_breakpoint` /
`prompt_cache_key` controls analogous to Anthropic's. **Open, unresolved as of this register:**
whether GPT-5.6 on Bedrock keeps free automatic-cache writes or moves everyone to a 1.25x write
charge regardless of whether you set an explicit breakpoint (id 279, `INSUFFICIENT_EVIDENCE`) —
don't assume either way, check your own invoice line.

## Do NOT do these — they change the output

Every one of these is sold somewhere as a "harmless" caching fix. Every one of them fails the
register's own bar: the model reads different bytes, or a different mechanism decides what gets
produced.

| technique | id | verdict | one-line reason |
|---|---|---|---|
| Strip/reposition timestamps, session IDs, message IDs from the prefix | 31 | FAIL | Removes real content from what the model reads, even though it "feels" cosmetic |
| Manus's own timestamp rule (bundled with genuinely-neutral append-only + deterministic-serialization rules) | 172 | FAIL | Rule #1 is the same timestamp-stripping fix as id 31, quoted from their own blog |
| Sort JSON keys / tool lists to force a stable byte order | 21 | FAIL | Reorders prompt bytes relative to whatever order the code previously produced — reordering is always a FAIL, "the previous order was arbitrary" isn't an exemption |
| Trim tool/function schema description verbosity | 146 | FAIL | Content edit to the prompt by definition; both Anthropic's and OpenAI's own tool-use guidance argue for *more* detail, not less |
| Embedding-based semantic response caching (Kong, Apigee, TrueFoundry) | 222 | FAIL | On a "hit" the model reads nothing — a different customer's answer to a differently-worded question is returned at 0.85–0.95 similarity thresholds, never 1.0 by default |
| Context editing / `clear_tool_uses_20250919` sold as an 84% token cut | 225 | FAIL | Rewrites message history before the next call — real tool output on one path, a placeholder string on the other. Anthropic's own eval shows it *helps* task performance, but the bar is about wire content, not the sign of the outcome |
| Mid-conversation tool_addition/removal/defer_loading | 73 | FAIL | The `tools[]` array staying cache-stable is true and irrelevant — the new content block appended to `messages[]` changes which tools the model can call next turn |
| Logit-masking to keep the tool array static (Manus's own mitigation) | 170 | FAIL | Trades a full static tool list (more tokens than a filtered baseline) plus a decode-time constraint on what the model can sample — changes both bytes read and how the answer is produced |
| Deferring MCP tool-registry publish to the next turn boundary to protect the prefix | 233 | FAIL | Looks like `PASS_SCHEDULING` (only *when* changed) but isn't — during the deferral window the model gets handed an older/shorter `tools=` array than a live fetch would produce, a genuine content difference, not just a timing one |
| MCP `cache_tools_list=True` (openai-agents-python) | 174 | FAIL | Caches the MCP server's tool-schema response client-side and serves it verbatim into the next request; if the server's tools change and nobody calls `invalidate_tools_cache()`, the model silently reads a stale schema |

## Verify it worked

Every provider hands back the accounting for free — check these before trusting a breakpoint
placement, and after any provider/proxy upgrade:

- **Anthropic:** `usage.cache_creation_input_tokens` vs `usage.cache_read_input_tokens` per
  response (id 29, `PASS_ABSOLUTE` — this literally is the accounting object, not a technique).
  `cache_read_input_tokens == 0` proves a miss but not why — check separately: breakpoint count
  ≤ 4 per request, blocks-since-last-breakpoint < 20, prefix length ≥ the model's floor (id 26
  table above), and requested `ttl` matching the `ephemeral_5m`/`ephemeral_1h` split actually
  billed (catches the id 30 server-side TTL-override bug).
- **Bedrock (Converse API):** `cacheReadInputTokens` / `cacheWriteInputTokens` fields directly on
  the response (id 98). If both sit at 0 on `provider=bedrock` traffic through a JS/TS SDK, check
  for the `cache_control`-vs-`cachePoint` dialect mismatch (id 27) before anything else.
- **OpenAI / Azure:** `usage.prompt_tokens_details.cached_tokens` (id 43, id 105). A prefix over
  1,024 tokens with `cached_tokens: 0` on a repeat call is a missed-cache flag, content-blind.
- **Gemini:** `usage.total_cached_tokens` / `cachedContentTokenCount` (id 93/94). First check: no
  `cache_control` block is being sent to a Gemini endpoint at all (id 169) — that alone explains
  a 6–14x cost jump with no other symptom.
- **If you're behind a gateway/proxy** (LiteLLM and similar): don't assume `cache_control`
  survives the hop unmodified. As of this register, three separate LiteLLM cache-stripping bugs
  were open, unmerged, and reviewed by nobody — a shared message list silently losing its
  `cache_control` tags after a Groq call touches it (id 254), Bedrock guardrails rewriting to
  `guarded_text` and dropping the `cachePoint` block with it (id 253), and a 1h-TTL write-price
  miscalculation in the cost display (id 250) — all `INSUFFICIENT_EVIDENCE`, none confirmed fixed.
  Diff the request body actually sent against what your code constructed if hit rate drops after
  a proxy upgrade.

## Quick reference

| lever | id | verdict |
|---|---|---|
| 4-breakpoint pattern (system + tools + last-2-turns) | 167 | PASS_METADATA |
| Shrinking-window budget algorithm (avoids 400 on tool-heavy turns) | 22 | PASS_METADATA |
| Extra breakpoints every ~12 blocks on tool-dense turns | 165 | PASS_METADATA |
| Stagger concurrent requests behind the first cache write | 75 | PASS_METADATA |
| Per-model minimum cacheable prefix table | 26 | PASS_ABSOLUTE |
| Anthropic caching mechanism (no output effect) | 68 | PASS_METADATA |
| 1h `ttl` field, break-even math | 61 / 173 | PASS_METADATA |
| Bedrock `cache_control`→`cachePoint` translation fix | 27 | PASS_METADATA |
| Bedrock caching mechanism + invalidation chain | 98 | PASS_METADATA |
| Never send `cache_control` to Gemini | 169 | PASS_METADATA |
| Gemini explicit caching (`createCachedContent`) | 94 | CONTRACTUAL_ONLY |
| OpenAI automatic caching (≥1,024 tokens, no marker) | 43 | PASS_ABSOLUTE |
| OpenAI `prompt_cache_key` routing hint | 83 | CONTRACTUAL_ONLY |
| Azure OpenAI prompt caching | 105 | PASS_METADATA |
| Accounting object (`cache_creation`/`cache_read` tokens) | 29 | PASS_ABSOLUTE |

## Register ids cited

| id | name | verdict |
|----|------|---------|
| 22 | 4-breakpoint budget algorithm (system=1, last-tool=1, message window... | PASS_METADATA |
| 26 | Model-specific minimum-cacheable-prefix-length awareness (Haiku needs... | PASS_ABSOLUTE |
| 27 | Bedrock cache-dialect translation fix (Anthropic cache_control <-> Be... | PASS_METADATA |
| 29 | Anthropic API usage-object cache accounting (input_tokens / cache_cre... | PASS_ABSOLUTE |
| 30 | Server-side TTL override / 1h-TTL-requested-but-5m-TTL-billed (Claude... | FAIL |
| 31 | Dynamic system-prompt content as cache killer (timestamps, message ID... | FAIL |
| 43 | OpenAI Automatic Prompt Caching | PASS_ABSOLUTE |
| 61 | Anthropic extended 1-hour cache TTL | PASS_METADATA |
| 68 | Anthropic prompt caching (cache reads) | PASS_METADATA |
| 74 | Prompt cache minimum-token table + 5m/1h TTL pricing | CONTRACTUAL_ONLY |
| 75 | Cache breakpoint lookback window (20 blocks) + concurrent-request cac... | PASS_METADATA |
| 82 | OpenAI automatic prompt caching (cache reads) | PASS_METADATA |
| 83 | prompt_cache_key (OpenAI cache-warm routing hint) | CONTRACTUAL_ONLY |
| 93 | Gemini implicit context caching (Developer API & Vertex AI) | INSUFFICIENT_EVIDENCE |
| 94 | Gemini explicit context caching | CONTRACTUAL_ONLY |
| 98 | AWS Bedrock prompt caching | PASS_METADATA |
| 105 | Azure OpenAI prompt caching | PASS_METADATA |
| 165 | 20-block cache lookback limit and its interaction with tool-heavy turns | PASS_METADATA |
| 167 | Canonical 4-breakpoint pattern: system + tools + last-2-user-turns | PASS_METADATA |
| 169 | Cross-provider trap: explicit cache_control markers actively HURT Gemini | PASS_METADATA |
| 173 | 1-hour vs 5-minute cache TTL selection for long-latency agent loops | PASS_METADATA |
| 250 | LiteLLM Bedrock 1h-TTL cache-write mispricing correction | INSUFFICIENT_EVIDENCE |
| 253 | LiteLLM Bedrock guardrails silently drop cache_control when rewriting... | INSUFFICIENT_EVIDENCE |
| 254 | LiteLLM proxy mutated the caller's shared message/tool list, silently... | INSUFFICIENT_EVIDENCE |
| 279 | AWS Bedrock GPT-5.6 caching: writes go from free (auto-cache) to 1.25... | INSUFFICIENT_EVIDENCE |
