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

---

## The A/B that needs no API key

`benchmark.ts` above spends money to compare two live billing configurations. It is
still the right tool for "does caching work on a workload we have not run yet."

For proving the mechanism on traffic that **already exists**, use these instead. They
read `~/.claude/projects`, price every real event twice against the same rate card,
and spend nothing:

```bash
bun run bench/counterfactual.ts     # the numbers, with per-model and per-project tables
./bench/two-terminals.sh            # the same thing as two live panes, side by side
```

| Arm | cache-read tokens billed as |
|---|---|
| **without** | fresh input, at full rate |
| **with** | cache reads, at 0.1× |

Arm `without` is charged **no write premium**, because a run that never caches never
makes a write. Charging it for writes it would not have made is the one thing that
would turn this number into a lie.

**Why this is stronger evidence than a live A/B, not weaker.** A live A/B generates
two responses and then has to argue they are equivalent — and it cannot fully win that
argument, because inference is not deterministic (~80 distinct completions per 1,000
identical temperature-0 calls). Here there is exactly **one** generation. The outputs
are not similar; they are the same bytes, because they are the same event. Only the
price differs.

**What it does not show.** It measures what an existing cache is already worth. It is
not evidence that a cache can be *added* to traffic that lacks one — a prospect at a
7% hit rate starts far from the `with` arm, and closing that gap is the work. The free
audit is what measures where they actually start.

### Why there is a snapshot step

`snapshot.ts` freezes the event stream to `bench/.snapshot.json` before either pane
starts. The transcript directory is live — a running Claude Code session appends to it
while you read — so two panes walking it independently land on different event counts
and their totals stop corresponding. Measured during development: 6,535 vs 6,536 on
two runs seconds apart. The snapshot carries token counts and model ids only, never
content.
