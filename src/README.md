# src/

The pipeline. Data flows top→bottom; everything except `cli.ts` is **pure** — no I/O, no
network, no ambient clock — so reports are deterministic and prompt content never gets a
chance to leak.

| File | Responsibility |
|---|---|
| `types.ts` | `UsageEvent` and friends — the one metering event, shared by every unit (and reused unchanged by slice 2). |
| `rates.ts` | The dated rate card in **integer micro-cents**, plus card-age / staleness helpers. Single source of truth for prices. |
| `pricing.ts` | `costOfEvent()` — the one function the report and a future invoice must agree on. No dependencies, most-tested unit in the repo. |
| `metrics.ts` | Current cost (by model / project / overall) and the observed cache-hit rate. Measured, not assumed. |
| `simulate.ts` | Routing curve, cache-headroom, and savings **attribution** — `cacheOnly` / `routingOnly` / `combined`, where combined < the naive sum. |
| `report.ts` | `buildReport()` — folds metrics + simulation + provenance into a deterministic, self-auditing object; tags each figure `measured` or `operator_set`. |
| `cli.ts` | The **only** I/O boundary. Resolves a transcript directory, runs the pipeline, prints JSON + a human report. |
| `importers/claudeCode.ts` | Local `.jsonl` → `UsageEvent[]`. Strips `message.content` at the door; buckets malformed / unknown-model / duplicate / synthesized-key records. |

## Invariants every module honours

- **Money is integer micro-cents (µ¢)** end to end; rounded to cents once, at the report boundary only. No floating point in the pricing path.
- **Purity:** `pricing`, `metrics`, `simulate`, `report` take no clock and no globals — the time is injected. Only `cli` reads the real world.
- **Slice-2 contract:** no module-level mutable state, no global accumulator; `accountId` is hardcoded only as the importer's default argument, so the spend-ledger slice can wrap these units without editing them.
