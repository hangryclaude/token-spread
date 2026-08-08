# Token Spread — Savings Report (read-only MVP)

**Status:** design, awaiting review
**Date:** 2026-08-08
**Scope:** the first, read-only slice of the token-reseller product. No gateway, no
proxying, no API writes. It reads usage that already happened and produces one
auditable claim: *here is what your traffic costs today, and here is what it would
cost under caching and difficulty-routing you are not yet using.*

This slice exists to prove the premise (the spread is real in real traffic) at zero
blast radius, before any pipe is built.

---

## 1. Purpose

Produce a **current-cost vs. projected-cost report** from sanitized usage records:

1. Recompute what the observed traffic actually cost, from real per-request token
   counts × a dated rate card. This must reconcile against the user's real bill.
2. Measure the **observed cache-hit rate** — a hard number, no assumption.
3. **Simulate** two savings levers, each under an explicit, user-set assumption:
   - **Routing:** if a routable fraction of requests ran on a cheaper model, what
     would the blended cost be?
   - **Cache headroom:** if the cache-hit rate rose to a target, what would input
     cost fall to?
4. Emit an **auditable report**: every figure traces back to the source rows and the
   stated assumptions, and the same input always yields the same report.

### What it is not (YAGNI / non-goals)

- Not a gateway. It never serves a request or issues a key.
- Never calls the Messages API, never writes to any Anthropic endpoint.
- Never reads prompt or response **content** — only token-count metadata.
- No web UI in this slice. CLI + JSON report first; a viewer can come later.
- No multi-tenant, no billing, no auth. One operator, their own data.

---

## 2. The single claim it proves

> "X% of your input is already cache-eligible but served fresh, and Y% of your
> requests look routable to a cheaper model. Together that is $Z/month of headroom
> in spend you are already making."

One hard number (current cost + observed cache rate) and two clearly-labelled
projections. If the report cannot be trusted to the cent on current cost, nothing
downstream matters — so current-cost accuracy is acceptance criterion #1.

---

## 3. Users & inputs

Primary user: an operator analysing their own or a design partner's usage, locally.

Two importers, same output type. MVP ships **A**; **B** is specced but gated behind
the same interface so it can land second without touching downstream code.

**A. Claude Code transcripts (local JSONL)** — ships first.
- Location: `~/.claude/projects/*/*.jsonl` (one record per line).
- Only `type: "assistant"` records carry usage. Fields used, per record:
  - `timestamp` (ISO 8601)
  - `message.model` → canonical model id (e.g. `claude-opus-5`)
  - `message.usage.input_tokens` (fresh/uncached input)
  - `message.usage.cache_creation_input_tokens`
  - `message.usage.cache_read_input_tokens`
  - `message.usage.output_tokens`
  - `requestId` → opaque dedup key only
- `message.content` is **never read**. The importer extracts the fields above and
  discards the rest of the line in the same pass; content never enters a
  `UsageRecord`, memory beyond the parse, or any persisted artifact.

**B. Admin API usage report** — second, same interface.
- `GET /v1/organizations/usage_report/messages` with an Admin key (`sk-ant-admin-*`).
- Content-free by construction (aggregate token counts bucketed by model/workspace,
  with uncached input / cached input / cache creation / output split).
- Read-only GET. This is the only network call the product ever makes, and only when
  the operator explicitly points the importer at it with their own admin key.
- Enterprise-only; this is why it is second, not first — the local importer needs no
  org and no key, so the premise can be proven on the operator's own machine.

---

## 4. Canonical data schema

Every importer emits `UsageRecord[]`. There is no content field, by design.

```ts
interface UsageRecord {
  ts: string;                    // ISO 8601
  source: "claude_code" | "admin_usage_report";
  model: string;                 // canonical model id, post-normalisation
  inputTokens: number;           // fresh/uncached input (>= 0)
  cacheReadTokens: number;       // served from cache (>= 0)
  cacheCreationTokens: number;   // cache writes (>= 0)
  outputTokens: number;          // >= 0
  requestId?: string;            // opaque; dedup only
}
```

Normalisation rules:
- Unknown or unmapped `model` → record is **flagged and excluded** from cost math,
  counted in a `skipped` provenance bucket. Never silently priced at $0 or guessed.
- Any negative or non-integer token field → record rejected into `malformed` bucket.
- Duplicate `requestId` (same source) → later occurrence dropped; counted in `deduped`.

---

## 5. Privacy boundaries

These are hard constraints, tested, not aspirations:

1. **Local by default.** Importer A touches only the local filesystem. The process
   makes no outbound network connection unless importer B is explicitly invoked with
   an admin key.
2. **No content, ever.** No prompt or response text is read into a `UsageRecord`,
   logged, persisted, or printed. A test asserts the importer's output objects have
   no keys beyond the schema above.
3. **Aggregates out.** The report contains per-model and per-period **totals and
   token counts** only — no request-level content, no identifiers beyond opaque
   counts. `requestId` is used in-memory for dedup and never emitted.
4. **No telemetry.** The tool phones nobody. No usage reporting, no crash upload.

---

## 6. Core calculations

All monetary math in **integer cents** (or a decimal library), never binary float.
Rates are per-MTok, dated, in one source-of-truth module.

### 6.1 Rate card (`rates.ts`)
```
claude-opus-5     in $5.00  out $25.00
claude-sonnet-5   in $3.00  out $15.00   (standard; intro $2/$10 ends 2026-08-31)
claude-haiku-4-5  in $1.00  out  $5.00
cacheReadMultiplier   = 0.10   // cache read billed at 0.1x input
cacheWriteMultiplier  = 1.25   // 5-min TTL cache write at 1.25x input
```
Rate card carries a `capturedAt` date and a note that Sonnet intro pricing lapses
2026-08-31; the report prints which rate card it used.

### 6.2 Current cost (`metrics.ts`, pure)
Per record, in cents:
```
cost = inputTokens        * inRate
     + cacheReadTokens     * inRate * cacheReadMultiplier
     + cacheCreationTokens * inRate * cacheWriteMultiplier
     + outputTokens        * outRate
```
(all rates per token = per-MTok / 1e6). Summed by model and overall. This figure is
the one that must reconcile against the real bill.

### 6.3 Observed cache-hit rate (`metrics.ts`, pure)
```
cacheHitRate = cacheReadTokens_total
             / (cacheReadTokens_total + inputTokens_total)
```
i.e. of the input that was eligible to be served from cache (fresh + read), the share
actually read from cache. `cacheCreationTokens` is the write cost and is **excluded
from the denominator**; the report states this definition inline so the number is
never ambiguous. Hard number, no assumption.

### 6.4 Routing simulation (`simulate.ts`, pure, parameterised)
Inputs: `routableFraction` (0–1, operator-set), `targetModel` (default
`claude-haiku-4-5`). The read-only analysis has no per-request difficulty label, so
routing savings is explicitly a **what-if under a stated fraction**, not a claim
about which specific requests are routable.
```
routedCost = (1 - f) * cost_on_currentModel
           +      f  * cost_on_targetModel   // same token counts, target's rates
savings    = currentCost - routedCost
```
`f = 0` ⇒ savings $0 (identity check). `f = 1` ⇒ full delta on the whole set. Output
is a small **curve** over f ∈ {0, .25, .5, .75, 1}, not a single point, so no hidden
assumption is smuggled in.

### 6.5 Cache-headroom simulation (`simulate.ts`, pure, parameterised)
Input: `targetCacheHit` (0–1, must be ≥ observed). Recompute input-side cost as if the
target share of `(inputTokens + cacheReadTokens)` were served at the cache-read rate.
Output labelled "if you raised cache-hit to T%". Never lowers below observed.

---

## 7. Architecture — small, isolated units

```
importers/claudeCode.ts   raw JSONL  → UsageRecord[]   (strips content; pure over input)
importers/adminReport.ts  API JSON   → UsageRecord[]   (ships second; same signature)
rates.ts                  dated rate card, single source of truth
metrics.ts                UsageRecord[] → { currentCost, cacheHitRate, byModel }  (pure)
simulate.ts               UsageRecord[] + assumptions → projections               (pure)
report.ts                 metrics + simulations + provenance → Report object       (pure)
cli.ts                    wiring: resolve input, run pipeline, emit JSON + human text
```

- Each unit has one purpose, a typed interface, and is pure where marked (no I/O, no
  clock, no global). `metrics`, `simulate`, `report` are fully deterministic.
- `cli.ts` is the only unit that does I/O. The clock/rate-card date is injected, not
  read ambiently, so tests are reproducible.
- Stack: TypeScript on **bun** (matches the local toolchain; single-file test runner).
  Standalone project; may sit adjacent to Headroom but shares no code in this slice.

---

## 8. Auditability

The `Report` object carries, alongside every figure:
- `rateCard.capturedAt` and the model→rate map actually used.
- `provenance`: `{ recordsSeen, priced, skipped, malformed, deduped }` with per-model
  counts — so a reader can see exactly what was and wasn't counted.
- `assumptions`: the `routableFraction` curve points and `targetCacheHit` used.
- A `humanSummary` string that states the cache-hit definition and the intro-pricing
  caveat inline.

Same input + same injected date ⇒ **byte-identical** JSON report (determinism is a
tested property).

---

## 9. Acceptance criteria

1. **Current cost is exact.** For `fixture_mixed` (known token counts), the report's
   total matches an independently hand-computed cent value, exactly.
2. **Cache-hit definition holds.** `fixture_zero` (no cache_read) ⇒ 0%;
   `fixture_allcache` (input_tokens all 0, cache_read positive) ⇒ 100%.
3. **Routing identity.** `routableFraction = 0` ⇒ savings exactly $0.00;
   `routableFraction = 1` ⇒ savings equals the hand-computed full delta.
4. **Headroom floor.** `targetCacheHit < observed` is rejected; `= observed` ⇒ $0.
5. **Content never leaks.** A test asserts every `UsageRecord` has only schema keys,
   and that the report JSON contains no substring from a planted transcript's content.
6. **Bad input is surfaced, not swallowed.** `fixture_malformed` rows land in
   `malformed`/`skipped` buckets and are excluded from cost, never miscounted.
7. **Determinism.** Running the pipeline twice on one fixture yields identical JSON.
8. **No egress in importer A.** A test runs the local importer with the network
   stubbed to throw on any connection; it must complete.

---

## 10. Validation plan — synthetic fixtures only

No real transcripts in the test suite. Fixtures are small, hand-authored JSONL /
JSON, each with a **separately hand-computed** expected result committed alongside —
so the assertion is checked against a different instrument than the code that produces
the number (never assert the cost function against itself).

| Fixture | Shape | Asserts |
|---|---|---|
| `fixture_zero` | one model, no cache | cache-hit 0%, projected = current at f=0 |
| `fixture_allcache` | input_tokens 0, cache_read > 0 | cache-hit ~100% |
| `fixture_mixed` | known split across 2 models | current cost to the cent; routing curve endpoints |
| `fixture_malformed` | missing fields, negative tokens, unknown model | correct bucketing, excluded from cost |
| `fixture_dupes` | repeated requestId | dedup count correct, no double-billing |

Expected values live in `fixtures/*.expected.json`, computed by hand / a throwaway
script, reviewed once, then frozen. CI (local `bun test`) runs the full matrix.

A final manual step, outside the test suite: run importer A over the operator's own
real transcripts and eyeball that current-cost totals are in the right order of
magnitude against a known billing period — a smoke check, not an assertion.

---

## 11. Assumptions & risks

- **Routing is a what-if, not a claim.** Without per-request difficulty labels the
  routable fraction is operator-supplied. The report presents a curve and names the
  assumption; it must never state a single routing-savings number as fact.
- **Transcript usage ≈ billed usage.** Local transcripts record what the client saw;
  edge cases (interrupted turns, retries) may diverge slightly from the invoice.
  Flagged as a smoke-check limitation, not a correctness guarantee — importer B (Admin
  API) is the authoritative source when accuracy to the cent against the bill matters.
- **Rate card rots.** Prices change; Sonnet intro pricing lapses 2026-08-31. The card
  is dated and printed in every report so a stale run is self-evident.
- **Cache-hit denominator is a definitional choice.** Documented inline so the number
  is never argued about.

---

## 12. Out of scope for this slice (explicit)

Gateway, request proxying, key issuance, unattended writes, flat-rate billing logic,
multi-tenant, web UI, non-Anthropic models. Each is a later slice with its own spec.
This one earns the right to build those by proving the spread is real, on real data,
with nothing at risk.
