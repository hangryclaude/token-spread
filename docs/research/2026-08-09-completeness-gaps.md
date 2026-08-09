## Gaps in the cost-cutting catalog — prioritized, with next actions

Cross-checked against Anthropic's own current API docs (loaded via the `claude-api` skill, cached 2026-06-24, plus two live WebFetch pulls today). Findings below are things none of the seven researchers caught. Ranked most severe first.

---

### 1. The single biggest lever is buried, not documented
No item in the 90-line catalog says "use a smaller/cheaper model when task quality allows it." It's only addressed as a *dead end*, three screens down, under `[practitioner]` and `[research]`, framed around idemlayer's identity-preservation constraint — not as a decision the reader needs to see up front.

**Why this matters:** a skeptical CTO's first question on any "cut my API bill" doc is "why isn't model selection here?" If the answer is "out of scope because our product guarantees byte-identical behavior," that has to be a headline caveat, not a footnote.

**Next action:** Add a one-line banner at the top of the deliverable: *"Model downgrading/routing is excluded by design — it breaks the identity guarantee this catalog assumes. If your workload can tolerate a different model, that's the first lever to pull, not the 91st."*

---

### 2. Compaction (Anthropic's actual server-side feature) is missing entirely
The catalog has "Conversation compaction (summarize-and-reinitialize)" tagged `[prompt-level]` — that's the DIY version. It never mentions Anthropic's shipped feature: `context_management: {edits: [{type: "compact_20260112"}]}`, beta `compact-2026-01-12`, GA on Fable 5/Opus 5/Opus 4.8/4.7/4.6/Sonnet 5/Sonnet 4.6, auto-triggers near the context limit.

**New finding from primary source (verified via WebFetch today):** compaction is **not free** — it runs "an additional sampling step, which contributes to rate limits and billing." The doc's own example shows a `compaction` iteration billing 180,000 input + 3,500 output tokens *on top of* the regular turn. Anthropic explicitly declines to quantify net savings anywhere.

**Next action:** Add compaction as its own catalog entry, tagged `[anthropic-docs]`, with the caveat that the summarization pass itself is a billed request — model the break-even, don't assume it's free.

---

### 3. Mid-conversation tool changes (beta `mid-conversation-tool-changes-2026-07-01`) is missing
Claude Opus 5+ can now add/remove tools between turns via `tool_addition`/`tool_removal` blocks + `defer_loading: true` on the declared tool — without touching top-level `tools[]`, which is what normally invalidates the entire cache prefix (tools render first). This is a direct, documented answer to a problem the catalog *does* flag ("Avoiding silent cache invalidators") but doesn't know has a fix.

**Next action:** Add as `[anthropic-docs]`: "Mid-conversation tool changes — add/remove tools without invalidating the cache." Cross-reference it against the existing "silent invalidator" entry.

---

### 4. Thinking-on-by-default on Claude Opus 5 is a silent cost regression the catalog can't warn anyone about
On Opus 4.8/4.7, omitting `thinking` = no thinking. On **Claude Opus 5, omitting `thinking` now means adaptive thinking runs anyway** — a wire-identical request costs more after a model swap. `max_tokens` also becomes a *shared* cap on thinking + response text, so a Opus-4.8-tuned `max_tokens` can now silently truncate.

This is exactly the kind of finding a "cut the bill" catalog exists to catch, and it's nowhere — not even in the dead-ends.

**Next action:** Add as `[anthropic-docs]`, high priority: "Migrating to Opus 5 without setting `thinking` explicitly can *increase* spend and truncate output — audit every call site during migration."

---

### 5. New tokenizer on Opus 5 / Sonnet 5 / Fable 5 changes token counts (hence cost) for identical text — completely unmentioned
Per Anthropic's migration docs: Sonnet 5 uses ~30% more tokens than Sonnet 4.6 for the same text. Coming from Opus 4.6 or older, the new tokenizer used by Opus 5/Fable 5 produces 1×–1.35× as many tokens. Per-token price can be flat or even lower, but total cost isn't, because the token count itself moved.

**Next action:** Add: "Model migrations silently change token counts (not just price) — re-run `count_tokens` on representative prompts before assuming a swap is cost-neutral. Confirmed swings: ~30% (Sonnet 4.6→5), 1×–1.35× (pre-4.7 tokenizer→4.7+)."

---

### 6. Claude Sonnet 5 has live introductory pricing expiring in ~3 weeks — the single most time-sensitive lever available, and it's absent
Confirmed from the skill's model table: Sonnet 5 is $2/$10 per MTok (intro) vs. $3/$15 list, **through 2026-08-31**. Today is 2026-08-09. This is dated, primary-sourced, and actionable *right now* in a way nothing else in the catalog is.

**Next action:** Add as its own top-priority, time-boxed entry: "Claude Sonnet 5 intro pricing ($2/$10 vs $3/$15) expires 2026-08-31 — lock in volume or migrate before then." Set a reminder to pull it from any future version of this catalog after that date.

---

### 7. Prompt-cache minimum-token thresholds are gestured at, never quantified — and they're non-monotonic
Catalog has: "Verify cache blocks clear the per-model minimum-token threshold before shipping" `[practitioner]` — no numbers. Actual current thresholds:

| Model tier | Minimum |
|---|---|
| Opus 5, Fable 5, Mythos 5 | 512 tokens |
| Opus 4.8, Sonnet 5, Sonnet 4.6/4.5, Opus 4.1/4, Sonnet 4 | 1024 tokens |
| Opus 4.7, Mythos Preview, Haiku 3.5 | 2048 tokens |
| Opus 4.6, Opus 4.5, Haiku 4.5 | 4096 tokens |

The genuinely surprising part: **it's not monotonic across generations** — Opus 4.6's minimum (4096) is 8× Opus 5's (512). A 3K-token prompt caches on Opus 5 and silently doesn't on Haiku 4.5, with zero error, just `cache_creation_input_tokens: 0`.

**Next action:** Replace the vague practitioner bullet with this table, sourced `[anthropic-docs]`.

---

### 8. Cache race condition on concurrent requests — completely absent, concrete, actionable
A cache entry is only readable after the first response *begins streaming*. N parallel requests fired with an identical prefix (fan-out patterns, naive concurrency without Batch API) **all pay full cache-write price — none reads what the others are writing.** The fix (await the first token, then fire the rest) is simple and currently undocumented anywhere in this catalog.

**Next action:** Add `[anthropic-docs]`: "Concurrent identical-prefix requests don't share a cache write in flight — stagger by awaiting the first streamed token before firing parallel requests, or you pay N cache-writes instead of 1."

---

### 9. The 20-content-block cache lookback window is scoped only to images — it's a general agentic-loop gotcha
The dead-ends file has this correctly for vision requests ("a cache breakpoint only looks back 20 content blocks"), but that's the *narrow* manifestation. The same limit applies to any long agentic turn with many `tool_use`/`tool_result` pairs — a common failure mode that has nothing to do with vision. The catalog's "Multiple/placed cache breakpoints for long agentic loops" entry hints at needing multiple breakpoints but never explains why, so a reader can't diagnose it when it happens.

**Next action:** Generalize the dead-end note out of `[vision-images]` into a top-level `[anthropic-docs]` gotcha: place an intermediate breakpoint every ~15 blocks in long tool-use turns, or the previous cache silently misses.

---

### 10. Agent Skills / progressive disclosure is missing as a distinct token-reduction lever
Skills (`.claude/skills`, or Managed Agents `skills[]`) are Anthropic's mechanism for exactly the same "don't pay for instructions you don't need this turn" goal as Tool Search — a skill's short description sits in context by default, full content loads only when relevant. The catalog covers Tool Search extensively but never mentions Skills as the equivalent mechanism for *instructions* rather than *tool schemas*.

**Next action:** Add `[prompt-level]`/`[anthropic-docs]`: "Agent Skills — progressive-disclosure instruction loading, parallel to Tool Search but for prompt content instead of tool schemas."

---

### 11. Managed Agents multiagent delegation-to-cheaper-model pattern — Anthropic's own documented cost lever, entirely absent
`shared/managed-agents-multiagent.md` gives an explicit, named pattern: keep the coordinator on the expensive model, roster a cheap worker (Haiku 4.5 is the worked example) for reading-heavy delegated sub-tasks — "the large model spends its tokens on planning, checking, and synthesis; the small model does the bulk reading." This is a first-class, Anthropic-recommended architecture, and the catalog's Managed Agents coverage is limited to one line ("session runtime bills only while status=running").

**Next action:** Add `[anthropic-docs]`: "Managed Agents multiagent rosters — delegate reading-heavy sub-tasks to a cheaper worker model via `multiagent.agents`, keep the coordinator on the expensive model."

Same section, also missing: **session budgets** (`budget: {type: "limit", max_list_cost: {...}}`) and **deployment budgets** — hard dollar caps that pause a runaway session/scheduled agent. Not a reduction lever, but the risk-management counterpart the catalog never mentions.

---

### 12. Batch + cache stacking is asserted twice, quantified nowhere — including in Anthropic's own docs
Catalog has both "Batch API + prompt caching stacking with matched breakpoints" `[billing-surface]` and "Stacking Batch API + prompt caching" `[practitioner]`. Neither gives the combined multiplier. I checked the primary compaction/pricing docs and can't find one either — Anthropic documents that caching works *inside* Batch requests, but never states whether the 50% batch discount and the ~90% cache-read discount compose multiplicatively, or how a cache-write premium interacts with the batch discount.

**Next action:** This is a real gap in Anthropic's own documentation, not just the catalog's research. Flag it explicitly as `UNQUANTIFIED — Anthropic does not publish the combined rate` and recommend the reader run one real request and diff the invoice line items rather than assume a number.

---

### 13. Underlying dollar figures for two already-covered levers are missing, which guts their actionability
- Web search: **$10 per 1,000 requests.** Catalog says "prefer web_fetch over web_search when you already know the URL" but never states the fee this avoids.
- Code execution container: **$0.05/hour after 1,550 free hours/month per org**, containers persist 30 days. Catalog says "pair with web_search/web_fetch to make it free" and "reuse containers" but doesn't give the rate that makes either recommendation matter, or the free-tier size that determines whether you need to care at all.

**Next action:** Add the numbers inline to both existing entries so a reader can actually estimate the savings instead of taking "prefer X" on faith.

---

### 14. Workload types never addressed
- **Evals / benchmark runs at scale** — zero coverage. No mention of routing eval suites through Batch API, using `count_tokens` to right-size eval fixtures, or caching shared eval scaffolding/rubrics across thousands of graded runs. This is a real, common, expensive workload and it's not in the list of 90 items anywhere.
- **Fine-tuning-adjacent work** — I could not find a public Claude fine-tuning API anywhere in the full current API surface (Messages, Batches, Files, Managed Agents, Skills — no `/v1/fine_tunes` or equivalent exists). This is very likely a legitimate "not applicable" rather than a research gap, but the catalog should say that explicitly instead of silently omitting the category — a reader has no way to distinguish "checked, doesn't exist" from "nobody looked."
- **Voice** — same treatment needed. Claude has no native voice/realtime endpoint; if that's confirmed, say so as a checked exclusion, not a silent gap.

**Next action:** Add an "Evals/benchmark workloads" entry (Batch API + shared cached rubric/system prompt is the obvious lever — someone needs to write it up properly). Add one line each for fine-tuning and voice: "checked, not applicable — Claude has no public fine-tuning or voice/realtime API as of [date]."

---

### 15. No interaction/compatibility matrix — a structural gap in the deliverable itself
90+ items are listed flat, with zero guidance on:
- Which techniques stack (Batch + caching — see #12) vs. which are mutually exclusive (Fast Mode is explicitly incompatible with Batch API and Priority Tier — that's in the catalog's own dead-ends, but nothing ties it back to the main list as a *compatibility* fact).
- Which trade latency for cost (Batch API: up to 24h turnaround; compaction: extra round-trip; context editing: none) — no reader can currently tell "will this technique make my p99 worse" from the catalog alone.
- Sequencing — if you're going to do three things, which first for best ROI? Nothing answers this.

**Next action:** This is the highest-leverage fix available and doesn't require new research — it requires synthesizing the 90 existing items into a short compatibility/sequencing table before shipping this to anyone who has to act on it. A flat list of caveated bullet points is a research artifact, not a decision tool.

---

### Sceptical-CTO questions this catalog still cannot answer
1. "Model swap looks free at the sticker price — will my bill actually go up or down?" → No, because of #4 and #5 above (thinking-on-by-default, tokenizer shift) — neither is in the catalog to warn them.
2. "If I do Batch + caching + Sonnet-5-intro-pricing together, what's my actual multiplier?" → Unanswerable; #6 isn't in the catalog and #12 is undocumented even by Anthropic.
3. "Which three of these 90 items should I implement first?" → No ranking, no ROI framing, no sequencing (#15).
4. "Why isn't 'just use a cheaper model' here?" → Answer exists but is buried (#1).
5. "Does compaction actually save money net of its own cost?" → No — Anthropic won't quantify it and the catalog doesn't even list the feature (#2).