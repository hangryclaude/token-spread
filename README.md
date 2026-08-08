# token-spread

Turn the tokens you're **already paying for** into a measurable margin — by making them
go further, not by reselling anyone's quota.

The honest premise, in one line: you can't create tokens or resell a Max subscription's
quota (that's banned and repriced to zero margin). But the same request served with
**prefix caching** and **difficulty routing** costs *you* less than it costs your customer
buying direct — and that spread is a real business. `token-spread` is the tooling for it.

> **Status:** slice 1 (read-only Savings Report) is built and passing — 63 tests, core
> correctness independently verified. Private repo, local-only tooling. No gateway, no
> account pooling, nothing that touches anyone's subscription.

---

## Slice 1 — the Savings Report

Reads usage that already happened and produces one auditable claim:

> *Here is what your traffic costs today, and here is what it would cost under caching and
> routing you're not yet using.*

Prove the spread is real on real traffic **before** building any pipe. Zero blast radius:
it reads token-count metadata only, never a single line of prompt content, and makes no
network calls.

### What it reports

- **Current cost** — recomputed from real per-request token counts × a dated rate card, to
  the cent. Reconciles against your actual bill.
- **Observed cache-hit rate** — a hard number from your `cache_read` vs `input` tokens.
- **Routing what-if** — a curve (0 → 100% routed to a cheaper model), never a single
  number dressed up as fact.
- **Cache-headroom what-if** — what input cost falls to if you raise the hit rate.
- **Compounding savings** — `cacheOnly`, `routingOnly`, and `combined`. The levers overlap,
  so `combined < cacheOnly + routingOnly` — the report never shows a misleading sum.

## Quick start

```bash
bun install          # no runtime deps; this just wires the dev toolchain
bun test             # 63 tests

# run the report over your local Claude Code transcripts
bun run src/cli.ts --dir ~/.claude/projects
```

## Privacy — hard constraints, tested

- **Local by default.** Reads only the filesystem. No egress in slice 1 (a source-level
  test enforces no `fetch`, no URLs).
- **No content, ever.** `message.content` is never read into an event, logged, or printed.
  A test asserts every event carries only its ten metadata keys.
- **No telemetry.** Phones nobody.

## Verified vs. assumed

| Claim | Status |
|---|---|
| Pricing exact (integer micro-cents, no float) | ✅ verified, hand-checked |
| Content never leaks into report | ✅ verified |
| Unknown models excluded, not guessed | ✅ verified |
| Savings compound, not additive | ✅ verified |
| Routable fraction | ⚠️ operator-set what-if by design (no per-request difficulty label until a later slice) |

## Design & scope

- Small pure units (`rates → pricing → metrics → simulate → report`) behind one I/O
  boundary (`cli`). All money in integer micro-cents, converted to cents once at the report
  boundary. Deterministic: pure modules take an injected clock.
- `UsageEvent` is the metering event **slice 2** (a spend ledger) reuses unchanged.
- **Permanently out of scope, not deferred:** subscription-account pooling or transfer.
  It's banned under the terms and has no margin; the margin here comes from caching and
  routing on your own API key.

Full design: [`docs/specs/2026-08-08-savings-report-design.md`](docs/specs/2026-08-08-savings-report-design.md).

## Roadmap

1. **Savings Report** (read-only) — ✅ this slice.
2. **Metering ledger** — turn the report's data model into a spend ledger with budgets and
   reservations. `UsageEvent` was shaped for it.
3. **Gateway** — the metered endpoint that serves requests and captures the spread. Only
   after 1–2 prove it's worth building.

## Repo layout

```
src/           pricing, rates, metrics, simulate, report, cli, importers/
tests/         one suite per module + a fixture-level acceptance gate
fixtures/      synthetic transcripts + hand-computed expected values
docs/specs/    the design spec (+ a rendered HTML copy)
docs/          architecture notes, worked margin model
```
