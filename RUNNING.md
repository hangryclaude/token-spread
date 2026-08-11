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

## Run it

```bash
# audit this machine's Claude Code history
bun run src/cli.ts

# the same, as a document you can send someone
bun run src/cli.ts --html audit.html

# machine-readable
bun run src/cli.ts --json

# audit an organisation from Anthropic's usage report instead of local transcripts
bun run src/cli.ts --admin usage.json --html audit.html
```

| Flag | Default | What it does |
|---|---|---|
| `--dir <path>` | `~/.claude/projects` | where to look for transcripts |
| `--admin <files>` | — | comma-separated Admin usage-report JSON; skips transcripts entirely |
| `--html <path>` | — | write the audit document |
| `--json` | off | emit the full report object |
| `--cache-target <n>` | `max(observed, 90)` | simulated cache-hit target, integer percent |
| `--write-overhead <n>` | measured | cache-write overhead assumption, integer percent |
| `--only <file>` | — | restrict to one transcript file |

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
bun test            # 123 tests
bunx tsc --noEmit   # no type errors
```
