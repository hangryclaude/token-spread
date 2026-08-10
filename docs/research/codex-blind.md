# Hosted LLM API cost reductions that preserve the result

Research checked 2026-08-10.

## Classification rule

- **A** — The request’s model-visible input, model/version, sampling/reasoning settings, and forward pass remain unchanged. Only billing, capacity, scheduling, recovery, or transport changes.
- **B** — Safe only when replaying the stored result of an exact byte-identical request.
- **C** — Changes input tokens, model, tools, sampling, reasoning, or output length. Excluded from a strict same-result product.

“50% saving” means reduction from the stated baseline: `(old cost − new cost) / old cost`. Provisioned-capacity savings cannot be stated honestly without utilization; the correct calculation is:

```text
effective saving =
1 - (reserved-capacity cost + overage cost) / equivalent PAYG cost
```

## A — Output unaffected

### 1. OpenAI Flex processing

- **Mechanism:** Send the identical request to the same model with `service_tier=flex`; only scheduling priority changes.
- **Providers:** OpenAI.
- **Saving:** Normally **50% versus Standard**, because Flex is priced at Batch rates.
- **Evidence:** Official [Flex processing guide](https://platform.openai.com/docs/guides/flex-processing) and [API pricing](https://openai.com/api/pricing/).
- **Effort:** Low; request parameter, longer deadlines, retry-policy changes.
- **Trap:** Flex can queue longer or return capacity errors. A short client timeout followed by a new POST can turn one discounted run into two charged runs. Model availability is limited.

### 2. Gemini Flex inference / Vertex Flex PayGo

- **Mechanism:** The same model and request run in a lower-priority synchronous queue.
- **Providers:** Gemini Developer API; supported Vertex AI Gemini SKUs.
- **Saving:** **50% versus Standard**.
- **Evidence:** Official [Gemini Flex inference documentation](https://ai.google.dev/gemini-api/docs/flex-inference).
- **Effort:** Low.
- **Trap:** Target processing time is roughly 1–15 minutes; Google recommends a client timeout of at least 600 seconds. It is sheddable, may return 429/503, and does not automatically fall back. Blind fallback to Standard removes the discount.

### 3. Amazon Bedrock Flex tier

- **Mechanism:** Set `service_tier=flex`; the same supported model/request runs at lower priority.
- **Providers:** Amazon Bedrock, but only models and regions explicitly supporting Flex.
- **Saving:** Model-specific difference between Flex and Standard; AWS publishes no universal percentage.
- **Evidence:** Official [Bedrock service-tier documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html) and [pricing table](https://aws.amazon.com/bedrock/pricing/).
- **Effort:** Low.
- **Trap:** Best-effort service, longer latency, higher throttling risk, no general SLA, and incomplete model support. Inspect the returned `ResolvedServiceTier`; requested and served tiers can differ.

### 4. Remove accidental Priority-tier use

- **Mechanism:** Explicitly request Standard—or Flex where acceptable—when project/account defaults or gateways are silently selecting Priority.
- **Providers:** OpenAI, Google Gemini, Amazon Bedrock.
- **Saving:**  
  - Google Standard is **42.9–50% cheaper than Priority**, because Priority costs 75–100% above Standard; Flex is **71.4–75% cheaper than Priority**.  
  - Other providers: current model-specific `1 − standard_price / priority_price`.
- **Evidence:** Official [Google Priority inference](https://ai.google.dev/gemini-api/docs/priority-inference), [OpenAI Priority processing](https://openai.com/api-priority-processing/), and [Bedrock service tiers](https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html).
- **Effort:** Low; enforce allowed tiers at gateway/IAM level and audit the resolved tier.
- **Trap:** Priority may be buying latency and availability that prevent operational retries. Removing it can backfire if the application has deadlines designed around Priority.

### 5. OpenAI Scale Tier / Reserved Tier

- **Mechanism:** Pre-purchase dedicated token-per-minute capacity for a fixed model snapshot instead of paying per token.
- **Providers:** OpenAI Enterprise; Scale Tier covers older model generations, Reserved Tier newer ones.
- **Saving:** Workload-specific. Example: GPT-4.1 Scale Tier lists 30,000 input TPM for $110/day and 2,500 output TPM for $36/day; compare those fixed charges with the same workload’s PAYG bill.
- **Evidence:** Official [Scale Tier pricing and mechanics](https://openai.com/api-scale-tier/) and [Reserved Tier](https://openai.com/api-reserved-tier/).
- **Effort:** High; procurement, capacity modelling, project configuration.
- **Trap:** Minimum terms, stranded TPM, separately sized input/output capacity, and premium-priced spillover. Scale usage is measured in aligned intervals rather than allowing an entire month’s capacity to be consumed whenever convenient.

### 6. Azure OpenAI Provisioned Throughput Units

- **Mechanism:** Run the identical deployed model/version on fixed PTU capacity rather than per-token Standard deployments.
- **Providers:** Azure OpenAI / Microsoft Foundry.
- **Saving:** Workload-specific; calculate hourly PTU cost divided by useful token throughput and compare with PAYG.
- **Evidence:** Official [PTU billing documentation](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/provisioned-throughput-billing).
- **Effort:** High.
- **Trap:** PTUs are billed whether busy or idle and cannot be paused. Deletion stops billing but may sacrifice scarce capacity. Incorrect output-token assumptions can produce severe under-sizing or over-sizing.

### 7. Azure PTU monthly or annual reservations

- **Mechanism:** Apply a term discount to already-deployed PTUs.
- **Providers:** Azure OpenAI / Microsoft Foundry.
- **Saving:** Current discount varies. Microsoft’s published Global PTU example used $1/PTU-hour, $260/month for a monthly reservation, and $221/month annual-effective. Against 730 hourly charges, those are approximately **64.4%** and **69.7%** reductions; this is an illustrative 2024 basis, not a current universal quote.
- **Evidence:** Official [Azure announcement](https://azure.microsoft.com/en-us/blog/accelerate-scale-with-azure-openai-service-provisioned-offering/) and current [reservation mechanics](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/provisioned-throughput-billing).
- **Effort:** Medium/high.
- **Trap:** A reservation is a billing instrument, not capacity. Deploy first, then reserve. Global, Data Zone, and Regional reservations are not interchangeable; wrong scope or deployment type leaves the reservation unused while the deployment remains hourly-billed.

### 8. Consolidate Azure Global PTU reservation coverage

- **Mechanism:** One correctly scoped Global reservation can cover matching Global PTU deployments across subscriptions and regions.
- **Providers:** Azure OpenAI.
- **Saving:** Reserved-versus-hourly delta on every PTU moved from unmatched to matched coverage.
- **Evidence:** Official [PTU billing and reservation documentation](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/provisioned-throughput-billing).
- **Effort:** Medium.
- **Trap:** Scope, tenant, deployment type, and billing-account mismatches silently strand the discount. Data Zone and Regional reservations remain region-specific.

### 9. Resize or delete idle hourly PTU deployments promptly

- **Mechanism:** Azure prorates partial-hour deployment time and adjusts billing immediately when PTUs are resized.
- **Providers:** Azure OpenAI.
- **Saving:** `removed PTUs × hourly rate × avoided hours`.
- **Evidence:** Official [PTU billing documentation](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/provisioned-throughput-billing).
- **Effort:** Low/medium; scheduled lifecycle automation.
- **Trap:** PTUs cannot be paused. Deleting capacity may make it unavailable later, so the dollar saving must be weighed against capacity-reacquisition risk.

### 10. Keep Azure overflow inside already-paid PTU capacity

- **Mechanism:** Queue latency-tolerant requests behind saturated PTUs instead of allowing separately billed Standard spillover.
- **Providers:** Azure OpenAI.
- **Saving:** **100% of the avoided PAYG spillover charge**; the fixed PTU cost remains.
- **Evidence:** Official [Azure spillover documentation](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/spillover-traffic-management).
- **Effort:** Medium.
- **Trap:** Queue delay can violate deadlines. Retrying a request that actually entered PTU execution can create a duplicate. Spillover is useful for reliability but is not itself free.

### 11. Google Vertex AI Provisioned Throughput

- **Mechanism:** Reserve GSUs for the same pinned model version and request.
- **Providers:** Vertex AI.
- **Saving:** Workload-specific versus PAYG. Published Global prices are $1,200/GSU/week, $2,700/month for one month, $2,400/month for three months, and $2,000/month for one year.
- **Evidence:** Official [Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing), [purchase documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/purchase-provisioned-throughput), and [throughput measurement](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/measure-provisioned-throughput).
- **Effort:** High.
- **Trap:** Cannot cancel mid-term; unused throughput does not roll over; overage defaults to PAYG; orders are project/location/model-version bound. Model aliases are not supported, so exact versions must be selected.

### 12. Choose the longer Vertex PT commitment when the load is certain

- **Mechanism:** Buy the identical GSU capacity for a longer term.
- **Providers:** Vertex AI.
- **Saving:** From the published Global rates, three months saves **11.1%** versus repeated one-month pricing; one year saves **25.9%**.
- **Evidence:** Official [Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing).
- **Effort:** Procurement only.
- **Trap:** Those percentages become negative if capacity is stranded, the workload moves, or the pinned model is discontinued during the commitment.

### 13. Global rather than non-global Vertex PT

- **Mechanism:** Buy Global GSUs for the same model/version where residency permits.
- **Providers:** Vertex AI.
- **Saving:** Published non-global prices are 1.10× Global, so Global is **9.09% cheaper**.
- **Evidence:** Official [Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing).
- **Effort:** Medium.
- **Trap:** Data residency, latency, model support, and order-location requirements. This is A only when the exact model version and request semantics remain identical.

### 14. Size Vertex PT using cached-token burndown

- **Mechanism:** Provision against the discounted capacity consumption of cache reads rather than pretending cached tokens consume full GSU throughput.
- **Providers:** Vertex AI.
- **Saving:** Google’s Gemini 2.5 Pro example burns one cached input token as 0.1 throughput token, permitting up to **10× cached-input throughput**, or **90% less capacity attributable to that prefix**.
- **Evidence:** Official [Provisioned Throughput measurement documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/measure-provisioned-throughput).
- **Effort:** Medium.
- **Trap:** This does not mean the total bill falls 90%. Cache misses consume the full rate and can cause PAYG spillover or 429s. Storage and cache-write economics must still be included.

### 15. Amazon Bedrock Provisioned Throughput

- **Mechanism:** Purchase dedicated Model Units for the same model and requests.
- **Providers:** Amazon Bedrock.
- **Saving:** Workload-specific; AWS does not publish a universal MU discount. Longer commitment terms have lower hourly prices.
- **Evidence:** Official [Bedrock Provisioned Throughput documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html).
- **Effort:** High.
- **Trap:** Fixed hourly billing, model/region restrictions, opaque MU throughput for some models, and billing that continues until the provisioned resource is deleted. One- and six-month terms can cost more than on-demand when utilization is uneven.

### 16. Amazon Bedrock Reserved tier

- **Mechanism:** Reserve separate input and output TPM capacity for one or three months.
- **Providers:** Supported Bedrock models.
- **Saving:** Contract- and utilization-specific; no public universal percentage.
- **Evidence:** Official [Bedrock service-tier documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html).
- **Effort:** High.
- **Trap:** Minimums of 100,000 input TPM and 10,000 output TPM, separately billed overflow, and ongoing billing until deletion through the account team. Cache-write tokens count against reserved input capacity.

### 17. Specifically cheaper Bedrock global inference profiles

- **Mechanism:** Use a listed global profile that invokes the same model version at a lower token rate.
- **Providers:** Amazon Bedrock.
- **Saving:** AWS has documented approximately **10% lower input and output prices** for the global Claude Sonnet 4.5 profile than corresponding regional inference.
- **Evidence:** Official [AWS cross-region inference article](https://aws.amazon.com/blogs/alps/unlocking-ai-flexibility-in-switzerland-a-guide-to-cross-region-inference-for-eu-data-processing-and-model-access/) and [Bedrock CUR pricing dimensions](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-understanding-cur-data.html).
- **Effort:** Low/medium.
- **Trap:** This is not a general “cross-region is cheaper” rule. Geo, global, and in-region SKUs can have different prices and residency properties. Verify the exact model/profile pair.

### 18. Negotiated direct-provider volume or annual-commit discounts

- **Mechanism:** Apply a private unit-price discount while sending the same requests.
- **Providers:** Anthropic, OpenAI, and contractually Google Gemini.
- **Saving:** Contract-specific; no defensible public percentage.
- **Evidence:** Official [Anthropic pricing](https://docs.anthropic.com/en/docs/about-claude/pricing) mentions volume pricing; [OpenAI Scale Tier](https://openai.com/api-scale-tier/) says annual commitments can discount multiple processing modes.
- **Effort:** High; procurement and forecasting.
- **Trap:** Minimum-spend breakage, excluded SKUs, credit-expiration rules, and discounts that appear in order forms but not on the actual project or invoice. Require a SKU-level eligibility schedule.

### 19. Cloud enterprise/private pricing

- **Mechanism:** Use an enterprise agreement, negotiated Azure offer, or qualifying Google private contract to reduce the rate for the same SKU.
- **Providers:** Azure OpenAI; potentially Vertex AI where explicitly included.
- **Saving:** Contract-specific.
- **Evidence:** Official [Azure OpenAI pricing](https://azure.microsoft.com/en-us/pricing/details/azure-openai/) states actual prices vary by agreement, currency, and offer. Public Google Cloud CUD eligibility does **not** establish a Gemini discount.
- **Effort:** High.
- **Trap:** Generic cloud-spend commitments frequently exclude marketplace or model-as-a-service SKUs. Never count the discount until the exact inference SKU appears in the contract.

### 20. AWS Marketplace Private Offers for eligible Bedrock models

- **Mechanism:** A negotiated Marketplace price applies centrally while applications continue invoking the same Bedrock model normally.
- **Providers:** Eligible third-party Bedrock models using managed entitlements.
- **Saving:** Private-offer-specific.
- **Evidence:** Official [Bedrock managed-entitlements FAQ](https://docs.aws.amazon.com/bedrock/latest/userguide/managed-entitlements-faq.html) and [usage documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/managed-entitlements-using-models.html).
- **Effort:** High.
- **Trap:** Only eligible Marketplace licensing paths qualify. The central subscription account is billed, grants must be configured correctly, and commitment terms may overwhelm the nominal discount.

### 21. OpenAI complimentary tokens for opt-in data sharing

- **Mechanism:** Eligible organizations share API inputs and outputs with OpenAI while sending the same request to the same model.
- **Providers:** OpenAI.
- **Saving:** **100% up to the daily allowance**. Published allowances include up to 1M large-model and 10M small-model tokens/day for usage tiers 3–5; tiers 1–2 receive 250k and 2.5M respectively.
- **Evidence:** Official [OpenAI data-sharing incentive documentation](https://help.openai.com/en/articles/10306912-sharing-feedback-and-api-inputs-and-outputs-with-openai).
- **Effort:** Low technically; potentially high governance review.
- **Trap:** Ineligible for Enterprise and ZDR, limited to listed models and operations, requires a positive balance, and creates a serious privacy/training tradeoff. If one request crosses the remaining allowance, the entire request is billed normally. OpenAI can terminate the program with notice.

### 22. Promotional, startup, research, or service credits

- **Mechanism:** Apply provider-issued credits to otherwise unchanged API charges.
- **Providers:** Potentially all five commercial channels.
- **Saving:** Up to **100% until the credit balance is exhausted**.
- **Evidence:** The exact basis is the specific official offer or signed contract, not a general industry claim.
- **Effort:** Low to high depending on eligibility.
- **Trap:** Credits are usually limited, expiring, non-transferable, SKU-restricted, or unavailable for production inference. Anthropic prepaid credits expire after one year and are non-refundable; Google’s general welcome credit is not automatically a Gemini API entitlement. Prepayment without a discount is not a saving.

### 23. SLA/service-credit recovery

- **Mechanism:** Claim contractual credits when uptime or latency SLAs are breached, without changing requests.
- **Providers:** Enterprise OpenAI tiers, Azure, Vertex PT, Bedrock offerings where the applicable contract provides an SLA.
- **Saving:** Contractual credit percentage for the affected period; no universal number.
- **Evidence:** Official service terms and the customer’s order form; OpenAI documents service credits for qualifying Priority/Scale customers on its [Priority page](https://openai.com/api-priority-processing/).
- **Effort:** Medium; retain metrics, submit claims inside the deadline.
- **Trap:** Credits are often not automatic, exclude throttling or customer-caused failures, and may be capped at that service’s monthly spend.

### 24. Prevent retry multiplication

- **Mechanism:** Permit exactly one retry layer instead of allowing SDK, gateway, queue consumer, service mesh, and application retries to multiply one failure.
- **Providers:** All.
- **Saving:** If a logical call currently produces `N` successfully started generations, reducing it to one saves `(N−1)/N`; two runs to one is **50%**, ten to one is **90%**.
- **Evidence:** Arithmetic; Azure officially notes that the OpenAI Python SDK defaults to retries and warns about multiplicative custom retry policies in its [quota guidance](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/quota).
- **Effort:** Medium.
- **Trap:** Count actual attempts at every layer. A 429 rejected before generation may cost no tokens, while a local timeout can leave a billable generation running.

### 25. Retry only genuinely retryable statuses

- **Mechanism:** Do not retry authentication, validation, policy, context-length, or other terminal errors; use bounded exponential backoff with jitter for 429/503.
- **Providers:** All.
- **Saving:** No token saving for failures the provider already makes free; saving arises only from preventing a later duplicate success or retry storm.
- **Evidence:** Official [Gemini billing](https://ai.google.dev/gemini-api/docs/billing), [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting), [Bedrock throughput guidance](https://docs.aws.amazon.com/bedrock/latest/userguide/scaling-throughput-best-practices.html), and [Anthropic billing guidance](https://support.anthropic.com/en/articles/8114526-how-will-i-be-billed).
- **Effort:** Low/medium.
- **Trap:** HTTP status alone may not reveal whether a mid-stream generation partially ran. Retrying a broken stream starts a new generation; it does not resume the old one.

### 26. Queue and smooth traffic instead of generating retry storms

- **Mechanism:** Place requests behind a rate-aware queue so the same request runs once when capacity becomes available.
- **Providers:** All, especially PAYG Vertex and Bedrock.
- **Saving:** Avoided duplicate successful attempts; workload-specific.
- **Evidence:** Official [Vertex 429 guidance](https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429) and Bedrock scaling documentation.
- **Effort:** Medium.
- **Trap:** A queue with visibility timeouts shorter than model latency can itself duplicate deliveries. Extend leases while inference is running and use an atomic ownership record.

### 27. Align client, proxy, queue, and model deadlines

- **Mechanism:** Make upstream deadlines long enough that an accepted generation is not abandoned and resubmitted.
- **Providers:** All; particularly reasoning models and Flex tiers.
- **Saving:** One avoided duplicate out of two attempts is **50%** for the affected request.
- **Evidence:** Official Google Flex guidance recommends 600-second-or-longer deadlines; Anthropic states a client disconnect or timeout during an otherwise successful request can still be charged in its [billing FAQ](https://support.anthropic.com/en/articles/8114526-how-will-i-be-billed).
- **Effort:** Low/medium.
- **Trap:** The shortest timeout may live in a load balancer, worker lease, mobile client, serverless runtime, or API gateway rather than application code.

### 28. Disable speculative hedging for already-accepted generations

- **Mechanism:** Do not launch a second identical provider call merely because the first has slow time-to-first-token; hedge only before acceptance if the platform offers a safe mechanism.
- **Providers:** All.
- **Saving:** Eliminating a two-call hedge saves up to **50%** for every hedged request.
- **Evidence:** Arithmetic and provider non-idempotency; no hosted inference provider here documents general POST deduplication.
- **Effort:** Low.
- **Trap:** “Cancel the loser” may be too late: both generations can already be billable. Hedging is a latency purchase, not free redundancy.

### 29. Use durable background execution and retrieval

- **Mechanism:** Submit once, retain the response ID, and retrieve or accept a webhook instead of repeating a request after an HTTP timeout.
- **Providers:** OpenAI Responses API; analogous asynchronous APIs where the provider documents durable job retrieval.
- **Saving:** **100% of each duplicate generation avoided**, or 50% relative to a two-run incident.
- **Evidence:** Official OpenAI [webhook events](https://platform.openai.com/docs/api-reference/webhook-events) and [endpoint retention policy](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint).
- **Effort:** Medium.
- **Trap:** Persist the response ID before acknowledging job ownership. OpenAI background responses have retention implications and are incompatible with ZDR. A response ID is retrieval capability, not an idempotency key for a second POST.

### 30. Persist completed streamed responses before downstream acknowledgement

- **Mechanism:** Once the provider’s terminal event is received, durably store the exact response and mark the job complete before delivering it to an unreliable consumer.
- **Providers:** All streaming APIs.
- **Saving:** Avoids one complete regeneration for every downstream-delivery failure; **50%** if the prior behavior was two generations.
- **Evidence:** Architecture arithmetic; Vertex exposes `responseId`, timestamps, and usage metadata in its official [GenerateContentResponse schema](https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/GenerateContentResponse).
- **Effort:** Medium.
- **Trap:** A partially received stream is not a complete result and cannot be reconstructed safely. Missing final client-side usage metadata does not prove that the provider did not bill.

### 31. Decouple provider-stream consumption from client connection lifetime

- **Mechanism:** A durable server-side worker continues consuming and storing the provider stream even if the browser/mobile connection disappears.
- **Providers:** All.
- **Saving:** Avoided regeneration after each downstream disconnect; incident-specific.
- **Evidence:** Architecture arithmetic plus Anthropic’s documented timeout/disconnect billing behavior.
- **Effort:** Medium/high.
- **Trap:** Treating client cancellation as provider cancellation is unsafe. Some services may have already generated additional tokens before cancellation propagates.

### 32. Verify invoice-grade tier and usage metadata

- **Mechanism:** Reconcile provider cost exports against requested model, resolved service tier, region/profile, cache-write/read category, and project.
- **Providers:** All; especially OpenAI and Bedrock.
- **Saving:** No intrinsic saving; equals the mispriced or misrouted traffic corrected.
- **Evidence:** Official [Bedrock CUR documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-understanding-cur-data.html) shows separate token, tier, and routing dimensions.
- **Effort:** Medium.
- **Trap:** This is only an enabling control. Client token estimates and missing SSE usage fields are not invoice truth; Bedrock CUR also lacks per-request IDs for direct deduplication.

### 33. Replace paid “probe generations” with free token-count endpoints

- **Mechanism:** If a system currently invokes a model only to estimate request size, use the provider’s non-inference token-count API instead.
- **Providers:** Gemini API explicitly; Bedrock offers CountTokens but pricing/status must be checked for the selected route.
- **Saving:** **100% of the unnecessary probe-generation charge**.
- **Evidence:** Official [Gemini billing FAQ](https://ai.google.dev/gemini-api/docs/billing#is-gettokens-billed) says GetTokens is unbilled and does not consume inference quota.
- **Effort:** Low.
- **Trap:** CountTokens by itself does not make the real generation cheaper. Using the result to truncate or rewrite input is C.

## B — Safe only for an exact byte-identical repeat

The user’s list already includes exact-match response caching and request coalescing. The following are narrower implementations of that same fundamental technique, not independent A mechanisms.

### 34. Application idempotency ledger

- **Mechanism:** Hash the exact raw provider request plus endpoint, immutable model version, inference-affecting headers, tenant, and tool context; atomically elect one execution owner and replay its complete stored response.
- **Providers:** All.
- **Saving:** `(N−1)/N` for `N` identical submissions: **50% for two**, **90% for ten**.
- **Evidence:** Architectural arithmetic, not a vendor discount.
- **Effort:** Medium/high.
- **Trap:** JSON canonicalization can incorrectly merge byte-different requests. Include every inference-affecting field. Do not publish a response until the stream is complete, and never merge across security tenants or tool-side-effect scopes.

### 35. Completed-response redelivery

- **Mechanism:** If a consumer retries only because delivery acknowledgement was lost, replay the stored complete bytes instead of invoking the model.
- **Providers:** All.
- **Saving:** **100% of the avoided second invocation**.
- **Evidence:** Architectural arithmetic.
- **Effort:** Medium.
- **Trap:** Safe only when the stored response corresponds to that exact logical request. A partial stream or merely matching prompt text is insufficient.

### 36. Durable exact-request write-through cache at the provider gateway

- **Mechanism:** Store the raw final provider result keyed by a collision-resistant digest of the complete request envelope.
- **Providers:** All.
- **Saving:** Cache-hit rate multiplied by the avoided full request price.
- **Evidence:** Architectural arithmetic.
- **Effort:** Medium/high.
- **Trap:** Mutable model aliases, provider-side defaults, current time, external tools, safety settings, account-specific system injection, and hidden headers invalidate apparent equivalence. This remains B, never A.

No general inference `Idempotency-Key` guarantee was found for OpenAI, Anthropic Messages, Gemini GenerateContent, Bedrock InvokeModel/Converse, or Azure OpenAI. AWS `clientRequestToken` exists for some control-plane operations such as creating provisioned capacity; it does not deduplicate ordinary model inference.

## C — Changes model input, model, or thinking

These can save money but are excluded by the same-result constraint.

### 37. Minify prompts, JSON, XML, or tool schemas

- **Mechanism:** Remove whitespace, descriptions, default fields, examples, or shorten keys to reduce input tokens.
- **Providers:** All.
- **Saving:** Removed billed input tokens multiplied by the applicable rate; data-dependent.
- **Evidence:** Official token accounting plus direct tokenizer measurement.
- **Effort:** Low/medium.
- **Trap:** Whitespace, field order, descriptions, and key names are model-visible. Semantically equivalent is not output-identical.

### 38. Unicode normalization or alternate textual serialization

- **Mechanism:** Convert composed/decomposed Unicode, normalize punctuation, change escaping, or serialize equivalent values differently.
- **Providers:** All.
- **Saving:** Tokenizer-dependent.
- **Evidence:** Provider token counters.
- **Effort:** Low.
- **Trap:** It changes token IDs and therefore the forward pass, even where rendered text looks identical.

### 39. Replace inline data with URLs, files, or alternate modalities

- **Mechanism:** Substitute base64, raw text, PDF pages, images, hosted files, or provider file handles to exploit a cheaper billing path.
- **Providers:** All multimodal APIs.
- **Saving:** Modality- and model-specific.
- **Evidence:** Official pricing tables.
- **Effort:** Medium.
- **Trap:** The model receives a different modality, encoding, preprocessing path, or fetched content. URLs can also change over time.

### 40. Stay below a long-context threshold

- **Mechanism:** Delete, summarize, split, re-encode, or reorder content so the request avoids a higher long-context rate.
- **Providers:** Models with threshold pricing, including some Gemini and hosted Claude offerings.
- **Saving:** Potentially large; for a tariff that doubles input price above a threshold, up to 50% of that input charge.
- **Evidence:** Exact model pricing table.
- **Effort:** Medium.
- **Trap:** The model sees different input. Threshold pricing may reprice the whole request rather than only tokens above the boundary.

### 41. Lower output caps or add earlier termination

- **Mechanism:** Reduce `max_output_tokens`, add stop strings, or terminate streaming early.
- **Providers:** All.
- **Saving:** Avoided output tokens multiplied by the output rate.
- **Evidence:** Official token pricing.
- **Effort:** Low.
- **Trap:** If the cap or stop binds, the output changes. A high non-binding cap generally does not lower actual-token billing.

### 42. Reduce reasoning/thinking budget

- **Mechanism:** Lower reasoning effort, thinking tokens, or deliberation settings.
- **Providers:** OpenAI reasoning models, Gemini thinking models, Claude extended thinking.
- **Saving:** Avoided reasoning/output tokens; model-specific.
- **Evidence:** Official provider pricing and usage metadata.
- **Effort:** Low.
- **Trap:** It explicitly changes how much the model thinks and falls directly under C.

### 43. Change sampling or determinism controls

- **Mechanism:** Modify temperature, top-p/top-k, seed, candidate count, logprobs, or deterministic settings.
- **Providers:** All where supported.
- **Saving:** Usually indirect through shorter outputs, fewer candidates, or fewer retries.
- **Evidence:** Provider API specifications.
- **Effort:** Low.
- **Trap:** The output distribution or returned payload changes. A seed is not a cross-hardware guarantee of identical output.

### 44. Use a cheaper model, provider, endpoint wrapper, or model router

- **Mechanism:** Route the request to a lower-priced model or ostensibly equivalent hosted copy.
- **Providers:** All.
- **Saving:** Current price delta.
- **Evidence:** Official price tables.
- **Effort:** Medium.
- **Trap:** Same family name does not prove the same weights, snapshot, system wrapper, tokenizer, safety layer, tool formatting, or stochastic execution. Direct Claude and Bedrock Claude are not interchangeable under this constraint.

### 45. Model cascades, speculative fallback, or confidence routing

- **Mechanism:** Let a cheaper model answer some requests and escalate others.
- **Providers:** All.
- **Saving:** Traffic-weighted model-price delta.
- **Evidence:** Practitioner and research literature.
- **Effort:** High.
- **Trap:** Which model answers changes; classifiers have false accepts. C even if aggregate quality benchmarks remain flat.

### 46. Context editing, summarization, retrieval pruning, or conversation-state substitution

- **Mechanism:** Replace original context with selected, summarized, remembered, or server-held state.
- **Providers:** All.
- **Saving:** Removed input tokens.
- **Evidence:** Official token pricing and practitioner measurements.
- **Effort:** Medium/high.
- **Trap:** The model-visible context changes. `previous_response_id` or conversation state should not be assumed to make old context unbilled or identical.

### 47. Semantic caching

- **Mechanism:** Reuse a response for a merely similar request.
- **Providers:** Application layer.
- **Saving:** Hit rate multiplied by avoided inference cost.
- **Evidence:** Practitioner data and academic literature.
- **Effort:** High.
- **Trap:** Similar is not identical. False hits silently return a different answer to the one the model would have produced.

### 48. Prompt compression, LLMLingua, token pruning, or language translation

- **Mechanism:** Rewrite input into fewer tokens.
- **Providers:** All.
- **Saving:** Compression ratio applied to input-token cost, minus compressor cost.
- **Evidence:** Peer-reviewed papers and practitioner measurements.
- **Effort:** Medium/high.
- **Trap:** Every such transformation changes the token sequence; semantic preservation does not prove output preservation.

### 49. Remove or alter tools, grounding, search, code execution, or guardrails

- **Mechanism:** Avoid auxiliary fees and injected context by disabling features.
- **Providers:** All with paid tools or grounding.
- **Saving:** Tool charge plus associated tokens.
- **Evidence:** Official pricing.
- **Effort:** Low.
- **Trap:** The model sees different tool definitions/results or safety processing. Free pre-screening that suppresses an inference request also changes whether the customer receives an answer.

### 50. Fine-tuning to shorten prompts

- **Mechanism:** Move instructions/examples into weights and send a shorter request.
- **Providers:** Supported OpenAI, Azure, Google, and Bedrock models.
- **Saving:** Reduced recurring input tokens minus training and higher fine-tuned inference rates.
- **Evidence:** Official pricing and workload measurement.
- **Effort:** High.
- **Trap:** Different weights mean a different model and forward pass.

### 51. Batch splitting, parallel decomposition, or speculative decoding at application level

- **Mechanism:** Replace one request with several smaller calls or generate alternatives in parallel.
- **Providers:** All.
- **Saving:** Sometimes exploits thresholds or shorter contexts; often increases total cost.
- **Evidence:** Workload measurement.
- **Effort:** High.
- **Trap:** The computation graph, context available to each call, and synthesis step all change. Provider-internal speculative decoding is A only when transparent and already reflected in the same API price; customers generally cannot select it as a dollar-saving control.

## DEAD ENDS

### HTTP gzip, Brotli, HTTP/2, connection pooling, and compact request envelopes

They reduce bandwidth, CPU, or latency, not billed model tokens. Providers tokenize decompressed model content. Count your own network egress only if it is material; it is normally negligible beside inference.

### Streaming instead of non-streaming

Streaming has no general per-token discount. It improves time-to-first-token. A broken stream can be more expensive if the application regenerates the response.

### Disconnecting early to “stop the bill”

Cancellation propagation is not instantaneous or universally documented. Already-generated or successfully processed work may remain billable, and the customer no longer receives the same output.

### Raising quotas or usage tiers

Higher usage tiers and quota increases provide capacity, not a published lower token price. This applies to Anthropic usage tiers, Gemini paid tiers, Azure dynamic quota, and ordinary Bedrock quota increases.

### Backoff by itself

A clean rejected request is frequently unbilled. Backoff saves inference dollars only when it prevents an additional successfully executed request; otherwise it saves quota, infrastructure load, and latency.

### Retrying 400/500 requests to exploit “free failures”

Google documents that certain failed requests are uncharged. That does not make repeated failures useful, and the eventual successful call costs the normal amount.

### Treating request IDs as idempotency keys

Provider request IDs are generally diagnostic identifiers. They do not promise that a repeated inference POST returns the first result or avoids a second charge.

### AWS `clientRequestToken` on inference

It is documented for control-plane operations such as provisioned-capacity creation, not ordinary Bedrock InvokeModel or Converse inference.

### Counting tokens

A token counter provides observability. It does not lower the real request’s price unless it leads to changing the request—which is C. It saves money only when replacing an existing paid probe generation.

### Cost dashboards, tags, budgets, and alerts

They find waste and prevent future overspend but do not change unit price. Bedrock CUR is aggregated and cannot by itself deduplicate request IDs.

### Priority processing as a cost optimization

Priority is normally a premium. It can be economically justified by external latency value or measured reductions in duplicate work, but it is not intrinsically cheaper.

### Provisioned throughput without measured utilization

Provisioning is a capacity purchase, not automatically a discount. Idle capacity, wrong input/output mix, minimum units, non-cancellable terms, and PAYG overflow can make it substantially more expensive.

### Prepayment without a contractual discount

Moving cash earlier is not a saving. Expiring, non-refundable credits can increase effective cost.

### Generic cloud committed-use discounts

Do not assume AWS Savings Plans, Azure compute reservations, or Google Cloud CUDs cover managed LLM inference. The exact Bedrock, Azure OpenAI, or Vertex/Gemini SKU must be listed. Google’s public generic CUD eligibility does not establish a Gemini MaaS discount.

### Cross-region inference as a blanket rule

Some exact profiles are cheaper, some have source-region pricing, and others have distinct global/geo rates. Routing can also violate residency requirements. Only a published price delta for the exact model/profile is a saving.

### Switching direct-provider versus cloud-hosted copies

A lower posted price is real, but identical model names do not prove identical weights, wrappers, tokenization, safety systems, or revisions. Under the strict requirement this is C, not A.

### Model aliases

An alias can advance to a new snapshot. Pinning helps reproducibility, but changing an existing alias-based product to a pinned snapshot is not provably the same forward pass unless the provider confirms the alias currently resolves to that exact version.

### Free moderation or request screening

It saves money by suppressing some model calls. Those customers no longer receive the result the original model would have produced, so it is C.

### Client-side usage metadata as billing truth

Interrupted streams may omit final usage while the platform still records billable work. Reconcile against provider billing exports.

### Automatic PTU spillover

Spillover improves availability but usually incurs separate PAYG charges. It is only a saving when compared with an even more expensive duplicate/retry pattern.

### Buying an Azure reservation before creating capacity

Azure reservations discount matching deployed PTUs but do not reserve service capacity. An unmatched reservation can bill while covering nothing.

### Gemini prepaid billing and higher usage tiers

Prepay versus postpay changes funding mechanics, not token rate. Credits can expire; usage tiers raise limits rather than discounting tokens.

### OpenAI/Azure `max_tokens` reductions for rate-limit admission

A smaller cap can lower admission estimates, but actual billing is based on generated tokens. If the cap binds, output changes and the technique becomes C.

### Cache observability mistaken for cache savings

A cache hit counter, cache key, or cache-usage report saves nothing by itself. The underlying prompt-cache or response-cache mechanism supplies the saving; observability only confirms it.
