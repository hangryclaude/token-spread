# Token Spread — Savings Report (read-only MVP, ledger-shaped)

**Status:** design, awaiting review
**Date:** 2026-08-08 (amended same day)
**Supersedes:** the original read-only savings-report design, which is preserved
wholesale below and extended. The amendment is the *shape* of the data, not the scope
of the work.

**Scope:** the first, read-only slice of the token-spread product. No gateway, no
proxying, no API writes. It reads usage that already happened and produces one
auditable claim: *here is what your traffic costs today, and here is what it would
cost under caching and difficulty-routing you are not yet using.*

This slice exists to prove the premise (the spread is real in real traffic) at zero
blast radius, before any pipe is built.

---

## 0. What the amendment changes

The original spec built a self-contained report. Slice 2 needs a metering ledger, and
roughly two thirds of that ledger is the same code: an event, a rate card, and a cost
function. Building the report with the ledger's data model from the start means slice 2
wraps storage around tested, unchanged units rather than reimplementing them.

Four changes, no scope growth:

| # | Change | Why |
|---|---|---|
| 1 | `UsageRecord` → **`UsageEvent`**, gaining `idempotencyKey`, `accountId`, `projectId` | The ledger's primary key and attribution axes. Slice 1 fills them with constants and path-derived values; the shape is right from day one. |
| 2 | All money math in **integer micro-cents**, rounded to cents once at the boundary | A ledger that rounds per event loses real money across millions of rows. Fixing it later is a migration. |
| 3 | `costOfEvent()` extracted as **the single pure pricing function** | Slice 2 reuses it verbatim. If the report and the invoice ever disagree, the product is dead. |
| 4 | Savings **attributed per lever**, with compounding stated explicitly | The levers overlap. Reporting them as additive overstates savings by ~21% on the worked example — a claim a customer would catch. |

Explicitly **not** changed: slice 1 still persists nothing, opens no socket beyond the
optional admin importer, and reads no prompt content.

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
- No billing, no auth, no storage. One operator, their own data, in memory.
- **No account pooling, ever — in this slice or any later one.** Drawing usage off
  subscription accounts and transferring it between users is account sharing: banned
  under the terms, and repriced to near-zero margin as of 15 Jun 2026. It is out of
  scope permanently, not deferred. The margin this product sells comes from caching
  and routing on the operator's own API key, and is wider than the closed route ever
  offered. See `docs/margin-model.html`.

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
  - `requestId` → becomes `idempotencyKey` (see §4.1)
- The containing directory name under `~/.claude/projects/` becomes `projectId`.
- `message.content` is **never read**. The importer extracts the fields above and
  discards the rest of the line in the same pass; content never enters a
  `UsageEvent`, memory beyond the parse, or any persisted artifact.

**B. Admin API usage report** — second, same interface.
- `GET /v1/organizations/usage_report/messages` with an Admin key (`sk-ant-admin-*`).
- Content-free by construction (aggregate token counts bucketed by model/workspace,
  with uncached input / cached input / cache creation / output split).
- Read-only GET. This is the only network call the product ever makes, and only when
  the operator explicitly points the importer at it with their own admin key.
- Workspace → `projectId`; organization → `accountId`.
- Enterprise-only; this is why it is second, not first — the local importer needs no
  org and no key, so the premise can be proven on the operator's own machine.

---

## 4. Canonical data schema — `UsageEvent`

Every importer emits `UsageEvent[]`. There is no content field, by design. This type
is the metering layer's event record; slice 2 stores it unchanged.

```ts
interface UsageEvent {
  // identity — dedup key in slice 1, ledger primary key in slice 2
  idempotencyKey: string;

  // attribution — the axes cost is aggregated and budgeted along
  accountId: string;             // billing entity.  Slice 1: constant "local".
  projectId: string;             // cost centre.     Slice 1: transcript dir name.

  // when and what
  ts: string;                    // ISO 8601
  source: "claude_code" | "admin_usage_report";
  model: string;                 // canonical model id, post-normalisation

  // metered quantities — non-negative integers, all of them
  inputTokens: number;           // fresh/uncached input
  cacheReadTokens: number;       // served from cache
  cacheCreationTokens: number;   // cache writes
  outputTokens: number;
}
```

### 4.1 Idempotency key derivation

- **Preferred:** the source's own `requestId`, namespaced as `${source}:${requestId}`.
- **Fallback**, when a record carries no `requestId`: a SHA-256 over the canonical
  string `${source}|${ts}|${model}|${in}|${cacheRead}|${cacheCreate}|${out}`,
  truncated to 32 hex chars, prefixed `syn:`.
- Synthesized keys are counted in a **`synthesizedKeys`** provenance bucket. Two
  genuinely distinct requests with identical timestamps, model and token counts will
  collide and one will be dropped as a duplicate. This is a real, bounded weakness;
  the report states the count so the operator can judge whether it matters, rather
  than the tool pretending dedup is exact.

### 4.2 Normalisation rules

- Unknown or unmapped `model` → event is **flagged and excluded** from cost math,
  counted in a `skipped` provenance bucket. Never silently priced at $0 or guessed.
- Any negative or non-integer token field → event rejected into `malformed` bucket.
- Duplicate `idempotencyKey` → later occurrence dropped; counted in `deduped`.

---

## 5. Privacy boundaries

These are hard constraints, tested, not aspirations:

1. **Local by default.** Importer A touches only the local filesystem. The process
   makes no outbound network connection unless importer B is explicitly invoked with
   an admin key.
2. **No content, ever.** No prompt or response text is read into a `UsageEvent`,
   logged, persisted, or printed. A test asserts the importer's output objects have
   no keys beyond the schema above.
3. **Aggregates out.** The report contains per-model, per-project and per-period
   **totals and token counts** only. `idempotencyKey` is used in-memory for dedup and
   never emitted.
4. **No telemetry.** The tool phones nobody. No usage reporting, no crash upload.

---

## 6. Core calculations

### 6.1 Money representation — integer micro-cents

All monetary math is in **integer micro-cents** (µ¢ = 10⁻⁶ of a cent). No floating
point appears anywhere in the pricing path.

A rate of `$D` per MTok is exactly `D × 100` µ¢ per token — an integer for every rate
on the current card:

| Model | Input | Output | Cache read | Cache write |
|---|---|---|---|---|
| `claude-opus-5`    | 500 | 2500 | 50 | 625 |
| `claude-sonnet-5`  | 300 | 1500 | 30 | 375 |
| `claude-haiku-4-5` | 100 |  500 | 10 | 125 |

All four rates per model are **stored explicitly as integers**; the 0.10× read and
1.25× write multipliers are documentation of how they were derived, not runtime math.
A test asserts `input × 10 % 100 === 0` and `input × 125 % 100 === 0` for every model,
so a future rate that does not divide exactly fails loudly instead of rounding
silently.

Event costs sum exactly as integers. Conversion to cents happens **once**, at the
report boundary, half-up. Headroom is ample: 100 MTok of Opus output is 2.5 × 10¹¹ µ¢,
four orders of magnitude below `Number.MAX_SAFE_INTEGER`.

### 6.2 The pricing function (`pricing.ts`, pure) — reused verbatim by slice 2

```ts
type Priced   = { ok: true;  microCents: number };
type Unpriced = { ok: false; reason: "unknown_model" | "malformed" };

function costOfEvent(e: UsageEvent, card: RateCard): Priced | Unpriced;
```

```
microCents = inputTokens         * rate.input
           + cacheReadTokens     * rate.cacheRead
           + cacheCreationTokens * rate.cacheWrite
           + outputTokens        * rate.output
```

Total, never throws: an unknown model returns `ok: false` and is bucketed by the
caller. This is the one function the ledger and the invoice must agree on, so it lives
alone, has no dependencies, and is the most heavily tested unit in the project.

### 6.3 Current cost (`metrics.ts`, pure)

`costOfEvent` summed by model, by project, and overall. This figure is the one that
must reconcile against the real bill.

### 6.4 Observed cache-hit rate (`metrics.ts`, pure)

```
cacheHitRate = cacheReadTokens_total
             / (cacheReadTokens_total + inputTokens_total)
```

i.e. of the input that was eligible to be served from cache (fresh + read), the share
actually read from cache. `cacheCreationTokens` is the write cost and is **excluded
from the denominator**; the report states this definition inline so the number is
never ambiguous. Hard number, no assumption.

### 6.5 Routing simulation (`simulate.ts`, pure, parameterised)

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

### 6.6 Cache-headroom simulation (`simulate.ts`, pure, parameterised)

Input: `targetCacheHit` (0–1, must be ≥ observed). Recompute input-side cost as if the
target share of `(inputTokens + cacheReadTokens)` were served at the cache-read rate.
Output labelled "if you raised cache-hit to T%". Never lowers below observed.

### 6.7 Savings attribution — the levers compound, they do not add

Applying both levers saves **less** than the sum of applying each alone, because
routing moves tokens onto a model where the cache saving is already smaller. The
report emits three separate figures and never a sum:

```
savings.cacheOnly      baseline − (cache applied, no routing)
savings.routingOnly    baseline − (routing applied, no cache)
savings.combined       baseline − (both applied)      ← always the headline
```

On the worked example in `docs/margin-model.html` (100 MTok in / 10 MTok out, all
Opus, 70% cache hit, 40% routed to Haiku):

| Figure | Value |
|---|---|
| Baseline | $750.00 |
| `savings.cacheOnly` | $283.75 |
| `savings.routingOnly` | $240.00 |
| naive sum of the two | *$523.75 — never report this* |
| `savings.combined` | **$432.95** |

The naive sum overstates by $90.80 (21%). A test asserts
`combined < cacheOnly + routingOnly` on any fixture where both levers are active, so
the additive bug cannot regress in silently.

---

## 7. Architecture — small, isolated units

```
importers/claudeCode.ts   raw JSONL  → UsageEvent[]    (strips content; pure over input)
importers/adminReport.ts  API JSON   → UsageEvent[]    (ships second; same signature)
rates.ts                  dated rate card, integer µ¢, single source of truth
pricing.ts                costOfEvent()                 (pure) ← slice 2 reuses verbatim
metrics.ts                UsageEvent[] → { currentCost, cacheHitRate, byModel, byProject }
simulate.ts               UsageEvent[] + assumptions → projections + attribution  (pure)
report.ts                 metrics + simulations + provenance → Report object       (pure)
cli.ts                    wiring: resolve input, run pipeline, emit JSON + human text
```

- Each unit has one purpose, a typed interface, and is pure where marked (no I/O, no
  clock, no global). `pricing`, `metrics`, `simulate`, `report` are fully
  deterministic.
- `cli.ts` is the only unit that does I/O. The clock/rate-card date is injected, not
  read ambiently, so tests are reproducible.
- Stack: TypeScript on **bun** (matches the local toolchain; single-file test runner).
  Standalone project; may sit adjacent to Headroom but shares no code in this slice.

### 7.1 The slice-2 contract

Slice 2 adds `ledger.ts`, `budget.ts`, `reserve.ts`, `reconcile.ts` **around** these
units. It imports `UsageEvent`, `RateCard` and `costOfEvent` unchanged. If slice 2
finds itself needing to modify any of them, that is a signal the boundary was drawn
wrong and belongs in review, not in a patch.

Nothing in slice 1 may assume single-tenancy in a way slice 2 must undo: no global
mutable state, no module-level accumulator, no `accountId` hardcoded anywhere but the
importer's default argument.

---

## 8. Auditability

The `Report` object carries, alongside every figure:
- `rateCard.capturedAt` and the model→rate map actually used, in µ¢.
- `provenance`: `{ eventsSeen, priced, skipped, malformed, deduped, synthesizedKeys }`
  with per-model counts — so a reader can see exactly what was and wasn't counted.
- `assumptions`: the `routableFraction` curve points and `targetCacheHit` used, each
  tagged `measured` or `operator_set` (see §11.1).
- A `humanSummary` string that states the cache-hit definition, the compounding
  caveat, and the intro-pricing caveat inline.

Same input + same injected date ⇒ **byte-identical** JSON report (determinism is a
tested property).

---

## 9. Acceptance criteria

1. **Current cost is exact.** For `fixture_mixed` (known token counts), the report's
   total matches an independently hand-computed cent value, exactly.
2. **No float in the pricing path.** A test asserts every intermediate in
   `costOfEvent` is an integer, and that rates divide exactly (§6.1).
3. **Cache-hit definition holds.** `fixture_zero` (no cache_read) ⇒ 0%;
   `fixture_allcache` (input_tokens all 0, cache_read positive) ⇒ 100%.
4. **Routing identity.** `routableFraction = 0` ⇒ savings exactly $0.00;
   `routableFraction = 1` ⇒ savings equals the hand-computed full delta.
5. **Headroom floor.** `targetCacheHit < observed` is rejected; `= observed` ⇒ $0.
6. **Levers compound, not add.** On `fixture_mixed`,
   `combined < cacheOnly + routingOnly`, and the report exposes no additive total.
7. **Attribution is populated.** Every priced event has a non-empty `accountId` and
   `projectId`; `byProject` totals sum to the overall total.
8. **Content never leaks.** A test asserts every `UsageEvent` has only schema keys,
   and that the report JSON contains no substring from a planted transcript's content.
9. **Bad input is surfaced, not swallowed.** `fixture_malformed` rows land in
   `malformed`/`skipped` buckets and are excluded from cost, never miscounted.
10. **Determinism.** Running the pipeline twice on one fixture yields identical JSON.
11. **No egress in importer A.** A test runs the local importer with the network
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
| `fixture_mixed` | known split across 2 models, 2 projects | current cost to the cent; routing curve endpoints; compounding; per-project totals |
| `fixture_malformed` | missing fields, negative tokens, unknown model | correct bucketing, excluded from cost |
| `fixture_dupes` | repeated requestId | dedup count correct, no double-billing |
| `fixture_nokey` | records with no `requestId` | synthesized keys counted; collision behaviour documented |

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
  is dated and printed in every report; a card older than 30 days prints a warning.
- **Cache-hit denominator is a definitional choice.** Documented inline so the number
  is never argued about.
- **Synthesized idempotency keys can collide.** Bounded and counted (§4.1).

### 11.1 Assumption register — and how slice 1 retires each

Every figure in `docs/margin-model.html` rests on one of these. Slice 1 exists to
convert as many as possible from *assumed* to *measured*. The report tags each
accordingly, and the tag is part of the output contract.

| Assumption | Model value | Retired by slice 1? | How |
|---|---|---|---|
| Cache-hit rate | 70% | **Yes — measured** | §6.4 computes it from real `cache_read` vs `input` tokens |
| Cache-write overhead | 5% of input | **Yes — measured** | `cacheCreationTokens` are present in the source data |
| Per-model traffic mix | all Opus | **Yes — measured** | `byModel` breakdown |
| Per-project split | n/a | **Yes — measured** | `byProject` breakdown, new in this amendment |
| Routable fraction | 40% | **No — stays operator-set** | needs a per-request difficulty label; that is slice 3, and until then the report emits a curve, never a point |
| Rate card accuracy | list, 2026-08-08 | **No — manual** | dated and printed; staleness warning at 30 days |

Four of six retire on slice 1. The report must visually distinguish measured from
assumed figures; a reader who cannot tell them apart will quote the wrong one.

---

## 12. Out of scope for this slice (explicit)

Gateway, request proxying, key issuance, unattended writes, flat-rate billing logic,
Stripe activation, deployment, multi-tenant auth, web UI, non-Anthropic models,
per-request difficulty labelling. Each is a later slice with its own spec.

**Permanently out of scope, not deferred:** subscription-account pooling or transfer,
per §1.

This slice earns the right to build the rest by proving the spread is real, on real
data, with nothing at risk.
