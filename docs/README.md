# docs/

| Path | What it is |
|---|---|
| [`specs/2026-08-08-savings-report-design.md`](specs/2026-08-08-savings-report-design.md) | The design spec — authoritative description of slice 1 (ledger-shaped). Start here. |
| [`specs/2026-08-08-savings-report-design.html`](specs/2026-08-08-savings-report-design.html) | A rendered, readable copy of the same spec. |
| [`plans/2026-08-08-savings-report-slice-1.md`](plans/2026-08-08-savings-report-slice-1.md) | The as-built implementation plan, task by task. |
| [`architecture.md`](architecture.md) | Module boundaries and the slice-2 contract notes. |
| [`margin-model.html`](margin-model.html) | The worked margin example — verified against the code (see below). |
| [`img/`](img/) | Charts used by the top-level README (PNG + editable SVG source). |

## Verified figures

The worked example that appears in `margin-model.html` and the top-level README was
recomputed from the shipped code (`src/simulate.ts` via `simulate()`), not copied from a
draft:

| Figure | Value |
|---|---|
| Baseline (100 MTok in / 10 MTok out, all Opus, no optimization) | `$750.00` |
| Cache alone (70% hit) | −`$283.75` |
| Routing alone (40% → Haiku) | −`$240.00` |
| Naive sum — **never reported** | *`$523.75`* |
| **Combined (compounded)** | **−`$432.95`** · 57.7% |
| Net cost | `$317.05` |
| Gross margin on a `$600` invoice | `$282.95` · 47.2% of revenue |

The last two rows are a different quantity from the rows above them — margin on a resale
invoice, not a savings figure. They are correct; `600.00 − 317.05 = 282.95`.

## A caveat that outranks all of these numbers

This worked example measures savings against a **no-caching baseline**. That is not most
real clients' starting point — Claude Code, for instance, already places `cache_control`
breakpoints and achieves a ~100% cache-hit rate in practice, so a Claude Code user's real
headroom from the caching lever is approximately **zero**.

Read these figures as *the mechanism's ceiling*, never as a customer's expected saving.
Measure the customer's actual hit rate first (`bun run src/cli.ts`, which spends nothing),
and quote them the gap — not the headline.

## Doc debt

- `plans/CONTRACT.md` was **deleted** (2026-08-09). It was an early locked interface written
  before implementation; the built code diverged from it and improved on it, leaving only
  2 of its 13 symbols accurate. The code plus the as-built plan are the source of truth.
