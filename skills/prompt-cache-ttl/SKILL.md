---
name: prompt-cache-ttl
description: Use when picking or auditing an Anthropic prompt-cache TTL (5m vs 1h) for a long-running Claude agent loop, when cache_read_input_tokens or the cache hit rate looks lower than expected, when a proxy or gateway might be silently downgrading a requested 1h TTL to 5m, when a Claude Code session's caching cost or billing changes after subscription quota runs out mid-session, or when deciding whether ENABLE_PROMPT_CACHING_1H=1 is worth setting.
---

# Prompt Cache TTL Right-Sizing

## Overview

`cache_control.ttl` is metadata Anthropic's serving layer reads to decide how long to keep a KV-cache entry warm. It is never rendered into the model's context — same prompt, same model, same amount of thinking, different bill. Picking 5m vs 1h wrong either pays a write premium for retention you never use, or forces avoidable full-price rewrites every time an idle gap outlasts a too-short TTL.

Every lever below is content-blind: it changes a price multiplier, not a token the model reads. Nothing here belongs anywhere near prompt trimming, semantic caching, or routing — see the section at the bottom for why those are a different category entirely.

## When to use

- Setting `cache_control.ttl` on Anthropic API calls for an agent loop and choosing between `"5m"` and `"1h"`.
- `cache_read_input_tokens` or hit rate is lower than expected and you don't yet know whether it's TTL expiry, a proxy, or a provider anomaly.
- Running Claude Code and per-session cost jumped after subscription quota ran out mid-session.
- Building or auditing a proxy/gateway that touches `cache_control` blocks.
- Budgeting Claude Code subagent forks as "free" because they're supposed to inherit the parent's cache.

## The economics — id 61, id 173 (PASS_METADATA)

| TTL | write multiplier | read multiplier | pays off after |
|-----|-------------------|------------------|-----------------|
| 5m  | 1.25x base input  | 0.1x base input  | 1 cache read within the window |
| 1h  | 2x base input     | 0.1x base input  | 2 cache reads within the window |

("caching pays off after one cache read for the 5-minute duration ... or after two cache reads for the 1-hour duration" — Anthropic's own pricing doc, id 173.)

Right-sizing rule: if your loop's idle gaps between requests are consistently under 5 minutes, the 5-minute default already covers you — the 2x premium for 1h buys retention nobody uses. If gaps regularly exceed 5 minutes (human-review pauses, blocking tool calls, batch steps) but you still land at least 2 reads before an hour is up, 1h avoids paying 1.25x over and over as the 5m window keeps lapsing.

## Traps

### TTL-promotion-before-reordering — id 23 (PASS_METADATA)

A proxy that reorders or canonicalizes message blocks *before* assigning TTL metadata can silently downgrade an intended 1h request to 5m — the promotion has to happen before normalization runs, not after. Detect it by comparing the `cache_control.ttl` you sent against the realized `ephemeral_1h_input_tokens` vs `ephemeral_5m_input_tokens` split; a mismatch is the fingerprint, no prompt content needed. (Sourced from a specific CLIProxyAPI issue, still open as of 2026-08-18 — check your own proxy's operation order rather than assuming it's someone else's bug.)

### Server-side TTL override — id 30 (FAIL — a trap to detect, not a technique to adopt)

At least one reproduced case: a correctly-formed 1h-TTL request got billed and retained as 5m anyway, server-side, with no client-side fix available. Don't treat "I set ttl:1h" as proof it took effect — verify the usage-object split on every call that matters.

### Claude Code billing-crossing flip — id 184 (PASS_METADATA)

Claude Code's cache lifetime is 1 hour on subscription billing, drops to 5 minutes the instant a session crosses into usage-credit billing (subscription quota exhausted mid-session), and defaults to 5 minutes on API-key/cloud-provider auth regardless. Fix: `ENABLE_PROMPT_CACHING_1H=1` holds the 1-hour lifetime across that crossing. Detect it as a cache-read collapse after idle gaps of 5–60 minutes in a session that's drawing on usage credits.

### Phantom cache writes past the declared breakpoint — id 255 (CONTRACTUAL_ONLY — provider's word, opt-in, never default)

Historical: `cache_creation_input_tokens > 0` on warm calls that should show 0 given a single declared breakpoint. Anthropic says this was server-side and fixed as of 2026-08-05. Listed so you don't chase this signature in old telemetry or blog posts as if it's still live — the fix is Anthropic's account, not independently re-measured here.

### Fork subagents inherit prompt cache — id 202 (CONTRACTUAL_ONLY — provider's word, opt-in, never default)

Claude Code changelog (v2.1.232): `subagent_type: "fork"` is on by default and "inherits the full conversation and prompt cache" — the fork's first call is claimed to land at cache-read pricing on the parent's already-cached context instead of a fresh ingestion. That's a changelog sentence, not a measured before/after request diff. Trap: if the fork boundary injects any framing tokens the changelog doesn't mention, "inherited cache" instead becomes the single most expensive path — a full cache-write-priced re-ingestion of the whole conversation, with no visible warning the assumption broke. Verify per-fork via `cache_read_input_tokens` vs `cache_creation_input_tokens` on that first forked call before budgeting forks as near-free.

## Verify it worked — id 29 (PASS_ABSOLUTE)

Every Anthropic response already returns this, no extra call needed:

- `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
- the `ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` split inside `cache_creation`

```
hit_rate = cache_read / (cache_read + cache_creation + input)
```

Read the pattern:

| Signal | Means |
|---|---|
| Requested `ttl:"1h"`, tokens land in `ephemeral_5m` | Server override (id 30) or a proxy silently downgrading it (id 23) |
| `cache_read_input_tokens == 0` on a call that should be warm | A miss — but the usage object alone doesn't say why (TTL expiry vs dynamic content vs breakpoint overflow, id 29's own caveat) |
| Paying the 1h premium, but reads-per-write average < 2 | Retention you're not using — drop to 5m |
| Claude Code, usage-credit billing, cache-read collapse after a 5–60 min gap | Billing-crossing flip (id 184) — check `ENABLE_PROMPT_CACHING_1H` |
| Forked subagent's first call shows `cache_creation` instead of `cache_read` | The id 202 inheritance claim didn't hold for this fork — budget it as a full write, not free |

## Do NOT do these — they change the output

### Synthetic `max_tokens=1` keep-alive pings to outrun the 5-minute TTL — id 229 (FAIL)

Firing a background `max_tokens=1` completion every ~295s to keep the cache warm is a genuine additional real inference call — a full forward pass plus at least one generated token that would not exist otherwise. That's more model work happening, not a metadata change, no matter how cheaply the ping itself is priced. It doesn't belong in a token-spend lever that's supposed to leave output alone.

## Register ids cited

| id | name | verdict |
|----|------|---------|
| 23 | TTL-promotion-before-reordering pipeline fix | PASS_METADATA |
| 29 | Anthropic API usage-object cache accounting | PASS_ABSOLUTE |
| 30 | Server-side TTL override / 1h-requested-but-5m-billed | FAIL (trap, not a technique) |
| 61 | Anthropic extended 1-hour cache TTL | PASS_METADATA |
| 173 | 1-hour vs 5-minute cache TTL selection for long-latency agent loops | PASS_METADATA |
| 184 | Claude Code cache TTL flips 1h→5m on billing crossing | PASS_METADATA |
| 202 | Claude Code fork subagents inherit prompt cache | CONTRACTUAL_ONLY |
| 229 | Synthetic max_tokens=1 keep-alive pings | FAIL |
| 255 | Phantom cache writes past declared breakpoint (fixed) | CONTRACTUAL_ONLY |
