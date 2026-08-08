# token-spread — architecture

Slice 1: read-only savings report. Reads local Claude Code transcripts, recomputes
what they cost, measures the real cache-hit rate, and simulates two savings levers.
No storage, no network egress beyond the (unbuilt) admin importer, no prompt content.
Source: `docs/specs/2026-08-08-savings-report-design.md`.

---

## 1. File tree — one line per unit, pure or I/O

`pure` = no filesystem, no clock, no network, no global state — same input always
gives the same output. `I/O` = touches the filesystem, spawns a process, or reads
the system clock.

```
src/
├── types.ts                    UsageEvent interface + USAGE_EVENT_KEYS constant       [pure]
├── rates.ts                    RATE_CARD_2026_08_08 (integer µ¢/token) + cardAgeDays() [pure]
├── pricing.ts                  costOfEvent() — the one pricing fn; microCentsToCents,
│                                formatCents                                            [pure]
├── metrics.ts                  computeMetrics(): UsageEvent[] → totals/byModel/
│                                byProject/cacheHitRate; measuredCacheWriteOverheadPct() [pure]
├── simulate.ts                 simulate(): routing curve, cache headroom, and the
│                                cache/routing/combined savings attribution            [pure]
├── report.ts                   buildReport(): assembles the Report object, warnings,
│                                humanSummary                                          [pure]
├── cli.ts                      wiring only: walks ~/.claude/projects, reads each
│                                .jsonl, runs the pipeline, prints JSON or text        [I/O — fs reads, Bun.file, console, process.exit]
└── importers/
    └── claudeCode.ts           importClaudeCodeJsonl(): JSONL lines → UsageEvent[],
                                 strips everything but the metered fields              [pure — takes Iterable<string>, does not open files itself]

tests/
├── pricing.test.ts             costOfEvent unit tests — hand-computed expectations    [pure]
├── rates.test.ts               rate-card shape: non-negative, divides exactly (§6.1)  [pure]
├── simulate.test.ts            routing/cache curves, the compounding-not-additive
│                                assertion (combined < cacheOnly + routingOnly)        [pure — builds Metrics fixtures in code]
├── importer.test.ts            assistant-only filtering, dedup, synthesized-key
│                                provenance, content-leak assertions                   [I/O — reads fixtures/*.jsonl]
├── metrics.test.ts             current cost to the cent, byModel/byProject splits     [I/O — reads fixtures/*.jsonl]
├── report.test.ts              humanSummary content, measured-vs-operator_set tags    [I/O — reads fixtures/*.jsonl]
├── acceptance.test.ts          cross-cutting spec acceptance criteria (integer
│                                pricing path, no-egress importer)                     [I/O — reads fixtures/*.jsonl, stubs network]
└── cli.test.ts                 spawns `bun run src/cli.ts` as a subprocess, checks
                                 stdout/exit code                                      [I/O — Bun.spawn]
```

`fixtures/*.jsonl` (`mixed`, `malformed`, `dupes`, `nokey`) are the synthetic,
hand-computed inputs §10 of the spec requires — no real transcripts in the suite.

---

## 2. Data path — JSONL to CLI output

Every arrow is labelled with the type that crosses it.

```mermaid
flowchart LR
  L(["JSONL lines<br/>~/.claude/projects/*/*.jsonl<br/>type: assistant records only"])
  RC["RATE_CARD_2026_08_08<br/>rates.ts"]

  L -->|"Iterable&lt;string&gt;"| IMP["importClaudeCodeJsonl()<br/>importers/claudeCode.ts"]
  IMP -->|"ImportResult<br/>{ events: UsageEvent[], provenance: ImportProvenance }"| MET

  RC -.->|"RateCard"| PR["costOfEvent()<br/>pricing.ts"]
  PR -.->|"PriceResult: { ok:true, microCents } or { ok:false, reason }"| MET

  MET["computeMetrics()<br/>metrics.ts<br/>(calls costOfEvent per UsageEvent)"] -->|"Metrics<br/>{ overall, byModel, byProject, cacheHitRate, skipped, unknownModels }"| SIM
  RC -.->|"RateCard"| SIM

  SIM["simulate()<br/>simulate.ts"] -->|"Simulation<br/>{ baselineMicroCents, routingCurve, cacheHeadroom, attribution }"| REP
  MET -->|"Metrics"| REP
  RC -.->|"RateCard"| REP

  REP["buildReport()<br/>report.ts"] -->|"Report<br/>{ currentCost, cacheHitRate, savings, routingCurve,<br/>assumptions, provenance, warnings, humanSummary }"| CLI

  CLI["cli.ts"] -->|"JSON.stringify(report, null, 2)<br/>— or — report.humanSummary (string)"| OUT(["stdout"])

  classDef io fill:#fdecea,stroke:#8c3a2e,stroke-width:1px,color:#121917
  classDef pure fill:#eef7f1,stroke:#1b6b50,stroke-width:1px,color:#121917
  class L,OUT,CLI io
  class IMP,PR,MET,SIM,REP,RC pure
```

Solid arrows are the primary event flow; dashed arrows are the `RateCard` and
`PriceResult` side-inputs each pure stage needs. `cli.ts` is the only red (I/O) node
— every stage between the JSONL bytes and the printed string is deterministic.

---

## 3. Slice-1 / slice-2 boundary — reuse, not rebuild

`UsageEvent`, `RateCard`, and `costOfEvent()` are the three units slice 2 imports
**unchanged** (spec §7.1). Slice 2 adds four new files that wrap storage and
policy *around* them; if slice 2 ever needs to edit inside the green box, that's a
design-review signal, not a patch.

```mermaid
flowchart TB
  subgraph BOUNDARY["REUSE BOUNDARY — slice 2 imports these three unchanged"]
    direction LR
    UE["UsageEvent<br/>types.ts<br/>the event shape"]
    RC["RateCard<br/>rates.ts<br/>dated, integer µ¢ rates"]
    COE["costOfEvent()<br/>pricing.ts<br/>the one pricing fn"]
  end

  subgraph SLICE2["slice 2 — new, built around the boundary"]
    direction TB
    LED["ledger.ts<br/>immutable events"]
    BUD["budget.ts<br/>soft + hard caps"]
    RES["reserve.ts<br/>concurrency reservations"]
    REC["reconcile.ts<br/>settle actuals"]
  end

  UE -->|"UsageEvent"| LED
  RC -->|"RateCard"| LED
  COE -->|"PriceResult"| LED
  LED -->|"ledger rows"| BUD
  LED -->|"ledger rows"| RES
  LED -->|"ledger rows"| REC
  BUD -->|"remaining budget"| RES

  classDef reused fill:#eef7f1,stroke:#1b6b50,stroke-width:3px,color:#121917
  classDef added fill:#fff6e6,stroke:#a3670a,stroke-width:1px,stroke-dasharray:4 3,color:#121917
  class UE,RC,COE reused
  class LED,BUD,RES,REC added
```

The thick green box is the whole of what slice 1's "no global mutable state, no
module-level accumulator, no hardcoded `accountId`" constraint (spec §7.1) buys:
slice 2 bolts storage onto it without touching a tested line inside.

---

## 4. Where a dollar of customer spend goes

Worked example from `docs/margin-model.html` and spec §6.7: 100 MTok in, 10 MTok
out, all `claude-opus-5`, 70% cache-hit, 40% routed to `claude-haiku-4-5`. Cache
reads bill at 0.10× input, cache writes at 1.25×; Haiku input/output is 1/5 of
Opus. `savings.cacheOnly` and `savings.routingOnly` are the spec's non-compounding
per-lever figures — shown to make the compounding rule visible, not to be summed.

```mermaid
flowchart TD
  BILL["$750.00 — total spend at list rates<br/>100 MTok in · 10 MTok out · all Opus 5"]

  BILL --> SERVE["$317.05 — cost to serve<br/>42.3% of the bill<br/>what's left after both levers"]
  BILL --> GAP

  CACHE{{"Lever · cache<br/>70% observed hit rate<br/>reads @ 0.10× input, writes @ 1.25×"}}
  ROUTE{{"Lever · routing<br/>40% of traffic → Haiku<br/>input/output @ 1/5 the Opus rate"}}

  CACHE -.->|"savings.cacheOnly = $283.75"| GAP
  ROUTE -.->|"savings.routingOnly = $240.00"| GAP

  GAP["$432.95 — savings.combined<br/>57.7% of the bill<br/>levers compound: NOT $283.75 + $240.00 = $523.75"]

  GAP --> MARGIN["$282.95 — your margin<br/>37.7% of the bill<br/>= $600.00 invoiced − $317.05 cost to serve"]
  GAP --> SAVE["$150.00 — customer saving<br/>20.0% of the bill<br/>= $750.00 list − $600.00 invoiced"]

  classDef money fill:#eef7f1,stroke:#1b6b50,stroke-width:1px,color:#121917
  classDef lever fill:#fff6e6,stroke:#a3670a,stroke-width:1px,color:#121917
  classDef gap fill:#fdecea,stroke:#8c3a2e,stroke-width:2px,color:#121917
  class BILL,SERVE,MARGIN,SAVE money
  class CACHE,ROUTE lever
  class GAP gap
```

Check: $317.05 + $432.95 = $750.00. $282.95 + $150.00 = $432.95. The two levers
don't just discount the bill — they shrink real upstream cost, and the resulting
gap is what gets split between the operator's margin and the customer's saving.
