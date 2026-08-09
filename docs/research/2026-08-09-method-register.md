# idemlayer Method Register

**Scope of the tiers.** Tier A = identityRisk `none`: the request that reaches the model and the forward pass that generates output are unaffected; only compute-reuse or pricing/routing metadata differs. Tier B = identityRisk `byte-identical-only`: a full historical response is replayed instead of a new one generated — safe only because the request is an exact repeat. Tier C = identityRisk `quality-risk` or `distribution-shift`: the model sees different input, generates different output, or a different model answers. Ships off by default; needs a measured delta.

**Caveat that sits above all three tiers.** Anthropic's own hosted infra is not proven bit-reproducible even at `temperature=0` on an exact-repeat request — Thinking Machines Lab measured 80 distinct completions out of 1,000 identical-prompt, temp-0 calls, caused by non-batch-invariant GPU kernel reduction order, not by anything the customer does. No technique in this catalogue fixes that. State Tier A/B guarantees as "does not itself introduce a change beyond what the provider's own infra already introduces," not as an absolute promise.

**Two different things both called "caching."** Anthropic prompt caching (Tier A) reuses computed transformer state for a matched prefix — the model still runs a fresh forward pass and fresh sampling on the new/uncached tail, so output is unaffected by definition (docs: *"has no effect on output token generation"*). Exact-match response caching / request dedup (Tier B, idemlayer's own core mechanism) replays a stored complete response — safe only for true duplicates, and at temperature > 0 it collapses what would have been independent fresh samples into one frozen sample. Don't let a customer conflate the two.

**No server-side dedup exists to lean on.** Confirmed absent from errors/streaming/service-tiers docs: no `Idempotency-Key` header, no request-dedup concept. SDK auto-retry re-POSTs the identical body as a new, independently billed call. This is the entire reason a client-side Tier B layer has a job to do.

---

## TIER A — ship by default (identityRisk: none)

### Core delivery-path levers

| Method | What it is | Savings | Effort | Trap |
|---|---|---|---|---|
| **Prompt caching** (`cache_control`, 5m/1h breakpoints) | Reuse computed prefix state across requests | Cache read = 0.1x base input price (90% off); write = 1.25x (5m) / 2x (1h). Breakeven: 2 total requests (5m), 3 total (1h) | Low — add `cache_control`, reorder prompt static-first/volatile-last | **Silent no-op below the per-model minimum** (512–4096 tok depending on model): 200 OK, `cache_creation_input_tokens=0`, no error, no warning. Measured real case: a pipeline ran for months at 0% hit rate because cacheable blocks sat ~3,000 tokens under Haiku 4.5's floor. Verify with the Token Counting API before shipping. |
| — cache-stable architecture (static-first, volatile-last) | Put everything byte-identical across requests before the breakpoint, variable content after | Enables the above; not itself a separate discount | Low-Medium — audit prompt-construction code | A timestamp, UUID, or per-user string placed *before* the breakpoint changes the hash → every request is a fresh (expensive) write, forever. Non-deterministic dict/JSON serialization (Swift, Go randomize map order) does this silently even when the logical content hasn't changed. |
| — deterministic tool-definition serialization | `sort_keys`-style stable JSON for tool schemas | Same 90% read discount, contingent on this | Low | Tools render first in the cache hierarchy; reordering/adding/removing one tool invalidates tools→system→messages cascade. |
| — multiple/placed breakpoints in long agentic loops | Breakpoint roughly every 15 content blocks | Prevents full-prefix miss on long tool-heavy turns | Low | Lookback is capped at 20 blocks. A turn adding >20 blocks (many tool_use/tool_result pairs) pushes the next breakpoint out of range of the prior write → total miss even with `cache_control` set correctly. |
| — cache pre-warming (`max_tokens:0`) | Throwaway request pays the write premium before real traffic | Moves 1.25x/2x cost off the user-facing request | Low | Only useful if you can predict the prefix before first real traffic; adds one billed call. |
| **Cache-aware ITPM rate limits** | `cache_read_input_tokens` excluded from ITPM accounting (all models except Haiku 3.5) | Anthropic's example: 2M ITPM limit + 80% hit rate ≈ 10M effective tokens/min, no tier upgrade needed | None — automatic | Doesn't reduce dollars directly; reduces need to pay for a rate-limit tier upgrade. Easy to under-claim in a pitch — keep it framed as throughput headroom, not $ savings. |
| **Message Batches API** | Async processing, same model/messages/sampling | Flat 50% off input + output, every model. Real invoice: $800→$400, 50K-SKU job (practitioner) | Medium — needs async submit/poll infra; only fits workloads tolerant of ≤24h delay | Not available on Bedrock or Vertex at all (feature gap, not a config option). |
| — prompt caching *inside* batch requests | `cache_control` honored in batch bodies | Cache-hit token in a batch ≈ 0.1×0.5 = 5% of sync price (95% off) | Low once both exist | Hits are **best-effort**, not guaranteed — batch is concurrent/async so cache entries can expire between concurrently-scheduled requests. Reported observed range 30–98%. Use **1-hour TTL, not 5-minute**, for batch specifically (5-min almost certainly expires inside a 24h processing window). |
| — extended output on batch (`output-300k-2026-03-24` beta) | `max_tokens` up to 300,000 on batch | No premium over standard batch rate; avoids re-billing the full context prefix on every continuation call in a chain | Low — header + param | Opus 5/4.8/4.7/4.6, Sonnet 5/4.6 only; API/AWS Platform only. |
| — batch's built-in non-billing of errored/canceled/expired | Only `succeeded` results are billed | 100% of what would've been billed on dead batch entries | None — automatic | Still worth pre-validating requests; this only protects against billing, not wasted turnaround time. |
| **Avoid `inference_geo:"us"` / regional endpoint pinning** | Default `"global"` routing is standard price | 10% flat on every token category (input/output/cache-read/cache-write) for any workload without a real residency requirement | Trivial — don't set the param / don't pin a regional Bedrock-Vertex endpoint | Compliance-driven pinning is a real requirement for some customers — don't strip it blind; confirm no data-residency obligation first. |
| **Pair code execution with `web_search`/`web_fetch`** | Same request also uses current web tool version | 100% of container-hour charges waived — documented, unconditional | Low | Must be the *current* tool version (`web_search_20260209+`/`web_fetch_20260209+`); exemption doesn't apply to stale tool versions. |
| **Reuse code-execution containers** (`container_id`) | Pass prior container_id instead of spinning up fresh | Collapses N×5-minute billing floors into fewer windows for multi-call sessions | Low-Medium — thread container_id through session state | Files preloaded onto a container bill even if code-exec is never invoked that turn — don't attach files "just in case." |
| **Token Counting API** (`/v1/messages/count_tokens`) | Free, separate rate-limit pool, pre-flight measurement | Indirect — catches caching-minimum cliffs and oversized prompts before they silently waste money | Low | Doesn't interact with caching itself; only tells you the number. |
| **Managed Agents: bill only `status=running`** | Idle/rescheduling/terminated time not metered | Avoids paying the (often large) idle fraction of interactive session wall-clock | None — automatic | Only applies to Managed Agents' $0.08/session-hour runtime charge, not to code-exec container billing (separate meter). |
| **`stop_sequences`** to truncate output exactly | Stop generation the instant needed content is complete | Output billing is strictly `usage.output_tokens` generated — trailing prose up to `max_tokens` is real, avoidable spend | Low | Most valuable on format-constrained generation (single JSON object, fixed extraction); low value on open-ended prose. |
| Don't attach unused files to code-exec requests | Files preload onto the container regardless of use | Avoids container-hour billing on requests the tool never actually fires on | Low | See container-reuse row — same underlying mechanic. |
| Prefer streaming (or Batch) over non-streaming for large `max_tokens` | Avoids idle-connection-drop → blind client retry → double-billed full regeneration | Avoids ~2x cost on the retry-storm failure mode Anthropic itself warns about | Low-Medium — client refactor | Undocumented whether server-completed-but-undelivered generation is billed; *treat it as billed* until Anthropic states otherwise — this is the whole reason to avoid triggering it. |
| Negotiate committed spend / AWS Marketplace private offer | Case-by-case enterprise discount, no published schedule | Unquantified, real for high predictable volume | High — sales cycle | Not retroactive to usage before acceptance; time the negotiation. |
| Prefer 1P API / Claude Platform on AWS over Bedrock/Vertex when Batch or caching matter | Bedrock/Vertex both fully lack the Batch API | Enables the two biggest levers above at all | Medium-High — platform choice/migration | Not "Bedrock is worse pricing" — current-gen per-token price matches 1P; the gap is *feature availability* (no Batch, no automatic top-level `cache_control`), not the sticker price. |
| Structured-outputs schema stability (grammar cache) | Compiled JSON-schema grammar cached server-side 24h | Reuse cost/latency win when `output_config.format` stays unchanged | Low — keep schema stable across calls | Turning structured outputs on **at all** is a net token *increase* (injected format instructions) — this row only recovers cost on top of that baseline tax, doesn't erase it. Changing the schema invalidates both this cache and any prompt cache on the thread. |

---

## TIER B — byte-identical only (identityRisk: byte-identical-only)

| Method | What it is | Savings | Effort | Trap |
|---|---|---|---|---|
| **Exact-match response cache / in-flight request dedup / single-flight coalescing** — the idemlayer core mechanism | Hash (model + full canonicalized request body); on an exact repeat, replay the stored response instead of calling the model again. Single-flight variant fans one live call out to N concurrent identical requests | 100% of cost per hit/coalesced duplicate; aggregate saving = f(duplicate-request rate), which no source quantifies generically | Medium — build/deploy the proxy, define canonicalization (param order, whitespace) + TTL policy | **Not strictly "none," and must never be sold as such**: at temperature > 0, a genuine repeat call would draw an independent fresh sample; the cache instead returns the *same frozen historical sample* every time. Real behavior change even though model + input tokens never differ. Say this to customers explicitly. |
| — implementation options: Portkey `mode:"simple"`, Helicone `Helicone-Cache-Enabled`, Bifrost direct-mode, Cloudflare AI Gateway edge cache | Off-the-shelf exact-match caches, all opt-in, all confirmed exact-hash not embedding-based | Vendor-unquantified across the board | Low (adopt) if already on that gateway | Helicone-hosted/Cloudflare routes prompt content through third-party infra by design (not a bug, but a disclosure item). Cloudflare/OpenRouter/Requesty gateway code itself is closed-source — no supply-chain review is possible on the router, only on client SDKs. |
| **Resume-from-partial instead of full retry** after a dropped stream | Capture partial content already received, send a continuation request rather than re-sending the whole prompt | Avoids re-generating + re-billing every already-produced token | Medium — client-side partial-state tracking | Documented as plausible engineering practice; the specific "official recovery pattern" citation could not be independently confirmed — treat as best-practice, not contractual guarantee. |

---

## TIER C — off unless you ask (identityRisk: quality-risk / distribution-shift)

Ships **off**. Each row needs a measured quality delta on the customer's own workload before it's ever default-on.

### Context and agentic-loop management

| Method | What it is | Savings | Effort | Trap |
|---|---|---|---|---|
| Context editing (`clear_tool_uses_20250919`, `clear_thinking_20251015`) | Server-side strip of stale tool_use/tool_result or thinking blocks past a configurable trigger | Anthropic's blog (claude.com/blog/context-management) states 84% token reduction in a 100-turn web-search eval, 39% task-performance improvement combined with the memory tool. **Flag:** the technical docs page (platform.claude.com/…/context-editing) itself carries no benchmark numbers — the figure is blog-sourced marketing from a primary domain, not from the reference docs, and should be presented with that provenance, not as a guaranteed customer outcome | Medium — beta header, configure trigger/keep/`exclude_tools` | Clearing genuinely removes content the model can see on every subsequent turn — this is a real capability change, not a compute optimization. Also invalidates the prompt cache from the clear point forward. |
| Automatic thinking-block stripping (Sonnet 4.5/Haiku 4.5 and earlier) | API auto-strips prior-turn thinking blocks before billing next turn's input | Unquantified, automatic — but genuinely a context-drop, not a compute reuse | None (automatic on eligible models) | Not available on Opus 4.5+/Sonnet 4.6+/Fable-line — those keep thinking by default; must opt in via `clear_thinking_20251015` there instead. |
| `output_config.effort` (low/medium/high/xhigh/max) | Single lever scaling thinking depth, tool-call verbosity, response length | Anthropic: "Sonnet 5 at medium ≈ Sonnet 4.6 at high" — implies a step-down is often free quality-wise, but no $ figure | Low (param) but needs an eval harness to validate per-task | API default is `high`. Changing effort between requests **invalidates prompt-cache breakpoints** — don't tune it per-request without accounting for the cache-write cost that follows. |
| Task budgets (`task-budgets-2026-03-13` beta) | Injects a token countdown so the model self-paces | Indirect — reduces blowup risk, doesn't discount tokens | Low-Medium | **Not a billing cap.** `max_tokens` remains the only hard ceiling; the usage object carries no task-budget field to verify against. Also adds tokens (the countdown itself is injected content read every turn). |
| Conversation compaction (summarize-and-reinitialize) | Summarize transcript, restart context from the summary | No fixed ratio published | High — build summarization + eval loop | Anthropic's own tuning guidance is "bias toward recall then iterate toward precision" — an explicit admission this is lossy by design. |
| Structured note-taking / memory tool | Persist notes outside context, pull back selectively | Unquantified, scales with history otherwise resident | High | Only as good as what the agent chooses to write down; nothing forces completeness. |
| Just-in-time retrieval vs. context stuffing | Keep references in context, load data at runtime via tool call | Unquantified | High — architecture change | Anthropic's own explicit tradeoff: runtime exploration is slower than pre-loaded data. Hybrid (some upfront + JIT rest) is their recommendation, not pure JIT. |
| Sub-agent context isolation | Sub-agent explores in isolated context, returns condensed summary | Anthropic: sub-agent work can run "tens of thousands of tokens," parent sees "often 1,000-2,000" | High — multi-agent architecture | Raw exploration detail is permanently unavailable to the orchestrator — if it needed something the summary dropped, it can't get it back without re-running. |
| Tool-set minimalism / consolidation | Fewer, parameterized tools vs. one-tool-per-action | Reduces fixed per-request tool-def + tool-use system-prompt tax (286–804 tok, model-dependent) | Medium — design work | Anthropic's own bar: "if a human engineer can't say which tool applies, an agent can't either" — over-consolidating hurts selection accuracy just like over-fragmenting does. |
| High-signal tool-response shaping | Return only fields Claude needs, not raw payloads | Unquantified, scales with upstream verbosity | Medium | Under-shaping (dropping a field the model later needs) forces an extra round-trip tool call — can net negative. |
| Few-shot example reduction (canonical vs. exhaustive) | Fewer, diverse examples over an edge-case laundry list | Unquantified | Low-Medium | No lower bound given — cutting too far degrades the behavior the examples existed to pin down. |
| Tool search tool (`tool_search_tool_regex/bm25`, `defer_loading:true`) | Only search tool + always-on tools load up front; rest load on demand | Anthropic's example: 55K-token 5-server MCP setup cut >85%; also *improves* selection accuracy past 30-50 tools | Medium — restructure catalog, flag `defer_loading` | Full definitions still ship server-side every request (server needs them to search) — only the *billed system-prompt prefix* shrinks, not the request payload. Distribution-shift because it changes what's discoverable/discovered per call. |
| Citations / `search_result` blocks (`citations.enabled:true`) | Server extracts `cited_text` structurally instead of the model reproducing quotes | Real for quote-heavy RAG — quoted spans free vs. billing them as output once + input every later turn | Medium — restructure RAG plumbing | Incompatible with `output_config.format` — 400 error if both set. |
| `tool_choice`: auto/none over forced any/tool | Smaller injected tool-use system prompt when not forcing | ~100–400 tok/request, model-dependent (Opus 5: 286 vs 406 tok) | Low | Tagged distribution-shift because `auto` genuinely permits the model to skip the tool call or add preamble — pulls in the **opposite direction** from the next row. |
| Forced `tool_choice` to skip preamble | `{type:'any'}`/`{type:'tool',...}` suppresses lead-in text | Removes a full text block per turn | Low | Direct tension with the row above: forcing removes preamble tokens but pays the larger forced-tool-choice system-prompt tax and removes the model's option not to call a tool at all. Pick one deliberately per call-site, don't apply both as a blanket policy. |
| `web_fetch` over `web_search` when URL is already known | No per-call fee vs. $10/1,000 searches | Full fee avoided for genuine known-URL lookups | Low | Tagged distribution-shift, not none — a fetch returns the full page, a search returns ranked snippets; not interchangeable for "find me the right page" queries, only for "get me this page." |
| Structured outputs / strict tool schemas — retry-waste elimination | Schema-constrained generation avoids malformed-output retries | Unquantified — scales with a given integration's prior retry rate | Low (feature) / needs telemetry to prove the retry rate it's saving | Mild quality-risk tag because constraining generation can produce valid-but-different content vs. free-form in edge cases. Separately: **turning structured outputs on at all is billing-neutral-to-negative** (small injected-instruction tax) — don't market this as a discount, only as retry-avoidance. |
| Output-schema / field-name compression (short JSON keys, no descriptions) | Shrink requested-output token count directly | **INFERRED, untested by any researcher, no Anthropic guidance found** | Low to try | Nobody has measured whether this holds up on real schemas or what it costs in downstream parseability/model performance — don't ship this as a validated lever, ship it as an experiment. |
| Token-efficient tool use (`token-efficient-tools-2025-02-19` beta) | Terser tool-call formatting | Up to 70% output-token reduction claimed, avg 14% across early users (claude.com/blog) | Low (header) | **Currently unclear whether it still applies to Opus 5/Sonnet 5** — absent from the current tool-use overview, pricing table, and migration guide checked. Verify with a live call before quoting the 70%/14% figures against current-era models. |
| Mid-conversation operator messages instead of editing top-level `system` | Append `{role:'system',...}` to `messages[]` rather than mutating top-level `system` | Avoids full-prefix re-hash/reprocess of entire prior conversation | Low | Tagged distribution-shift (not none) — the model may genuinely see this differently positioned/roled content differently than a true system-field instruction. Opus 5/4.8/Fable 5/Mythos 5 only; not Sonnet 5. |
| Context-scoping via external retrieval (narrow query tool vs. full re-send) | Give the model a scoped query tool instead of dumping full corpus/codebase each turn | One reported case: 15K→5K tokens/turn (66%) | High — build the retrieval interface | Single anecdotal source (HN post); no generic ratio. |

### Semantic caching (structurally cannot be identity-preserving)

| Method | What it is | Savings | Effort | Trap |
|---|---|---|---|---|
| Semantic/similarity-threshold response caching (LiteLLM `qdrant/redis-semantic`, Portkey Enterprise semantic, Bifrost semantic mode, GPTCache, ModelCache) | Embed the prompt, serve the stored answer of the nearest neighbor above a similarity threshold | 100% of cost per hit, but false-hit rates are measured and real: one comparative study found GPTCache 233/700 false hits vs. 89 for MeanCache; MeanCache itself claims +17-32% precision/F-score over GPTCache-style baselines via a federated-learned threshold | Medium — embedding infra + a false-hit eval harness before shipping | **A "hit" returns an answer generated for a genuinely different prompt.** Not identity-preserving even in principle — this is the one category that must carry an explicit customer warning, never be presented as "basically the same as calling the model." GPTCache's own maintainers had to bolt on a second LLM call (July 2025) just to catch false positives from their first cost-saving mechanism — a live demonstration the risk is real, not theoretical. |

### Prompt/output compression

| Method | What it is | Savings | Effort | Trap |
|---|---|---|---|---|
| LLMLingua / LLMLingua-2 / LongLLMLingua | Small-model-scored token dropping to shrink the prompt before it reaches the target model | LLMLingua: up to 20x on ICL/reasoning w/ claimed minimal loss, but task-dependent — near-lossless on GSM8K at 5-20x, **-13.2 EM points on BBH at 5-7x** in the same paper. LLMLingua-2: retains ~75% of uncompressed score on LongBench SingleDoc at 5x (vs. ~56% for v1). LongLLMLingua: up to +21.4% on NaturalQuestions (noise removal helps) but 94% cost cut on LooGLE elsewhere | High — deploy a compressor model + per-task quality eval before trusting a ratio | **Not a uniform small tax.** The loss is severe and unpredictable by task; a ratio safe on GSM8K can be brutal on BBH. Never apply one blanket compression ratio across a mixed workload. |
| Batch prompting (pack K queries into one call) | Bundle K independent queries, one completion answers all K | Up to 5x token/time reduction at batch size 6; authors report comparable-or-better accuracy on 10 datasets w/ Codex/GPT-3.5/4 | Medium — restructure call sites to batch-compatible queries | Only applies where queries are genuinely independent and batchable; failure isolation gets harder (one bad completion can corrupt K answers). |

### Model/routing swaps (change what answers, not how it's billed)

| Method | What it is | Savings | Effort | Trap |
|---|---|---|---|---|
| Cascades/routers (RouteLLM, FrugalGPT, Hybrid LLM, Mixture-of-Thought, AutoMix) | Send cheap/easy queries to a weaker model, escalate on low confidence | FrugalGPT: up to 98% cost cut at matched GPT-4 accuracy. RouteLLM: 3.66x cost cut at ~95% quality (MT-Bench). AutoMix: >50% cost cut, comparable performance | High — train/deploy a classifier or confidence scorer | **Structurally cannot satisfy "same model."** These are catalogued per the brief but sit outside idemlayer's identity-preserving premise by construction — the entire mechanism is diverting queries to a different model. RouteLLM itself: unmaintained (last commit 2024-08-09), pinned to stale deps. |
| Standard- vs. high-resolution vision tier | Route fidelity-insensitive image calls to a standard-tier model | Up to 3x fewer image tokens (docs: high-res "up to roughly 3x more visual tokens than the same image on standard tier") | Low (routing param) | This is a model-tier choice, not a same-model tweak — flag alongside the cascade family even though the token math is fully documented. |
| Server-side refusal fallback + fallback-credit repricing | On a policy-classifier refusal, `fallbacks` param re-runs on a named different model server-side, cached span billed at read rate | Recovers most of the caching economics on the rescue attempt vs. a cold full-price retry | Low (param) | Genuinely substitutes a different model for the one requested — real output-distribution change, not transport/pricing-only. 1P/AWS-Platform only. |

---

## Compounding — the correct formula

**These levers multiply, they do not add.** Summing headline percentages overstates savings and can produce mathematically impossible numbers (90% + 50% = 140% off is not a thing).

For a token subject to N independent multipliers, the combined price is the **product**:

```
effective_price(token) = base_price × m₁ × m₂ × ... × mₙ
```

Example already in this catalogue: cache-read (0.1x) stacked with batch (0.5x) = **0.1 × 0.5 = 0.05x** base price → 95% off, not 90%+50%.

**Blended savings across a real workload is not any single lever's headline number** — it's a weighted average over token categories (cache-write, cache-read, uncached-input, output), weighted by how many tokens actually fall in each bucket:

```
blended_cost  = Σ over categories [ tokens(category) × base_price × Π applicable multipliers ]
blended_savings% = 1 − blended_cost / (total_tokens × base_price)
```

**Worked example** — 1M input tokens, 80% cache-hit rate, Batch API in use, no geo pinning:

| Category | Tokens | Multiplier | Base-equivalent cost |
|---|---|---|---|
| Cache-read | 800,000 | 0.1 (cache) × 0.5 (batch) = 0.05x | 40,000 |
| Uncached/write | 200,000 | 0.5 (batch only) | 100,000 |
| **Total** | 1,000,000 | — | **140,000** |

Blended: 140,000 / 1,000,000 = **0.14x base price paid → 86% blended savings** — lower than the 90–95% either lever claims alone, because the uncached 20% only ever gets the batch discount, never the cache discount. **Report the blended number, computed from a customer's own hit rate, never the best individual lever's number as if it applied to the whole bill.**

Geo-pinning avoidance and code-exec container exemptions are flat multipliers on top of whichever of the above applies (1.0x if not pinned; 1.1x if pinned, applied to every category including cache reads/writes).

---

## Image/vision workloads

**Formula (current, verified — not the deprecated `w×h/750` figure still repeated by third-party blogs):**
```
visual_tokens = ceil(width/28) × ceil(height/28)
```
1092×1092 → exactly 1521 tokens per Anthropic's own worked table. The old `/750` approximation is off by ~4.5% and gives no model of the resize-threshold behavior where the real cost swings happen.

| Lever | Tier | Savings | Trap |
|---|---|---|---|
| Prompt-cache repeated image/PDF bytes (`cache_control` on the image/document block) | A (none) | ~90% on cache-hit portion, same mechanics as text | Cache breakpoint lookback is only 20 content blocks — an image-heavy turn can silently miss even with `cache_control` set correctly if the matching breakpoint sits further back. **Verify with `usage.cache_read_input_tokens`, don't assume.** |
| Batch API for vision/PDF | A (none) | 50% off, full feature parity documented | Same 24h-delay tolerance requirement as any batch workload. |
| Deliberate downscale below the resolution-tier auto-cap | C (quality-risk) | Fully deterministic per the formula: a 4K screenshot auto-caps to 4784 tok on Opus 5 ($23.92/1000 images); pre-resizing to 1456×819 → 1560 tok ($7.80/1000) = 67% cut. A 1920×1080 image goes from 2691 tok ($13.46/1000, uncapped at that tier) to the same $7.80 target = 42% cut | Trades away small text / fine UI element legibility — needs a fidelity eval on the actual document class, not applied blind. |
| Standard- vs. high-res tier model | C (quality-risk, model swap) | Up to 3x fewer tokens per image | Changes which model answers — routing decision, not a same-model tweak. |
| Rasterize PDF pages client-side, send as image blocks instead of document blocks | C (quality-risk, INFERRED strategy) | Eliminates the documented 1,500-3,000 text-extraction tokens/page that a document block bills on top of image tokens | Forfeits citations tied to the document block's text layer; not an Anthropic-recommended pattern, it's a constructed technique from documented component costs. |
| Downsample embedded raster images inside a source PDF before upload | C (quality-risk) | Anthropic's own tip for dense PDFs that hit context-window pressure before the page-count limit | Unconfirmed whether this reduces *per-page* token cost directly (page rasterization dimensions are generally governed by page size, not embedded-image resolution) except for scan-style PDFs where one image fills the page. |
| **Format conversion (JPEG/PNG/WebP/GIF)** | — DEAD END | None | Token cost is purely a function of pixel width×height. Format only affects payload size and (if lossy) legibility. Don't spend engineering time here expecting a token win. |
| **Tiling a large image into sub-images** | — DEAD END | Negative | Each tile is independently subject to the resolution-tier cap — N tiles cost ~N× a single capped image. This is a *fidelity-recovery* technique, not a cost technique; conflating the two makes the pipeline more expensive, not less. |
| **Files API alone** | — DEAD END | None | Confirmed explicitly for images: cost is based on resolution, not encoding. `file_id` bills identically to inline base64. Only becomes a lever paired with prompt caching (smaller payload/latency win only, standalone). |
| >20 images/documents in one request | — TRAP, not a lever | N/A | Triggers a stricter per-image dimension cap (`invalid_request_error`, guidance: keep either dimension <2000px or the request ≤20 blocks). A batch-heavy pipeline assuming the normal 8000×8000px ceiling applies regardless of image count starts getting rejected well before the 100/600-image request ceiling. |

---

## Customer's first week, ordered by savings-per-hour-of-work

1. **Strip `inference_geo:"us"` pinning** wherever there's no real residency requirement. One param, guaranteed 10%. Minutes of work.
2. **Add `cache_control` breakpoints** to the stable prefix (system prompt, tool defs, static docs) — static-first/volatile-last ordering. Biggest single lever (up to 90% on the cached portion), low effort, no quality risk. Verify with the Token Counting API that the prefix clears the model's minimum before trusting the hit rate.
3. **Route anything tolerant of ≤24h delay to the Batch API** — flat 50%, no quality change. Async/batch-eligible workloads (bulk generation, offline classification, evals) usually exist in every customer's traffic; find them first.
4. **Stack the two**: same cache blocks inside batch requests, switch to 1-hour TTL for batch specifically. Small incremental config once 2 and 3 exist.
5. **Quick wins**: `web_fetch` over `web_search` on known-URL lookups, pair code-exec calls with a web tool to zero out container billing, reuse `container_id` across a session, drop `stop_sequences` on format-constrained generations. Each is minutes; collectively real on tool-heavy workloads.
6. **Measure actual duplicate-request rate** before building anything Tier B. If it's non-trivial (retries, double-submits, fan-out races), stand up the exact-match dedup/coalescing layer — this is idemlayer's own core product, medium effort, and the savings scale directly with a number you should measure first, not assume.
7. **Only after 1–6 are in and measured**: pick one Tier C candidate with a real quality-eval harness already in place (context editing on long agent loops, or effort-parameter step-down) and A/B it with a measured delta before flipping it on for real traffic. Never batch-enable Tier C off a vendor percentage alone — see semantic caching's false-hit rate and LLMLingua's task-dependent loss as the standing cautionary examples.

---

## Dead ends (do not re-derive, do not build against these)

**Pricing surfaces that don't exist or don't help:**
- Priority Tier — closed to new purchases; even when open, was a capacity/uptime commitment (99.5% target), never a per-token discount.
- Fast Mode (`speed:"fast"`) — a 2x price *premium* on Opus 5/4.8, stacks multiplicatively with caching/geo multipliers. Not available on Batch.
- Files API alone — no token-billing reduction, confirmed explicitly for images; payload/latency win only.
- Raising/lowering `max_tokens` — zero direct price effect either direction; billing is on `output_tokens` actually generated. Use `effort`/`stop_sequences`/task budgets to actually cap spend.
- Structured outputs / strict tool use — no discount; small added input tax plus one-time (24h-cached) schema-compile cost.
- "Long-context premium tier" above ~200K tokens — does not exist on any current-gen model; a 900K-token request bills at the identical per-token rate as a 9K-token one.
- Web search error non-billing — real but narrow (only applies when the search call itself errors); not a usable strategy.

**Vision-specific:**
- `width×height/750` token formula — superseded by `ceil(w/28)×ceil(h/28)`, off by ~4.5%.
- Image format conversion (JPEG/PNG/WebP/GIF) — no token effect, pixel dimensions only.
- Tiling for resolution preservation — increases cost (~N×), not a savings technique.
- Files API for images/PDFs alone — same as general dead end above.

**Impossible/out-of-scope by construction:**
- Speculative/draft-model decoding — requires injecting draft-model proposals into the target model's forward pass; no hosted Messages API (Anthropic included) exposes any such parameter. If a provider runs it internally, savings are already priced in and invisible customer-side.
- Quantization, distillation, KV-cache eviction — weight/attention-internals level, not exposed on any hosted API, out of scope by the task's own constraint too.
- Provider-side continuous/iteration-level batching (Orca 36.9x, vLLM 24x vs. naive serving) — real, likely a major reason hosted prices are as low as they are, but 100% internal to the provider with zero customer-facing knob. The *only* customer-actionable batching lever is the documented Message Batches endpoint — there is no second one hiding anywhere.
- Cascades/routers (RouteLLM, FrugalGPT, etc.) — cannot by construction satisfy a same-model guarantee; catalogued above under Tier C for completeness, but structurally in conflict with an identity-preserving product, not a config choice to work around.

**Supply-chain / OSS gateway findings:**
- RouteLLM — abandoned (last commit 2024-08-09), pinned to `numpy<2` and stale torch/transformers.
- Langfuse — no direct cost lever at all; tracing/eval/dashboards only.
- Cloudflare AI Gateway, OpenRouter, Requesty — no publishable source for the actual gateway/router; a supply-chain code read is structurally impossible, which is itself the finding.
- **litellm PyPI compromise, 2026-03-24**: versions 1.82.7/1.82.8 shipped a credential-stealing + Kubernetes-propagating backdoor for ~40 minutes (compromised Trivy CI/CD dependency leaked the publish token). Releases 1.78.0–1.82.6 audited clean; v1.83.0+ rebuilt with cosign signing. **Pin an exact post-1.83.0 version and verify signatures — never float `litellm` unpinned in production.**
- GPTCache's own July-2025 commit (#669) bolted on a second LLM call specifically to catch false-positive semantic-cache hits — the maintainers' own evidence that semantic caching's quality risk is real, not theoretical.

**Research-quantification gaps, explicitly not papered over:**
- Whether byte-for-bit determinism holds independent of caching — unresolved; see the GPU non-determinism caveat at the top of this document.
- LLMLingua-2's exact accuracy-retention number vs. baselines — abstract claims "significant gains," no number found; logged UNQUANTIFIED, not guessed.
- Output-schema/field-name compression — no Anthropic documentation found either way; the one INFERRED entry in this catalogue, flagged as such rather than dressed up as verified.
- Conversation-compaction and memory-tool compression ratios — Anthropic gives qualitative guidance only ("right altitude," bias-recall-then-precision), deliberately no benchmarked percentage.

**Practitioner-layer noise, explicitly excluded:**
- A long list of 2026-dated SEO blog posts (aimagicx.com, iron-mind.ai, tokenmix.ai, and ~20 others) cite specific-sounding percentages ("95% savings," "$600/month switching to Haiku," "65% cost reduction with zero quality degradation") with no named company, no linked logs, near-identical boilerplate across unrelated domains. None traced to a verifiable primary source on spot-check. **None of these numbers appear anywhere in this register.**
- Model-routing "50-80% savings" claims — same pattern, unnamed sources, and structurally out-of-scope anyway (model swap).
- `anthropics/claude-code#47098` — new sessions don't inherit cache from a prior session seconds apart (~6,505 wasted cache-create tokens/session start). Closed "not planned" by Anthropic — accepted architecture, not a client-side-fixable bug.
- No Anthropic customer case study (anthropic.com/customers) quantifies $ or % API-bill savings from caching specifically — existing stories (Pelanor, IG Group, Novo Nordisk) quantify time/productivity, not spend.
- `#46829` — a reported silent 1hr→5min cache-TTL default regression (~17.1% overpay across 4 months, one user's self-parsed logs) is a **separate, unconfirmed claim** from Anthropic's officially-confirmed April 23 postmortem bug (thinking-block over-clearing). Anthropic's postmortem does not mention a TTL change at all. Don't merge the two incidents into one story.