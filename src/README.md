# src/

The pipeline. Data flows top→bottom; everything except `cli.ts` is **pure** — no I/O, no
network, no ambient clock — so reports are deterministic and prompt content never gets a
chance to leak.

| File | Responsibility |
|---|---|
| `types.ts` | `UsageEvent` and friends — the one metering event, shared by every unit (and reused unchanged by slice 2). |
| `rates.ts` | The dated rate card in **integer micro-cents**, plus card-age / staleness helpers. Single source of truth for prices. |
| `pricing.ts` | `costOfEvent()` — the one function the report and a future invoice must agree on. No dependencies, most-tested unit in the repo. |
| `metrics.ts` | Current cost (by model / project / tier / overall) and the observed cache-hit rate. Measured, not assumed. Tier-split bundles (`byModelTier`) exist because batch bills at 0.5x and a merged bundle cannot be re-priced. |
| `simulate.ts` | Cache-headroom and the opt-in batch-tier regime, plus savings **attribution** — `cacheOnly` / `combined`. No routing lever exists here, ever: a different model answering is a different answer, and tests enforce the absence. |
| `report.ts` | `buildReport()` — folds metrics + simulation + detectors + provenance into a deterministic, self-auditing object; tags each figure `measured` or `operator_set`. |
| `coverage.ts` | The register-backed coverage table: what this audit models, detects, exposes, or structurally cannot see. Cross-checked against the live register by `tests/registerCoverage.test.ts`. |
| `detect/ttlRightSizing.ts` | Priced finding: 1-hour cache writes re-read inside five minutes, where the 5-minute TTL would have served. |
| `detect/ttlCrossing.ts` | Warning: sessions whose writes flip 1h→5m mid-session — the register-id-184 billing-crossing signature. Never priced. |
| `detect/spendAnomaly.ts` | Warning: days billing past 3x the trailing median over a $10 floor. Money already spent is not a saving. |
| `render/auditHtml.ts` | The deliverable — a standalone, escaped, offline-safe document. Pure: `Report` in, string out. |
| `register/` | Loader, tally, id assignment and staleness checks for the public verdict register in `docs/research/`. |
| `cli.ts` | The **only** I/O boundary. Resolves a transcript directory or admin report, runs the pipeline, prints JSON + a human report. |
| `importers/claudeCode.ts` | Local `.jsonl` → `UsageEvent[]`. Strips `message.content` at the door; buckets malformed / unknown-model / duplicate / synthesized-key records. |
| `importers/adminUsageReport.ts` | Anthropic Admin usage-report JSON → `UsageEvent[]`. Counts and dimensions only; no admin key is ever read. |

## Invariants every module honours

- **Money is integer micro-cents (µ¢)** end to end; rounded to cents once, at the report boundary only. No floating point in the pricing path.
- **Purity:** `pricing`, `metrics`, `simulate`, `report` take no clock and no globals — the time is injected. Only `cli` reads the real world.
- **Slice-2 contract:** no module-level mutable state, no global accumulator; `accountId` is hardcoded only as the importer's default argument, so the spend-ledger slice can wrap these units without editing them.
