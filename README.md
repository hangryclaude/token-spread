<div align="center">

<img src="docs/img/banner.png" alt="token-spread — the same request, the same model, a smaller bill" width="820">

<br>

**Make the tokens you already pay for go further — and keep the difference.**

Not by minting tokens. Not by reselling a subscription's quota (banned, and repriced to
zero margin). By serving the **same request to the same model** more cheaply than the
customer can buy it direct. That gap is the business — and it survives scrutiny only
because nothing about the request changes.

`168 tests` &nbsp;·&nbsp; `0 bytes written` &nbsp;·&nbsp; `0 prompts read` &nbsp;·&nbsp; `no runtime dependencies` &nbsp;·&nbsp; `bun + TypeScript`

</div>

---

## The bar

<img src="docs/media/cards/bar.jpg" alt="The bar: does the model read a different sequence of tokens, does a different model answer, or does a different amount of thinking happen?" width="820">

One question decides whether a saving is real:

> Does the model read a different sequence of tokens, does a different model answer, or
> does a different amount of thinking happen?

If the answer is yes it is not a saving — it is a changed product sold as one. That rules
out the largest number anyone can put on a slide. What is left is smaller, and true:

| Lever | Evidence | What actually changes |
|---|---|---|
| Cache-hit headroom | `PASS_METADATA` | which rate a token bills at |
| Cache-write TTL right-sizing | `PASS_METADATA` | how long a prefix is stored |
| Compaction accounting | `PASS_ABSOLUTE` | nothing — it corrects a mis-read bill |
| Batch tier | `CONTRACTUAL_ONLY` | when the work runs. Off by default |

176 candidate techniques were adjudicated against that question — **66 pass**, **24 pass on
the provider's word alone**, **50 rejected**, **36 unresolved**. Those four add to 176; a
register that quietly drops a category is doing the thing it exists to prevent. The working is in
[`docs/research/2026-08-10-strict-identity-register.md`](docs/research/2026-08-10-strict-identity-register.md).

<div align="center">

<img src="docs/media/register.gif" alt="The question, then 176 candidates sorting into 66 that pass the bar, 24 that pass on the provider's word alone, 50 rejected and 36 unresolved" width="820">

<sub>Rendered by <a href="docs/media/render.mjs"><code>docs/media/render.mjs</code></a> — the four
counts are read from the verdict file at render time, never typed into the film.</sub>

</div>

---

## The deliverable

`--html` writes a standalone document: no remote stylesheet, no webfont, no script. It
opens offline, from an attachment, on a machine that has never heard of this tool.

<div align="center">
<img src="docs/img/audit-document.png" alt="The audit document: measured spend, cache-hit rate, recoverable amount, and per-lever findings carrying evidence classes" width="700">
</div>

Every figure sits beside the events and the dated rate card that produced it. Anything that
**cannot** be measured says so rather than being dropped — on an aggregate usage report the
1-hour cache-write volume appears as *exposure*, never as a saving, because the gap between
consecutive turns that would decide it is not in that data.

---

## Two ways in

```bash
git clone https://github.com/hangryclaude/token-spread.git
cd token-spread && bun install
```

**A machine running Claude Code** — reads `~/.claude/projects` at every depth, including the
subagent transcripts five levels down that hold most of an agent-heavy bill:

```bash
bun run audit --html audit.html
```

**An organisation running the API** — reads Anthropic's own usage report. The customer
produces the file with one curl on their own machine; no admin key is read here, and nothing
is sent anywhere:

```bash
curl https://api.anthropic.com/v1/organizations/usage_report/messages \
  -H "anthropic-version: 2023-06-01" -H "x-api-key: $ANTHROPIC_ADMIN_KEY" \
  -G --data-urlencode "starting_at=2026-07-01T00:00:00Z" \
     --data-urlencode "bucket_width=1d" \
     --data-urlencode "group_by[]=model" \
     --data-urlencode "group_by[]=workspace_id" \
     --data-urlencode "group_by[]=service_tier" > usage.json

bun run audit --admin usage.json --html audit.html
```

`bun run audit --help` lists every flag. An unknown flag is refused rather than
ignored, and a directory with no transcripts exits non-zero rather than reporting a
confident `$0.00` — finding no input is not the same as finding no spend.

Every flag, and how to prove the read-only property yourself, is in
[`RUNNING.md`](RUNNING.md).

---

## It only reads

<img src="docs/media/cards/reads.jpg" alt="What it reads: token counts, model names, workspaces and tiers, timestamps. What it never reads: prompt text, completions, message.content, anything over the network." width="820">

Not a claim — a property the suite defends. Five tests in
[`tests/readOnly.test.ts`](tests/readOnly.test.ts) spawn the real CLI against a temporary
transcript tree and assert that after a full run every input file is **byte-identical**
(content hash, size and mtime), **no file was created**, the same input gives the **same
numbers**, **no prompt text** reaches output though the fixture plants a canary, and
`--html` writes **exactly one** file at the path you named.

The fingerprint hashes contents, not just size and mtime — verified by mutating a same-size
file and confirming it moves. The only write in the program is `Bun.write(htmlOut)`.

---

## How it works

Usage that already happened flows left → right into one auditable report. Everything
between the importer and the CLI is **pure**: no I/O, no network, no clock — so the same
input always yields the same report, and prompt content is dropped at the very first step.

```mermaid
flowchart TD
    subgraph input["input · read-only"]
        T["~/.claude transcripts<br/>every depth, incl. subagents"]
        A["Admin usage report<br/>counts and dimensions"]
    end
    subgraph pure["pure core · no I/O · no network · deterministic"]
        direction TB
        E["UsageEvent<br/>16 metadata keys · zero content"]
        RC["rates.ts<br/>dated card · lapse dates<br/>integer micro-cents"]
        P["pricing.ts<br/>costOfEvent()"]
        M["metrics.ts<br/>current cost · cache-hit rate"]
        S["simulate.ts<br/>cache headroom<br/>compounding savings"]
        D["detect/<br/>TTL right-sizing"]
        R["report.ts<br/>buildReport()<br/>measured vs assumed"]
    end
    subgraph io["I/O boundary"]
        C["cli.ts<br/>JSON + human report"]
        H["render/auditHtml.ts<br/>standalone document"]
    end
    T -->|"strips content"| E
    A -->|"strips nothing — there is none"| E
    E --> P
    RC --> P
    P --> M
    P --> S
    E --> D
    M --> R
    S --> R
    D --> R
    R --> C
    R --> H
```

**Read it as:** transcripts → the importer strips everything but token counts → every event
is priced once by `costOfEvent` (the one function the report and a future invoice must
agree on) → `metrics` and `simulate` fan out from that price → `report` folds them into a
deterministic, self-auditing object → `cli` prints it.

---

## What slice 1 reports

> *Here's what your traffic costs today, and what it would cost under caching you're
> not yet using — with the model, the prompt and the answer all unchanged.*

| Figure | What it is |
|---|---|
| **Current cost** | Real token counts × a dated rate card, to the cent. Reconciles against your bill. |
| **Cache-hit rate** | A hard number from your `cache_read` vs `input` tokens — measured, not assumed. |
| **Cache headroom** | What input cost falls to if you raise the hit rate to a target. |
| **Compounding savings** | Levers multiply, never add. Waste elimination reports `UNQUANTIFIED` until a detector measures it — never `$0`, which would read as "we looked and found none". |

### What is deliberately absent

**Model routing.** Sending cheaper traffic to a smaller model is the largest number
anyone can put on a slide, and this tool will not print it. A different model writes
different words, so the saving is paid for in output the customer did not agree to
change. It was removed from `simulate.ts` on 2026-08-11 for exactly that reason; two
tests now fail if it returns. If your workload *can* tolerate a different model, that is
the first lever to pull — it is simply not this product's lever.

## What you net

Straight answer: **this slice nets you nothing on its own — it's the meter, not the tap.**
It doesn't create tokens or move anyone's quota. What it does is put a hard number on the
spend you can recover from caching alone, with the answer unchanged.

Worked example — **100 MTok in / 10 MTok out, all Opus 5, nothing cached.** Regenerate it
with `bun run bench/margin-model.ts`; the figure below is drawn by that same script, so it
cannot drift from the model the way the previous hand-drawn one did.

| Scenario | Cost / month | Recovered |
|---|---:|---:|
| Baseline — nothing cached | **$750.00** | — |
| Cache hit raised to 90% | **$376.25** | **−$373.75 · 49.8%** |

Half the bill, same model, same prompt, same output. That is the whole claim.

<p align="center">
  <img src="docs/img/savings-waterfall.png" width="760" alt="Waterfall: $750 uncached baseline, minus $373.75 from raising cache hit to 90%, leaving $376.25 net — 49.8% off"><br>
  <em>Generated by <code>bench/margin-model.ts</code> from the real pricing path.</em>
</p>

**On already-cached traffic this number is zero, and the report says so.** Run against a
Claude Code history sitting at a 100% hit rate and it reports $0.00 saved — because there
is nothing left to take. A tool that always finds a saving is not measuring anything.

> ### ⚠️ Read this before quoting the number above
>
> That table measures savings against a **no-caching baseline** — which is *not* where most
> real clients start. Claude Code already places `cache_control` breakpoints and reaches a
> **~100% cache-hit rate** in practice (measured across 84,294 real assistant records), so a
> Claude Code shop's headroom from the caching lever is approximately **zero**.
>
> Treat `$432.95` as **the mechanism's ceiling**, never as a customer's expected saving. The
> honest pitch measures the customer's *actual* hit rate first and quotes them the gap.
> The teams with real headroom are the ones **hand-rolling agents on the raw API**, where no
> client library places breakpoints for them — see [ProjectDiscovery's documented 7% → 84%
> case](https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching) (−59% to
> −70% cost, caused by working memory sitting inside the system prompt).

Two honesty notes, baked into the tool:

- **Cache savings are measured** from your real `cache_read` data — no assumed hit rate,
  no assumed traffic mix. Where a lever has no signal in the data, it reports
  `UNQUANTIFIED` rather than a flattering zero.
- Slice 1 **proves the money is there**. *Capturing* it is the gateway (slice 3).

Your real figure is whatever `bun run src/cli.ts --dir ~/.claude/projects` prints for *your*
traffic. The example is the shape, not your bill.

## Quick start

```bash
bun install                              # no runtime deps
bun run test        # 168 tests
bun run typecheck   # no type errors
bun run src/cli.ts --dir ~/.claude/projects
```

## Privacy — tested, not promised

- **Local only.** Reads the filesystem, nothing else. A source-level test forbids `fetch` and URLs.
- **No content, ever.** `message.content` is never read into an event, logged, or printed — a test asserts every event carries only its metadata keys and nothing else.
- **No telemetry.** Phones nobody.

## What it refuses to do

A tool that always finds a saving is not measuring anything.

| Refusal | Why |
|---|---|
| Won't route to a cheaper model | a different model writes different words |
| Won't price an unknown model | excluded and counted, never guessed |
| Won't price `flex` / `priority` tiers | no published multiplier exists; refused as `unknown_tier` |
| Won't claim waste it cannot see | reports `UNQUANTIFIED`, not a flattering `$0` |
| Won't size TTL from aggregates | exposure without the timing that would make it a saving |
| Won't sum levers | multipliers compound by product; a sum overstates |

## Verified vs. assumed

<img src="docs/media/cards/gate.jpg" alt="A gate is not finished until something has failed it. Every check ships with the control that proves it can fail." width="820">

| Claim | Status |
|---|---|
| Pricing exact (integer micro-cents, no float) | ✅ hand-verified |
| Content never leaks into the report | ✅ verified |
| Unknown models excluded, never guessed | ✅ verified |
| Savings compound, not additive | ✅ verified |
| Waste elimination | ⚠️ `UNQUANTIFIED` — needs retry/duplicate/zombie signals the slice-1 importer does not carry |
| Model routing | ❌ removed 2026-08-11 — a different model answering is a changed result, not a saving |

## Repo layout

```text
src/
  rates.ts               dated rate card · lapse dates · integer micro-cents
  pricing.ts             costOfEvent() — the one price everything agrees on
  metrics.ts             current cost · observed cache-hit rate
  simulate.ts            cache headroom · compounding attribution
  evidence.ts            the tier boundary, as a type
  detect/
    ttlRightSizing.ts    1h writes re-read inside 5 minutes
  report.ts              buildReport() — deterministic, self-auditing
  render/
    auditHtml.ts         the standalone audit document
  walk.ts                transcript discovery, every depth
  cli.ts                 the only I/O boundary
  importers/
    claudeCode.ts        JSONL → UsageEvent[], strips content at the door
    adminUsageReport.ts  org usage report → UsageEvent[]
tests/                   one suite per module + acceptance and read-only gates
fixtures/                synthetic transcripts + hand-computed expected values
bench/optical/           does text-as-an-image buy context? (it does not)
docs/research/           the registers
docs/specs/              the design spec (+ a rendered HTML copy)
```

## Research

<img src="docs/media/cards/register.jpg" alt="176 techniques adjudicated: 66 pass the bar, 24 pass on the provider's word alone, 50 rejected outright, 36 unresolved and stated as unresolved." width="820">

| Document | |
|---|---|
| [Strict identity register](docs/research/2026-08-10-strict-identity-register.md) | 176 techniques adjudicated, 66 pass, six dated errata |
| [Context survival register](docs/research/2026-08-11-context-survival-register.md) | the behaviour-affecting tier, measured and kept separate |
| [Optical compression bench](bench/optical/README.md) | 2.07× at 93.9% blind recall, against 20–100× from delegation |

The explainer cards above are composed by [`docs/media/cards.mjs`](docs/media/cards.mjs): the
backdrops are generated with fal ([`docs/media/fal.mjs`](docs/media/fal.mjs), prompts and seeds
recorded in `docs/media/art/provenance.json`), and every word and figure on top is real HTML.
The split is deliberate — a diffusion model cannot be trusted with a number, and the counts are
read out of the register at compose time rather than typed, so a card cannot drift from the data
the way three hand-maintained copies of the same tally already did.

## Roadmap

1. **Savings Report** (read-only) — ✅ this slice. Prove the spread is real, at zero risk.
2. **Metering ledger** — turn `UsageEvent` into a spend ledger with budgets and reservations. The data model was shaped for it.
3. **Gateway** — the metered endpoint that serves requests and captures the spread. Only after 1–2 earn it.

## Scope, stated plainly

**Permanently out of scope, not deferred:** subscription-account pooling or transfer. It's
banned under the terms and has no margin. The margin here comes entirely from caching on
**your own API key** — narrower than a routing pitch, and the only version of it that
leaves the customer's output untouched.

Full design: [`docs/specs/2026-08-08-savings-report-design.md`](docs/specs/2026-08-08-savings-report-design.md)
