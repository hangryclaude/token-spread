# tests/

**63 tests across 8 files.** One suite per source module, plus a fixture-level acceptance
gate. Run with bun's built-in runner:

```bash
bun test                          # everything
bun test tests/pricing.test.ts    # one file
bun test tests/acceptance.test.ts -t "compound"   # one test
```

| File | Tests | Covers |
|---|---:|---|
| `pricing.test.ts` | 8 | `costOfEvent` to exact hand-computed µ¢, unknown-model → not priced, integer-only intermediates |
| `rates.test.ts` | 6 | rate-divisibility guard (a future rate that doesn't divide fails loudly), staleness boundary |
| `importer.test.ts` | 10 | parsing, the four provenance buckets, and the **content-never-leaks** shape assertion |
| `metrics.test.ts` | 9 | current cost by model/project, cache-hit rate at 0 / 1 / a known mix |
| `simulate.test.ts` | 13 | routing curve endpoints, cache headroom, and the **compounding** guard (`combined < cacheOnly + routingOnly`) |
| `report.test.ts` | 11 | determinism (identical JSON on identical input), measured-vs-assumed tags, no additive total |
| `cli.test.ts` | 3 | end-to-end over a fixture, no-egress (network stubbed to throw) |
| `acceptance.test.ts` | 3 | the spec's acceptance criteria asserted at the report level |

## The discipline

Expected values are **hand-computed from the rate card**, shown in a comment beside each
assertion — so a test never grades the cost function against itself. The same rule the
project follows everywhere: verify with a different instrument than the one that produced
the number. Fixtures live in [`../fixtures`](../fixtures).
