# token-spread

Read-only usage → cost/savings report. Proves the token-spread margin on real
traffic before any gateway is built. Local-only; reads token-count metadata, never
prompt content.

## Run it

    bun test                                  # full suite, synthetic fixtures only
    bun run src/cli.ts                        # your own transcripts, human summary
    bun run src/cli.ts --json > report.json   # machine-readable

Flags: `--dir <path>` (default `~/.claude/projects`), `--json`,
`--routable 0,25,50,75,100`, `--cache-target 90`, `--write-overhead 5`.

## Reading the output

Figures tagged `measured` come from your traffic. Figures tagged `operator_set` are
assumptions — currently the routable fraction, the simulated cache-write overhead, and
the rate card's freshness. Savings levers **compound and do not add**; quote
`savings.combined`, never a sum.

Design: `docs/specs/2026-08-08-savings-report-design.md`
Margin model: `docs/margin-model.html`
Plan: `docs/plans/2026-08-08-savings-report-slice-1.md`
