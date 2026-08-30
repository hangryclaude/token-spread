---
name: spend-anomaly-triage
description: Use when a token/LLM spend graph has a shape you don't like and you need to know within the hour, when deciding what budget alerts or hard spend caps to turn on for an org or workspace, when investigating a spike like the $1,771-in-4-hours entry against a $25 limit, when suspecting an SDK's auto-retry-on-timeout is double-billing a slow call, when auditing dev/CI traffic or a forgotten nightly eval still running on a paid key, when a cron or scheduled agent's context looks bloated with unused tools and memory, when a Claude Code session's cache read rate collapses after an idle gap and billing might have crossed from subscription into usage-credit, when setting Claude Code `--max-budget-usd` or a subagent recursion/concurrency cap, when triaging a Cursor-style unattended-agent-loop cost incident, or when wiring this repo's own `detectSpendAnomaly`/`detectTtlCrossing` functions into an alert instead of building new ones.
---

# Spend Anomaly Triage

## Overview

Catching a runaway is a detection problem, not a pricing problem. Every lever here reads billing metadata — day totals, session boundaries, cache-write buckets, spawn events — and never touches a live request: it decides whether to raise an alarm or pull a cap, not what the model reads or answers. That is why it is identity-safe by construction and belongs nowhere near prompt trimming, context editing, or model routing — those change tokens the model reads, this only changes whether a human finds out before the invoice does.

This skill is the fast-triage layer: what to check first, what the repo's own detectors already compute, and which "obvious" fixes secretly change output and don't belong here. For reconciling a dashboard number against what the provider actually billed, use `llm-bill-audit` instead — that is forensic accounting after the fact, this is catching the spike while it's still happening.

## When to use

- A spend graph has an unexplained spike and you need to know today, not at month-end.
- Deciding what org/workspace caps, Claude Code flags, or subagent limits to set before anything runs.
- A cron job, nightly eval, or dev/CI key looks like it's still billing after nobody reads its output.
- A Claude Code session's `cache_read_input_tokens` collapsed after an idle gap.
- Wiring `src/detect/spendAnomaly.ts` or `src/detect/ttlCrossing.ts` into an alert path.

## The repo's own detectors — id 126, id 127, id 184

`detectSpendAnomaly` (`src/detect/spendAnomaly.ts`) reads `Metrics.byDay` — never re-prices events itself, since `computeMetrics` already ran the rate card once — and flags a UTC day when it bills more than 3x the trailing 7-day median **and** clears an absolute $10.00 floor; ratios alone cry wolf on tiny bills, and a silent-then-$0-median-then-spike history still counts as the classic runaway shape. It needs 8 days of history to be `computable` and returns `PASS_ABSOLUTE`: this is the same content-blind mechanism the register credits for turning a runaway into a same-day incident instead of an invoice (id 126, id 127). It is deliberately detect-only — money already spent is not a saving, so it never prices one, and it is retrospective, not an alerting system on its own.

`detectTtlCrossing` (`src/detect/ttlCrossing.ts`) watches for the wire signature of Claude Code's documented 1h→5m cache-TTL flip on crossing from subscription into usage-credit billing (id 184, PASS_METADATA): a session whose writes start on the 1-hour TTL and later continue on 5-minute writes alone. It fires per-session only, never on mixed 1h/5m tokens inside one event, and never on 5m writes that precede the 1h regime — order matters. `ENABLE_PROMPT_CACHING_1H=1` is the fix; the detector only warns, since a deliberate mid-session TTL change looks identical on the wire.

## Caps come before dashboards — id 126, id 297, id 293, id 299

Anthropic's own Start/Build/Scale tiers cap org/workspace spend at $500/$1,000/$200,000 a month; hitting the cap pauses usage until next month, an all-or-nothing gate with no delivered-but-different branch (id 126, PASS_ABSOLUTE). Inside Claude Code, `--max-budget-usd` is the client-side version: spend from subagents counts toward it, a blocked spawn fails with "Budget limit reached" (no request ever sent), and still-running background subagents are stopped (id 297, CONTRACTUAL_ONLY — provider's word, opt-in, never default; no independent trace confirms a stopped subagent's in-flight call is aborted server-side rather than just discarded client-side). Recursion itself used to have no ceiling at all — one reported case hit 1.2M+ tokens in ~30 minutes on a task that should have been a `git clone` (id 293, FAIL as filed, but Claude Code v2.1.217+ ships a default concurrent-subagent cap of 20, overridable via `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). Nesting depth defaulted to 1 at v2.1.217 and was raised to 3 at v2.1.219 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`); at the boundary the Agent tool is withheld entirely from non-fork subagents, so no request for a deeper layer is ever generated (id 299, CONTRACTUAL_ONLY — provider's word, opt-in, never default, and the default loosened over time, not tightened). Set these before wiring an anomaly alert — a cap that refuses to spend is cheaper than the fastest possible detection of spend that already happened.

## Where the money actually leaks: retries and forgotten schedules, not model choice

The single largest pure-waste vector by the register's own naming: an SDK's default retry-on-timeout resends a byte-identical prompt+params when the client socket times out while the original generation is still running server-side, and the fix (hold the in-flight promise, replay it instead of paying for a second forward pass) only holds if the original didn't genuinely error — Anthropic's own errors doc scopes auto-retry to connection errors, rate limits, and 5xx, not just slow-but-healthy calls (id 150, INSUFFICIENT_EVIDENCE — real waste, unsettled remediation). Its trap bears repeating below. A confirmed sibling: max_tokens mismatched to real output length produces a truncate-then-retry cascade that billed $4.31 against an expected $1.50, ~2.9x, with a near-1:1 input:output token ratio as the fingerprint (id 155, FAIL as a technique since fixing it changes the request shape — but the waste pattern itself is real and worth flagging). Codex independently reproduces the same shape by misclassifying `response.incomplete` — a billed, fully-computed, truncated turn — as a retryable stream error and resending an already-answered request (id 334, FAIL, source-verified, issue open and unaddressed).

Forgotten schedules are the other half. A key showing a perfectly periodic cadence with flat token counts and no downstream consumer is a forgotten nightly eval or cron job still billing on autopilot (id 124, FAIL as a "technique" — killing it is zero-thinking work, but it is invisible in a total-spend dashboard until someone audits keys against active projects). Cron agents that reload their full tool schema and memory on every scheduled run showed an 88-93% token reduction once trimmed to what that run actually needs, ~$40-80/day on one 19-job fleet (id 157, FAIL as a spend-anomaly fix specifically because trimming shrinks the actual request the model reads — flag it as waste, don't file it next to the content-blind levers above). Kubernetes' own `concurrencyPolicy: Forbid` skips a new Job outright when the previous one is still running — no Job, no Pod, no request sent (id 187, PASS_ABSOLUTE, conditional on the job being genuinely idempotent, which Kubernetes explicitly declines to guarantee). Its sibling `Replace` kills the running Pod and starts fresh, but Kubernetes' guarantee stops at the Pod — a request already dispatched keeps running server-side, so a long-enough overlap bills the discarded generation and its replacement both (id 188, FAIL, the more expensive of the two despite sounding decisive).

## Case studies: the shape of a runaway, without a settled root cause — id 160, id 296

A reported $1,771 in 4 hours against a $25 monthly limit is real money and a real GitHub issue, but the source itself declines to name a root cause — retry-loop bug, key compromise, or something else — and the issue was closed as a duplicate with no published resolution (id 160, INSUFFICIENT_EVIDENCE, N=1). A viral $1,382.59-across-1.3-billion-tokens Cursor unattended-agent-loop story rests on a single X post that 402'd on independent re-fetch, with no second primary source located; Cursor's own changelog confirms soft/hard account limits with threshold alerts exist, but says nothing about this specific incident (id 296, INSUFFICIENT_EVIDENCE). Cite both as the shape a runaway takes — sustained high-frequency calls against a low configured limit — never as a settled mechanism to build a specific fix against.

## Sweep-17 FinOps: metering and idle shutdown are visibility, not a fix — id 339, id 345

Hugging Face Inference Endpoints scale to 0 replicas after 15 minutes idle and stop billing instance-hours entirely until the next request's cold start brings a replica back up — a pure capacity toggle that never changes the deployed weights or a served request's tokens (id 339, PASS_ABSOLUTE, opt-in per endpoint). OpenCost 1.121.0's llm-d integration scrapes vLLM's existing Prometheus counters plus OpenCost's GPU allocation engine to publish a derived $/M-token figure for self-hosted inference, strictly read-only and additive to the request path — but by the source's own framing, "the metering itself saves nothing on its own": someone still has to act on the exposed number to rightsize, consolidate, or decommission (id 345, PASS_ABSOLUTE).

## Traps

### Raising max_retries makes SDK double-billing worse, not better — id 150 (INSUFFICIENT_EVIDENCE)

The retry causes the duplicate spend; "more resilient" retry settings just fire the duplicate-billing trigger more often, not less. Detect it content-blind: two calls from the same key within a short window sharing an identical prompt+params hash and matching token counts, where the first connection closed before a response was delivered.

### An open GitHub issue is not proof a defect is still live — id 293 (FAIL, as filed)

The unbounded-recursion issue that produced the 1.2M-token/30-minute incident is still open on GitHub, but the fix shipped in the changelog five days later; Anthropic never closed the tracker issue. Check the version-gated defaults (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`) against the installed version, not the issue's open/closed state.

### A docs sentence describing a cap is not proof the cap holds under load — id 297, id 299 (both CONTRACTUAL_ONLY)

Both `--max-budget-usd` and the subagent recursion-depth cap are verified against Anthropic's own documentation only — no independent network trace confirms a blocked spawn never leaves the process, or that a "stopped" background subagent's in-flight request is aborted server-side rather than just discarded client-side after it completes anyway. Treat the mechanism as provider's word until you've watched a "Budget limit reached" event fire in your own logs.

## Verify it worked

| Signal | Means |
|---|---|
| A UTC day bills > 3x the trailing 7-day median and clears the $10 floor | `detectSpendAnomaly` fired — id 126, id 127 |
| A session's cache writes start on 1h and continue on 5m-only after | `detectTtlCrossing` fired — id 184 |
| Same key, identical prompt+params hash, two calls in one window, first connection closed pre-response | SDK auto-retry double billing, not two intentional calls — id 150 |
| A key shows fixed-interval calls with flat token counts and no downstream reader | Forgotten cron/eval, not live traffic — id 124 |
| A spawn attempt logs "Budget limit reached" / a background subagent stops mid-run | `--max-budget-usd` actually enforced, not just documented — id 297 |
| A CronJob shows a Job-deletion event immediately followed by a new Job at the same tick, with billed usage against no completed Job | `Replace` killed and re-billed a paid generation — id 188 |

## Do NOT do these — they change the output

### Stripping tool schemas and memory from every cron run — id 157 (FAIL)

The 88-93% token reduction genuinely happened because the model reads a materially smaller request every run afterward — real engineering value, but it is not a content-blind spend-anomaly fix, and filing it as one blurs "we found waste" with "we changed what the model sees."

### Widening max_tokens or shifting chunk boundaries to stop a truncate-retry cascade — id 155 (FAIL)

The remediation for the $4.31-vs-$1.50 cascade changes what the model is permitted to generate per call, replacing many truncated partial completions with fewer, larger, complete ones. Good advice for a config-audit surface; not a lever that leaves the request shape untouched.

## Register ids cited

| id | name | verdict |
|----|------|---------|
| 124 | Waste pattern: forgotten nightly evals/cron jobs on paid API keys | FAIL |
| 126 | Native budget alerts and hard spend caps (Anthropic org/workspace) | PASS_ABSOLUTE |
| 127 | Anomaly detection on token/LLM spend | PASS_ABSOLUTE |
| 150 | SDK auto-retry-on-timeout double billing | INSUFFICIENT_EVIDENCE |
| 155 | Truncation-then-retry cascades | FAIL |
| 157 | Zombie context in scheduled/cron agents | FAIL |
| 160 | Runaway/anomalous spend spike ($1,771 in 4 hours against a $25 limit) | INSUFFICIENT_EVIDENCE |
| 184 | Claude Code cache TTL flips 1h→5m on billing crossing | PASS_METADATA |
| 187 | K8s CronJob concurrencyPolicy: Forbid | PASS_ABSOLUTE |
| 188 | K8s CronJob concurrencyPolicy: Replace | FAIL |
| 293 | Claude Code unbounded subagent recursion (pre-v2.1.217) | FAIL |
| 296 | Cursor unattended-agent-loop spend-cap incident | INSUFFICIENT_EVIDENCE |
| 297 | Claude Code --max-budget-usd hard-halts subagent spend | CONTRACTUAL_ONLY |
| 299 | Claude Code CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH bounds recursive fan-out | CONTRACTUAL_ONLY |
| 334 | Codex maps response.incomplete to a retryable stream error | FAIL |
| 339 | Hugging Face Inference Endpoints automatic scale-to-zero | PASS_ABSOLUTE |
| 345 | OpenCost 1.121.0 llm-d inference cost metering | PASS_ABSOLUTE |
