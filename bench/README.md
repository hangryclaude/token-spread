# bench/ — Phase 0: does caching actually cut the bill?

Run this **before** building any gateway. It answers one question with real API calls
instead of a spreadsheet: *on a multi-turn agentic session, how much does prompt caching
actually save?*

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bun install
bun run bench/benchmark.ts          # prints the cost estimate, spends nothing
bun run bench/benchmark.ts --yes    # actually runs it
```

Runs on any machine. Nothing to configure but the key.

## What it does

Two arms against the live Anthropic API:

| Arm | Model | Messages | `cache_control` |
|---|---|---|---|
| **A — baseline** | `claude-opus-5` | the session | ✗ none |
| **B — cached** | `claude-opus-5` | **byte-identical** | ✓ breakpoints |

Same model, same tokens. The only variable is whether breakpoints are attached.

## Why there's no quality grader

Because there's no quality question. `cache_control` changes **billing and latency only** —
it never changes what the model reads. Both arms send an identical model identical content,
so there is nothing to grade, and the whole class of "did the cheap model do as well" bugs
cannot occur. That is the point of an identity-preserving lever.

It still reports how many replies came back byte-identical, with the honest caveat: **that
number is not expected to be 100%**, because LLM inference isn't deterministic. A differing
reply here reflects ordinary sampling variance, not a quality change. True byte-identity is
guaranteed only by an exact-match response cache (returning stored bytes), which this run
does not exercise.

## It fails loudly

If arm B records **zero cache-read tokens**, the run **exits non-zero**. A benchmark that
quietly reports "0% saved" as a success is worse than no benchmark — the usual causes are a
stable prefix below the model's minimum cacheable size (512 tokens on Opus 5) or a prefix
that changed between turns.

## Cost

`BENCH_TURNS` (default 8) turns per arm = 16 paid calls, capped at 400 output tokens each.
Typically well under a dollar. The estimate prints first and **nothing is spent without
`--yes`**.

## Reading the result

Written to `bench/result.json` and printed:

- `savedPct` — the headline: what caching actually saved on this workload
- `observedHitRate` — cache reads ÷ (reads + fresh input)
- per-arm token totals — fresh input, cache read, cache write, output

**Interpreting it honestly:** this measures caching against a *no-caching* baseline. If your
client already caches (Claude Code does, and does it well), your real headroom is the gap
between your current hit rate and this one — not the full number. Measure your own rate
first; `src/cli.ts` does that from local transcripts without spending anything.

## Notes

- Costs come from `src/pricing.ts`'s `costOfEvent`, imported — never reimplemented — so the
  benchmark can't disagree with the product's own pricing math.
- Nothing the model generates is ever executed.
