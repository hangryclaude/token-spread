# Running it on another machine

## What it does to that machine

Nothing. It reads.

Five tests in `tests/readOnly.test.ts` spawn the real CLI against a temporary transcript
tree and assert, after a full run:

- every input file is **byte-identical** — content hash, size and mtime all unchanged
- **no file was created** anywhere under the input directory
- the same input produces the **same numbers** on every run
- **no prompt text** reaches the output, even though the fixture plants a canary in one
- `--html` writes **exactly one** file, at the path you named, and the input tree is still untouched

The fingerprint hashes file contents, not just size and mtime, so a same-size edit would
fail it. That was checked by mutating a file and confirming the fingerprint moves.

The only write in the entire program is `Bun.write(htmlOut)`, and it happens only when you
pass `--html`.

## Setup

```bash
git clone https://github.com/hangryclaude/token-spread.git
cd token-spread
bun install          # the tool imports only Node builtins; these are dev deps
```

Requires `bun`. Nothing else. `src/` imports `node:crypto`, `node:fs` and `node:path` and
nothing further — there is no runtime dependency to audit, vendor or trust.

That sentence is about **imports**, and it is exact. It is not a claim that the tool runs on
Node: `src/cli.ts` uses the `Bun.file` and `Bun.write` globals at three call sites, so Bun is
required, not merely convenient. The distinction is worth stating because an adversarial review
on 2026-08-13 read the sentence as claiming Node portability and filed it as a falsehood — it
isn't one, but a sentence that can be misread into a stronger claim than it makes is worth
sharpening in a document whose whole subject is not overstating things.

## Run it

```bash
# audit this machine's Claude Code history
bun run audit

# the same, as a document you can send someone
bun run audit --html audit.html

# machine-readable
bun run audit --json

# audit an organisation from Anthropic's usage report instead of local transcripts
bun run audit --admin usage.json --html audit.html

# every flag
bun run audit --help
```

`src/cli.ts` is executable and carries a shebang, so `./src/cli.ts --help` works too.
A `bin` entry is declared for `token-spread`, though the global-link path is not
something this machine has exercised — use `bun run audit` for anything that matters.

| Flag | Default | What it does |
|---|---|---|
| `--dir <path>` | `~/.claude/projects` | where to look for transcripts |
| `--admin <files>` | — | comma-separated Admin usage-report JSON; skips transcripts entirely |
| `--html <path>` | — | write the audit document |
| `--json` | off | emit the full report object |
| `--cache-target <n>` | `max(observed, 90)` | simulated cache-hit target, integer percent |
| `--write-overhead <n>` | measured | cache-write overhead assumption, integer percent |
| `--batch-share <n>` | off | standard-tier share priced via Message Batches — opt-in, contractual 50%, never in a measured figure |
| `--only <file>` | — | restrict to one transcript file |
| `--help` | — | every flag, with examples |
| `--version` | — | the version |

**Exit codes.** `0` on a real report. `1` when there is nothing to report — an unreadable
directory, no transcripts found, or records read but none priced. `2` on an unknown flag.
A directory with no transcripts never prints `$0.00`: finding no input is not the same as
finding no spend, and the two are indistinguishable once a clean report is on screen.

## Prove it yourself before you trust it

```bash
# freeze a copy, run against it, confirm nothing moved
cp -R ~/.claude/projects /tmp/frozen
B=$(find /tmp/frozen -type f -exec shasum -a 256 {} \; | sort | shasum -a 256)
bun run src/cli.ts --dir /tmp/frozen > /dev/null
A=$(find /tmp/frozen -type f -exec shasum -a 256 {} \; | sort | shasum -a 256)
[ "$B" = "$A" ] && echo "unchanged" || echo "CHANGED"
```

Run it against `~/.claude/projects` directly and the hash *will* move — because Claude Code
is writing this session's own transcript while you look at it. That is the client, not this
tool. Freeze a copy to get a clean answer.

## Why two machines can report different totals

Both are correct; they are measuring different things.

- **Different transcripts.** The audit reads the machine it runs on. A Mac mini that has
  run fewer sessions has a smaller bill, and subagent transcripts live five levels down
  under `<project>/<session>/subagents/` — all of them are counted.
- **Transcripts grow while you look.** A session in progress is still being written.
- **The rate card is dated.** It carries the prices in force on `2026-08-08`. Sonnet 5's
  introductory rate lapses `2026-09-01`; after that the card is wrong until it is
  re-captured, and the report says so in its warnings.

What will *not* differ: the same input file always produces the same numbers. That is
asserted by a test.

## Verify the build

```bash
bun run test        # 360 tests
bunx tsc --noEmit   # no type errors
```

## Verify the site

`bun run test` covers the tool. The pages need a browser, so they have their own checker —
six properties the three sitecraft gates are structurally blind to, run across all seven
pages. Serve `site/` on port 8740 first (any static server; override with `SITE_ORIGIN`).

```bash
bun run check:page        # 8 viewports per page
bun run check:page:full   # the full 15-viewport sweep
bun run check:page:self   # run the controls — a check that cannot fail is not a check
```

The pricing calculator gets its own sweep, because its five sliders are bounded and stepped and
so the reachable surface is finite — 78,844,640 states, enumerated exactly rather than sampled.
It needs no server; it imports the model directly.

```bash
bun run sweep:pricing           # every state, ~2 min, exit 1 on any finding
bun run sweep:pricing:control   # inject faults; every assertion must fire
```

It checks the arithmetic, the two places the page divides (a NaN there prints to a buyer), and
the commercial claim the page makes about itself: "we'd tell you not to buy" must appear exactly
when the fee outruns the saving, in both directions.

Each check knows whether it applies. One that does not prints `– SKIPPED` with the reason
and is counted apart from the passes, because a suite that skips quietly ends up certifying
what it never looked at. The viewport line also names how many overlap pairs exist on that
page, so a green result cannot imply coverage it did not have.

What these found that the gates did not: seven sections of the homepage invisible without
JavaScript, no focus ring on the spend input, no way past the navigation on any page, a
2px horizontal scroll at 320px, and a link that landed on a heading held at opacity 0.

They do not cover real-device touch, a real screen reader, real-GPU performance, or anything
a human has to judge. Those gaps are gaps, and the run prints them.
