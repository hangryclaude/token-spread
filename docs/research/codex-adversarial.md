## 1. Factual errors

### Critical: the nondeterminism evidence is misattributed

[Register line 5](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:5) says Thinking Machines Lab measured Anthropic’s hosted infrastructure producing 80 completions.

It did not. The experiment used `Qwen/Qwen3-235B-A22B-Instruct-2507` served through vLLM. It is evidence that ordinary GPU inference can be batch-dependent, not evidence about Anthropic’s production stack. The broader caveat is valid; the attribution is false. [Experiment description](https://www.mbgsec.com/archive/2025-09-11-defeating-nondeterminism-in-llm-inference-thinking-machines-lab/).

Rewrite it as:

> Thinking Machines Lab obtained 80 unique outputs from 1,000 temperature-zero runs of Qwen3 on vLLM. This demonstrates a mechanism capable of causing hosted-model nondeterminism, but does not establish Anthropic’s observed divergence rate.

### Critical: the compounding example undercharges cache writes

[Lines 125–133](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:125) classify the uncached 20% as `0.5×` “batch only.” If those are cache-creation tokens, the cache-write premium also applies.

For a 5-minute cache:

- 800k read: `800k × 0.1 × 0.5 = 40k`
- 200k write: `200k × 1.25 × 0.5 = 125k`
- Total: `165k`, or **83.5% savings**, not 86%.

For a 1-hour cache:

- 200k write: `200k × 2 × 0.5 = 200k`
- Total: `240k`, or **76% savings**.

The published multipliers do stack, so the `0.05×` cache-read calculation is valid; the error is omitting the write multiplier. [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing?hsLang=en).

The example also conflates “cache miss” and “cache write.” A miss can include ordinary uncached suffix tokens plus cache-creation tokens, which require separate billing categories.

### High: “10% savings” from removing a 10% surcharge is mathematically wrong

[Line 29](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:29) and the first-week recommendation at [line 164](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:164) claim a guaranteed 10% saving.

Moving from `1.1×` to `1.0×` saves:

```text
1 - 1 / 1.1 = 9.09%
```

It removes a surcharge equal to 10% of base price, but reduces the previously pinned invoice by 9.09%. Anthropic confirms the `1.1×` multiplier. [Pricing documentation](https://platform.claude.com/docs/es/about-claude/pricing).

### High: Bedrock and Vertex do not “fully lack Batch”

[Lines 25 and 38](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:25) make an absolute claim that Bedrock and Vertex lack batch processing.

That is stale and overbroad:

- Amazon Bedrock now documents batch support for supported models/endpoints, although feature availability depends on API surface and model. Its native prompt caching is expressly unsupported with native batch inference, which is a compatibility issue—not absence of batch. [AWS scaling guide](https://docs.aws.amazon.com/bedrock/latest/userguide/scaling-throughput-best-practices.html), [Bedrock prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html).
- Gemini on Vertex AI supports batch inference, generally at a 50% discount. [Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing?hl=he).
- Azure supports Global Batch and Data Zone Batch at 50% discounts. [Azure deployment types](https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/deployment-types?view=foundry-classic).

A narrower claim may remain true for the exact Anthropic Message Batches endpoint on particular legacy partner integrations, but the register does not say that.

### High: regional-pricing rules are incorrectly collapsed across providers

[Lines 29 and 38](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:29) treat Anthropic `inference_geo`, Bedrock profiles, and Vertex endpoints as one mechanism.

They are separate products with separate prices and routing semantics:

- Anthropic 1P/Claude Platform: US-only `inference_geo` is `1.1×`.
- Bedrock: global cross-Region profiles are documented as approximately 10% cheaper than geographic profiles for applicable offerings. [AWS cross-Region inference](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html).
- Vertex: regional/global and provisioned-throughput prices must be checked per model/SKU.

“Don’t pin a region” cannot be represented by one universal multiplier.

### High: the cache-minimum table needs platform dimensions

The prior critique’s table at [completeness-gaps lines 58–64](/Users/angus/dev/token-spread/docs/research/2026-08-09-completeness-gaps.md:58) is broadly correct for Anthropic-operated surfaces, but it is not universally correct across Bedrock.

Anthropic’s current documentation explicitly notes that Fable 5 and Mythos 5 have a 512-token minimum on Anthropic-operated platforms but a 1,024-token minimum on Bedrock. [Prompt-caching limits](https://platform.claude.com/docs/en/build-with-claude/prompt-caching?AdId=DP_PM&CampaignId=&SiteId=DP_Other&_ref=finder&e45d281a_page=1&eid=4457955&f80ce999_sort_Plus+ancien=asc&fcdaa149_sort_Plus+ancien=asc&marketingSource=7013X000002W44NQAS&pn=AWLP).

Therefore the register’s “512–4096 depending on model” at [line 19](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:19) is incomplete: it depends on **model and hosting surface**.

### Medium: grammar caching is described as a cost saving without evidence

[Line 39](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:39) calls structured-output grammar-cache reuse a “cost/latency win.”

The documentation establishes reduced subsequent compilation latency, not a token-price discount or separately metered compilation charge. The schema still injects extra billed prompt tokens. Unless Anthropic separately bills compile work, schema stability is a latency optimization, not a demonstrated invoice reduction. [Structured outputs documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs?m=1).

### Medium: the `max_tokens` dead-end is false as written

[Line 180](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:180) says lowering `max_tokens` has “zero direct price effect.”

It has no effect when generation ends before the cap. If the cap binds, it directly reduces generated and billed output tokens—by truncating output. That makes it a Tier C cost lever, not a dead end.

The same row recommends task budgets to “actually cap spend,” while [line 64](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:64) correctly says task budgets are not billing caps. Only `max_tokens` is the hard generation ceiling.

### Medium: the vision formula is correct but presented incompletely

[Lines 141–145](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:141) correctly give:

```text
ceil(width / 28) × ceil(height / 28)
```

But that formula applies to the **post-resize, padded dimensions Claude processes**, not blindly to uploaded dimensions. Every model tier also has a maximum edge and visual-token budget; oversized images are resized first. The register later uses the caps correctly, but the headline formula should include that sequencing. [Anthropic vision documentation](https://platform.claude.com/docs/en/build-with-claude/vision?refid=sm_builders_flash_multi-modal-genai).

### Medium: “format has no token effect” needs a byte-preservation qualification

[Lines 155 and 187](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:155) say JPEG/PNG/WebP/GIF conversion has no token effect because only dimensions matter.

That is true only if decoded dimensions remain unchanged. Lossy recompression changes pixels and therefore can change output even when token count stays constant. Animated GIF handling also reduces to the first frame. It is a billing dead end, but not necessarily an output-neutral transformation.

### Medium: the model/date record is internally stale

The prior critique correctly identifies omissions around Sonnet 5 pricing, tokenization and Opus 5 default thinking, but the register still contains older-generation generalizations:

- [Line 62](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:62) does not cover the complete current model family consistently.
- [Line 178](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:178) describes Fast Mode as a 2× premium for only Opus 5/4.8, while current availability/pricing varies by model generation.
- [Line 27](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:27) hard-codes a future-looking model support list without linking a dated availability source.

The current official facts include:

- Sonnet 5 introductory price expires August 31, 2026.
- Sonnet 5 tokenizes identical text at approximately 30% more tokens than Sonnet 4.6.
- Sonnet 5 rejects non-default sampling parameters.
- Opus 5 has thinking on by default.  
  [Sonnet 5 changes](https://platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5), [Opus 5 changes](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-8).

These belong in a dated provider capability table, not prose that silently ages.

---

## 2. Misclassified tiers

The current Tier A boundary is not defensible. “Same logical task” and “same request body” are not enough. For the stated product promise, Tier A must mean:

> No customer-observable response field or generation-affecting input, scheduling mode, routing constraint, tool environment, or termination rule is changed.

Under that definition:

### Prompt caching: not provably Tier A

[Lines 7 and 19](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:7) say output is unaffected “by definition.”

Anthropic and Azure document prompt caching as output-neutral. That is good provider evidence, but not a proof of byte identity. A cached KV path and a fresh-prefill path are different execution paths. Without provider guarantees about numerical equivalence, cache serialization precision, backend versioning and kernels, an enterprise vendor cannot independently prove identical logits or bytes.

Classification:

- **Contractual Tier A** if the product promise means “the provider documents this feature as output-neutral.”
- **Not proof-grade Tier A** if the promise means “we can prove the returned bytes could not change.”

The product needs those two labels separated.

### Cache-stable prompt reordering: Tier C

[Line 20](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:20) recommends moving static material before volatile material.

Reordering prompt blocks changes token order and therefore the model input. It can change attention, instruction priority and output. Only construction that preserves the already-deployed byte sequence is Tier A. Retrofitting “static-first” is Tier C.

### Deterministic tool serialization: Tier C unless byte-preserving

[Line 21](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:21) changes tool-definition serialization.

Sorting JSON keys or tools changes request bytes and potentially their rendered position in model context. It is safe only if performed before the customer establishes a baseline and the provider formally treats order as semantically irrelevant. Applied to existing production requests, it is Tier C.

### Message Batches: not Tier A under an identical-output promise

[Line 25](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:25) assumes same model/messages/sampling implies unchanged output.

Batch changes scheduling and batching. The register itself invokes batch-dependent GPU reductions as a source of nondeterminism. It cannot simultaneously use that mechanism to deny reproducibility and classify moving a call into a different batching regime as provably output-neutral.

Batch is:

- request-semantics-equivalent;
- provider-supported;
- **not byte-identity-preserving**.

Put it in a new “A-contractual / distribution-equivalent, not byte-provable” tier.

### Regional/global routing: not Tier A

[Line 29](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:29) changes the geography and likely the physical serving fleet.

That can change:

- backend release rollout;
- accelerator/kernel;
- batching population;
- safety or policy deployment version;
- availability and retry path.

Even if weights are nominally the same, global routing is exactly the sort of infrastructure change that can alter output under nondeterminism. It also changes a customer compliance property. It cannot ship as Tier A merely after confirming no residency obligation.

### Code-execution/web-tool pairing: Tier C

[Line 30](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:30) adds web tools to a request to waive container charges.

Adding tool definitions or enabling a tool changes what the model sees and can do. It can alter tool choice and output. Tier C.

If a web tool was already present for functional reasons, the billing exemption is Tier A because no change is being made. “Add a tool to get free compute” is not.

### Container reuse: Tier C unless the container was already reused

[Line 31](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:31) reuses mutable state: files, installed packages, environment variables and process artifacts.

A fresh container and a reused container are not equivalent execution environments. Reuse can change tool results and therefore model output. Tier C unless the application already has a strict immutable-container protocol and can prove the relevant filesystem/environment snapshot is identical.

### `stop_sequences`: unequivocally Tier C

[Line 34](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:34) changes the request and terminates generation earlier.

Even when the stop string is omitted from returned text, it can change `stop_reason`, streaming events, tool arguments, trailing whitespace, JSON completeness and whether generation continues after a matching substring in quoted content. This directly contradicts the Tier A definition at line 3.

### Removing files: Tier C unless proven unreachable

[Line 35](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:35) changes the tool environment. “The model probably will not use this file” is not proof that it cannot affect tool execution.

Tier A only where the file is demonstrably not included in model-visible metadata and cannot be accessed by any invoked code.

### Streaming instead of non-streaming: only partly Tier A

[Line 36](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:36) changes transport semantics.

The generated text should be equivalent, but the observable API result is not byte-identical: event framing, partial visibility, errors and cancellation behavior differ. It is Tier A only if “output” is explicitly normalized to the final assembled model content and the client never takes actions based on partial tokens.

### Negotiated pricing: genuine Tier A

[Line 37](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:37) is the cleanest Tier A technique in the entire register. It changes no request, route or execution behavior. The same is true of correctly applied credits, enterprise discounts and marketplace discounts.

### Moving providers: not Tier A

[Line 38](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:38) recommends moving from Bedrock/Vertex to Anthropic-operated infrastructure.

That changes serving infrastructure, endpoint behavior, error semantics, release timing, safety layers and batching. Same nominal model ID is not proof of the same model artifact or inference stack. Tier C.

### Grammar-cache stability: Tier A but not a demonstrated cost lever

Keeping an already-used schema unchanged does not change output relative to the established baseline. It is safely Tier A, but the documented benefit is latency, not necessarily invoice reduction.

### Resume-from-partial is not Tier B

[Line 49](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:49) is badly misclassified.

A continuation request:

- changes the prompt;
- can repeat or omit text at the join;
- cannot recover hidden model state;
- may choose a different continuation;
- is especially unsafe for JSON, code and tool calls.

It is Tier C. Only replaying a previously persisted remainder from the original response could be Tier B.

### Vision prompt caching inherits the prompt-cache caveat

[Line 149](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:149) is contractually output-neutral but not independently byte-provable.

### Vision Batch inherits the Batch problem

[Line 150](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:150) is not strict Tier A because it changes execution scheduling.

### Tier C techniques that can move to Tier A

Very few. The safe subset is conditional:

- Keeping an existing schema stable.
- Observability, accounting and alerting that do not modify or retry calls.
- Procurement discounts and billing credits.
- Eliminating requests that can be proven never to have been authorized logical work—duplicate HTTP delivery with a stable operation ID, for example.
- Replaying a fully completed, signed response for an operation whose contract explicitly defines retries as retrieval of the original operation result.

Everything else that modifies tokens, tools, routing, model, provider, context, image pixels, output grammar or stopping behavior belongs outside strict Tier A.

---

## 3. Missing techniques

### Provider-native OpenAI coverage

The register needs, at minimum:

- Automatic prompt caching and its model-specific minimums, retention and cached-input prices.
- OpenAI Batch API, generally 50% discounted for eligible endpoints.
- Flex processing for delay-tolerant traffic.
- Enterprise committed-use/private pricing and Scale Tier economics.
- Data-residency and regional-processing price differences.
- Azure versus OpenAI 1P price and feature comparisons.
- `seed` and `system_fingerprint` as reproducibility evidence—not guarantees.
- Explicit model snapshots rather than floating aliases. This reduces upgrade drift but does not create deterministic inference.
- Cached-input telemetry and per-prefix hit/miss analysis.

These must not automatically be Tier A: Batch, Flex and regional routing alter scheduling or infrastructure.

### Gemini API and Vertex AI

Missing wholesale:

- Gemini Batch API: approximately 50% discount.
- Gemini Flex: lower price for delay-tolerant/best-effort traffic.
- Explicit context caching: discounted reads plus storage charges; calculate reuse/TTL break-even rather than quoting the read discount alone.
- Implicit caching where supported.
- Vertex Provisioned Throughput via GSUs and commitment durations.
- Google Cloud committed-use/enterprise agreement discounts.
- Global versus regional endpoints and data-residency tradeoffs.
- Model-version pinning.
- `seed` as “mostly deterministic,” explicitly not guaranteed. [Vertex generation configuration](https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/GenerationConfig).
- Search grounding/query charges and duplicate grounding-query waste.

Google documents Batch, Flex, Priority and context-cache prices separately. [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing?authuser=0).

### AWS Bedrock

Missing or misstated:

- Native batch inference and OpenAI-compatible batch where supported.
- Flex, Standard, Priority and reserved capacity tiers.
- Global cross-Region inference profiles, documented as approximately 10% cheaper than geographic profiles for applicable services.
- Provisioned Throughput with no commitment, one-month and six-month terms. [AWS Provisioned Throughput](https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html).
- Bedrock prompt caching for Anthropic and OpenAI models, with model-specific TTLs/minimums and no native batch-cache combination.
- AWS Enterprise Discount Program, private pricing and Marketplace private offers.
- Correct sizing of provisioned capacity from measured input/output mix and cache hit rate.
- Shutting down unused no-commit provisioned capacity; AWS continues billing until deletion.
- Per-request application-inference-profile tags and cost allocation.
- Guardrail, Knowledge Base, Agent and tool charges outside model tokens.

### Azure OpenAI / Microsoft Foundry

Missing:

- Global Batch and Data Zone Batch at 50%.
- Prompt-cached input discounts for Standard deployments and potentially zero marginal cached-token cost on provisioned deployments. [Azure prompt caching](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/prompt-caching).
- Provisioned Throughput Units for stable high utilization.
- One-month and one-year PTU reservations; create the deployment before purchasing the reservation because capacity availability changes. [PTU billing](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/provisioned-throughput-billing).
- Cached tokens do not consume PTU capacity for supported models, reducing required PTUs. [PTU sizing](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/provisioned-throughput).
- Spillover from provisioned to standard and the resulting double cost surface. [Spillover billing](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/spillover-traffic-management).
- Global, Data Zone and Regional deployment tradeoffs.
- Azure reservation utilization/coverage monitoring.
- Deployment consolidation where fragmented PTU pools leave paid capacity idle.

### Procurement and commercial levers

These are the strongest strict Tier A category and deserve a full section:

- Enterprise committed-spend discounts.
- Marketplace private offers.
- Cloud-provider EDP/CUD credit application.
- Reserved/provisioned-capacity break-even analysis.
- Volume-tier aggregation across business units.
- Invoice auditing for missed cached-token, batch or private-rate application.
- Service credits for SLA violations.
- Migration credits and promotional pricing.
- Currency and billing-entity optimization where legally appropriate.
- Contract clauses requiring notice before model alias, tokenizer, safety-layer or serving-stack changes.
- Price protection and most-favoured pricing clauses.
- Capacity resale/reallocation rights and reservation exchangeability.
- Negotiated retention/ZDR features that avoid needing a more expensive isolated deployment.

Only the financial clauses are strict Tier A. Capacity products require evidence that they use the same serving artifact and semantics.

### Error and retry waste

The register barely scratches this category:

- Stable logical-operation IDs assigned before the first attempt.
- Retry deduplication across processes, regions and queues.
- Single-flight coalescing before a request reaches the provider.
- Retry budgets by error class; never retry deterministic 4xx failures.
- Respect `Retry-After` and provider-specific backoff.
- Prevent SDK retry plus application retry plus queue retry from multiplying attempts.
- Detect hedged requests and cancel/ignore duplicate winners.
- Persist completed responses before acknowledging upstream work.
- Transactional outbox/inbox patterns around LLM work queues.
- Dead-letter invalid jobs instead of retrying forever.
- Prevalidate model, parameter, context-size, schema and media constraints.
- Detect partial-stream ambiguity rather than blindly regenerating.
- Tool-loop and agent-step circuit breakers.
- Retry amplification metric:

```text
provider attempts / authorized logical operations
```

Deduplication is strict Tier B only where the operation contract says repeated delivery retrieves the same operation result. Suppressing a user-requested independent sample is not safe.

### Observability-driven waste elimination

Missing:

- Cost per logical operation, not merely per API call.
- Token and dollar attribution by tenant, workflow, prompt version, deployment and retry cause.
- Cache creation/read/uncached suffix decomposition.
- Cache miss-reason classification: TTL, prefix mutation, model change, tool change, routing change, below minimum.
- Prompt-prefix cardinality and entropy.
- Retry amplification and duplicate-call rate.
- Abandoned/orphaned generations after caller disconnect.
- Output-cap utilization distribution.
- Tool-loop length and repeated identical tool calls.
- Batch eligibility detection from actual latency SLOs.
- Provisioned-capacity utilization and reservation coverage.
- Price/version drift alerts.
- Provider invoice reconciliation against raw usage receipts.
- Per-release canaries for tokenizer and output drift.
- “Savings realized” measured against a reconstructable counterfactual, not headline percentages.

Passive measurement is Tier A. Automatically changing requests based on those measurements is not.

### Infrastructure layer

For customers controlling inference infrastructure:

- Batch-invariant kernels and deterministic inference mode.
- Prefix/KV caching with equivalence testing.
- Continuous batching and iteration-level scheduling.
- Speculative decoding with exact target-model verification: accepted draft tokens must be verified by the target model, which can preserve the target distribution mathematically, though byte identity still depends on deterministic arithmetic and sampling.
- Disaggregated prefill/decode.
- KV-cache-aware routing.
- GPU right-sizing and higher utilization.
- Autoscaling and scale-to-zero for non-SLO workloads.
- Reserved GPU capacity, spot instances for restartable jobs and capacity marketplaces.
- Quantization only where bitwise or functional equivalence is established—which ordinarily excludes it from this product.
- Kernel/model artifact pinning and reproducible container images.
- Power/cooling/location procurement.

The register incorrectly calls speculative decoding inherently output-changing at [line 192](/Users/angus/dev/token-spread/docs/research/2026-08-09-method-register.md:192). Proper speculative decoding verifies draft proposals against the target model and is designed to preserve its sampling distribution. It is unavailable as a customer knob on many hosted APIs, but it is not inherently quality-reducing. “Unavailable on this API” and “cannot preserve output distribution” are different claims.

---

## 4. The hard question it cannot answer

The honest answer to the CTO is:

> For a newly generated hosted-model response, we cannot prove the counterfactual claim that the provider would have returned identical bytes without our optimization. We can prove what request we sent, what response we received, what transformations we performed, and whether a replay matches a stored response. We cannot observe the unexecuted alternate inference.

### What to build

Build an evidence system, not merely an eval harness:

1. **Define the identity object.** Decide whether identity covers only assistant text or also tool calls, ordering, whitespace, stop reason, usage fields, citations, safety metadata and stream events. “Identical output” is meaningless until this is fixed.

2. **Capture an immutable request envelope.** Store exact request bytes plus normalized fields:

   - provider and endpoint;
   - immutable model snapshot, not alias;
   - tokenizer/version where exposed;
   - all sampling and reasoning parameters;
   - system/developer/user messages;
   - tool schemas and ordering;
   - images/files by content hash;
   - tool results and retrieved documents;
   - residency/routing/service tier;
   - SDK and API version.

3. **Content-address everything.** Hash the complete envelope and every external dependency. Canonicalization may be used for indexing, but never silently treat two different byte requests as equivalent.

4. **Persist raw provider output before transformation.** Preserve stream chunks, assembled content, headers, request IDs, model-returned version/fingerprint, usage and timestamps.

5. **Issue signed receipts.** A receipt should bind:

```text
request hash
provider request ID
model snapshot
execution/routing metadata available
raw response hash
normalized response hash
optimization applied
prior-response hash for replay
software build and policy version
```

Use an append-only transparency log or customer-verifiable signatures.

6. **Separate evidence classes.**

   - `REPLAY_PROVEN`: returned bytes hash-match a previously accepted response.
   - `REQUEST_PRESERVED`: generation-affecting request fields were byte-identical.
   - `PROVIDER_CONTRACTUAL`: provider documents the feature as output-neutral.
   - `EMPIRICALLY_EQUIVALENT`: paired tests found no detected difference within stated bounds.
   - `NOT_PROVABLE`: routing, scheduling or execution path changed without deterministic attestation.

7. **Run shadow and canary experiments.** For proposed Tier A mechanisms, submit randomized paired baseline/optimized requests and compare:

   - exact byte equality;
   - structured/tool-call equality;
   - divergence rate with confidence intervals;
   - output-length and refusal distributions;
   - repeated-run distributions to estimate the provider’s own baseline variability.

This can falsify identity. It cannot prove universal identity from finite samples.

### Strongest possible evidence

For Tier B replay, the strongest evidence is genuinely strong:

- customer-approved original response;
- immutable response bytes;
- cryptographic hash and signature;
- exact operation/request hash;
- replay response hash equal to the stored response hash.

That proves the replayed bytes equal the historical artifact. It does **not** prove that a new model invocation would have produced those bytes.

For fresh generation, proof would require provider cooperation:

- immutable weight and tokenizer identifiers;
- deterministic sampler with fixed seed;
- batch-invariant kernels;
- fixed numerical precision and reduction order;
- pinned hardware/compiler/kernel versions;
- deterministic safety and routing layers;
- deterministic tool and retrieval inputs;
- remote attestation that this stack was used;
- ideally token-level logits or a verifiable inference proof.

No mainstream hosted API exposes enough of this today.

OpenAI/Azure’s own reproducibility documentation explicitly says determinism is not guaranteed even with matching `seed` and `system_fingerprint`. [Azure reproducible output](https://learn.microsoft.com/sr-cyrl-rs/azure/ai-foundry/openai/how-to/reproducible-output). Vertex describes seeded output as mostly, not absolutely, deterministic. [Vertex GenerationConfig](https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/GenerationConfig).

### What is impossible to prove

Without a deterministic provider contract and execution attestation, you cannot prove:

- what the unoptimized counterfactual call would have returned;
- that cache-hit and cache-miss logits were bit-identical;
- that Batch and synchronous execution used equivalent numerical paths;
- that global and regional fleets used identical artifacts;
- that an unchanged model alias did not move to new weights, tokenizer, kernel or safety policy;
- that temperature zero removes infrastructure nondeterminism;
- that finite A/B tests establish equality for all possible prompts.

The commercially defensible promise is therefore narrower:

> We cryptographically prove exact replay for Tier B. For fresh Tier A generation, we prove that we did not alter the generation-affecting request and rely on specifically identified provider-documented output-neutral billing features. We disclose where provider infrastructure prevents counterfactual byte-identity proof.

Anything stronger is marketing ahead of the evidence.
