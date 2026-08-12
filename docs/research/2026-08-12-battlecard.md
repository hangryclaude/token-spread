<!-- INTERNAL ONLY. No legal entity exists to defend a disparagement claim; nothing here
     becomes public copy or names a competitor outside this repo. 28 of 32 competitor cards
     survived quote-verification; 4 failed and were excluded. Generated from a 9-agent
     adversarial sweep, 2026-08-12; every quote was re-fetched from the competitor's own site
     during verification. -->

# TOKEN-SPREAD — INTERNAL BATTLECARD
*Research only, no entity to defend a claim yet. Never becomes public copy, never names names outside this room.*

---

## 1. THE MARKET MAP

| Company | What they sell | Price (verified) | Identity posture | Threat |
|---|---|---|---|---|
| **Not Diamond** | Per-request model router + prompt-rewriter | $0.05/M tokens routed | Routes to a cheaper model, claims "no degradation" on aggregate benchmark only | **Existential** |
| **Anthropic (native)** | Prompt caching, Console, Admin API | Free (built into API) | Only vendor whose docs *state* identity: "response you receive is identical" | **Existential** |
| **ccusage × Lineman** | Free cost CLI (17.8k★) sponsored by a paid compressor | Free / Lineman $14.99–49.99/mo | ccusage: no claim at all. Lineman rides its install base. | **Existential** (distribution) |
| **Lineman** | Claude Code cost attribution by dev/repo/branch + secondary-LLM tool-output compressor | $14.99–49.99/mo + 2–3% of tracked spend | Compressor rewrites what the model reads before it reads it | **Serious** |
| **Portkey** | AI gateway: exact + semantic cache, routing, guardrails | $49/mo Prod, semantic cache Enterprise-only | Semantic cache ignores system-prompt changes for hit purposes, undisclosed | **Serious** |
| **OpenRouter** | Multi-provider API gateway | No markup on inference | Auto-router is opt-in (fair); provider load-balancing for a *pinned* model defaults on, undisclosed per-response | **Serious** (mechanism-specific — see below) |
| **LiteLLM** | OSS proxy/gateway, routing + caching | Free (OSS) / Cloud tier | Router is user-configured, never claims cross-model identity. Semantic-cache multi-turn risk self-disclosed | **Serious** (honest) |
| **ccusage** (standalone) | Free cost-tracking CLI | Free | No identity claim of any kind — pure capability gap, not a dishonesty | **Serious** (mindshare) |
| **Cloudflare AI Gateway** | Edge response cache | Free w/ account | Exact-match only today; semantic caching openly on roadmap, not shipped silently | **Serious** (reach, not attack) |
| **Vantage** | FinOps dashboard over Anthropic's own Admin API | Not disclosed | Visualization layer, no register, no per-technique verdict | Moderate |
| **CloudZero** | Cost-to-revenue allocation, also over Admin API | Not disclosed | Same structural gap as Vantage plus unexplained "forecasting" | Moderate |
| **Redis LangCache** | Managed semantic cache | Not disclosed | Same false-positive risk as GPTCache, zero disclosure on marketing page (GPTCache's own README discloses it) | Moderate |
| **Bifrost (Maxim AI)** | OSS gateway: failover + semantic cache | Free (OSS) / 14-day Enterprise trial | Two bundled identity risks (0.8 cosine threshold cache, silent provider failover) under one "99.99% uptime" headline | Moderate |
| **Helicone** | Observability + gateway | Not disclosed | Genuinely makes no savings claim to attack; exact-match caching only, opt-in header | Low |
| **Langfuse** | Tracing/observability | Not disclosed | Cost tracking is a pass-through of the SDK's own numbers, no adjudication | Low |
| **Finout** | Multi-cloud spend platform | Flat platform fee | Most restrained pitch on the whole sheet — no quantified savings claim at all | Low |
| **GPTCache / LLMLingua** | OSS semantic cache / prompt compressor | Free (OSS) | Both self-disclose their own failure modes in-README; not commercial competitors | Low |
| **OpenMeter** | Usage metering *for AI vendors to bill their own customers* | Not disclosed | Wrong axis entirely — revenue metering, not cost audit | N/A |

---

## 2. THE KILL LINES
*One sentence each, built only from their words + our verified properties. No line here requires the buyer to trust us on anything they can't check themselves.*

**Not Diamond** — Their pricing page promises "20–40% cost savings... without any degradation in quality relative to the frontier," and their own blog describes the mechanism as "a routing layer... sending each request to the best-performing model that meets your quality bar." A different model answering is, by construction, a different answer — their quality defense is an aggregate SWE-bench score, not a per-request guarantee for *this* request.

**Lineman** — Their own docs: a second LLM rewrites "the data-heavy parts of your Claude Code session" before your model reads them. Their own benchmark page: "Solution quality was not evaluated on this run." They never checked whether the lever they sell preserves the answer.

**Portkey** — Their own semantic-cache docs: "changing [the system prompt] does not affect cache hits." Two requests with materially different instructions can return the same cached answer, and neither their caching docs nor their pricing page mentions the words "risk," "accuracy," "false positive," or "collision."

**OpenRouter** — Their provider-routing docs: `allow_fallbacks` defaults to true, requests are "load balanced across the top providers" — for a model you *pinned by name*, not the opt-in Auto Router. No per-response disclosure of which backend answered. (Fair caveat: their Auto Router itself is opt-in and honestly marketed as model arbitrage — don't conflate the two features when this comes up.)

**Vantage & CloudZero** — Anthropic's own docs state the usage endpoint excludes code-execution usage and the cost endpoint excludes Priority Tier. Both vendors sell a dashboard over that same Admin API and neither's marketing page states it closes those two named gaps.

---

## 3. WHERE WE LOSE, SAID PLAINLY

- **Buyer wants "good enough and cheap now," not proof.** Not Diamond wins — 1.5M human preference rankings, a published 51% self-cost-cut case study, AWS Marketplace, live paying customers. We have zero customers and a synthetic sample audit. Don't fight this on evidence; we lose that fight today.
- **Buyer's traffic is Claude Code, not raw API.** Nobody wins the caching pitch, including us — Claude Code already sits near 100% cache-hit rate (our own README says so). Walk away rather than force a number that reads as $0.00.
- **Buyer wants git-context cost attribution (by dev/repo/branch/ticket).** Lineman wins outright — we don't have this feature at all.
- **Buyer wants a full ops gateway (routing + failover + caching + guardrails) as one piece of infrastructure.** LiteLLM, OpenRouter, or Bifrost win — free/OSS, in the request path, production-scale, and (LiteLLM, OpenRouter, Cloudflare specifically) not dishonest about what they do.
- **Buyer just wants to see the bill.** Anthropic's own free Console/Admin API wins on price against everyone, including us, for anyone who doesn't need the register.
- **Buyer wants multi-cloud FinOps with revenue tie-in.** CloudZero/Vantage/Finout win on breadth — we're LLM-only, single-vendor.

---

## 4. THE HONEST-COMPETITOR VERDICT

**Verified: no one else in this sweep publishes a register of rejected techniques, an unresolved bucket, or dated errata.** Checked directly: Anthropic's own docs (ground truth for the whole category) confirm zero register or errata section. Lineman's benchmark page comes closest — an unfiltered 9-task run where they made things worse, plus "solution quality was not evaluated on this run" — but it's one disclosed benchmark, not a standing register of rejected levers. LiteLLM, Cloudflare, Helicone, and Finout are each honestly scoped or restrained in what they claim, but none of them adjudicate and publish a pass/fail register either.

That gap — verified-no across fourteen companies and two OSS projects — is the spine of every sales conversation: *we are the only vendor here that tells you what we checked and rejected, and the one time we were wrong (four passes expelled today when their cited sources failed checking), we said so in the open rather than quietly fixing the number.*

---

## 5. WHAT TO BUILD BECAUSE OF THEM (max 3)

1. **Per-dev/repo/branch/ticket cost attribution.** Justified by Lineman's verified feature, which we have zero equivalent of, sitting in exactly our stated market (Claude Code cost reduction).
2. **A machine-checkable "identity-verified" mark other gateways can adopt or cite.** Justified by the verifier's own note that OpenRouter or Portkey could ship a "these tokens were verified identical" feature at near-zero build cost, sitting on traffic we'll never see — getting there first turns the register into infrastructure other vendors point to, rather than a report only we read.
3. **A recurring/scheduled audit instead of one-shot CLI output.** Justified because every serious gateway competitor (Portkey, OpenRouter, LiteLLM, Bifrost, Cloudflare) sits live in the request path and Vantage/CloudZero show buyers already default to a standing dashboard, not a static report — closing that gap doesn't require reading token content, only running the existing read-only importer on a schedule.

---

**Files read for grounding:** `/Users/angus/dev/token-spread/README.md`, `/Users/angus/dev/token-spread/site/BRIEF.md` (pricing tiers: Audit $0 / Starter $499/mo / Growth $1,999/mo / Scale $5,999/mo — used for context only, not stated to any competitor).

**Note on internal contradictions in the source verification passes:** two competitors were re-verified multiple times with different conclusions — **OpenRouter** (moderate/attack-fails on one pass, serious/attack-holds on another) and **Cloudflare AI Gateway** (low/attack-holds vs. serious/attack-fails). Both are resolved above by taking the most mechanism-specific finding rather than the most recent one: OpenRouter's contradiction turned out to be two different features (opt-in Auto Router vs. default-on provider load-balancing) being conflated by the more forgiving pass; Cloudflare's is a threat-rating disagreement (reach vs. current honesty), not a factual one — both passes agree the attack doesn't hold today. Flag this if the owner wants the raw passes re-run rather than adjudicated here.
