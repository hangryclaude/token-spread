# The verdict format

Every entry in the register is one JSON object. This document is the contract, and
`tests/registerSchema.test.ts` enforces it against all 226 entries on every run — a register
whose shape is only described in prose is a register whose shape can drift.

The reason this file exists: the project's one verified differentiator is that it publishes its
rejections, its unresolved, and its own errata. That is a claim about process, and a claim about
process is worth exactly as much as its falsifiability. A documented format plus a named dispute
path turns *"trust me, I publish my mistakes"* into *"here is the exact machine-checkable shape a
correction takes, and here is how you file one when you catch me."*

## Required on every entry

| field | type | meaning |
|---|---|---|
| `id` | integer, unique across both cohorts | stable handle for citation |
| `name` | string | the technique, in one line |
| `strictVerdict` | enum, below | the adjudication |
| `reasoning` | string | why, with the quote that decided it |
| `savings` | string | the size of the prize, or `UNQUANTIFIED`, or "None" |
| `provenance` | string | what class of evidence this rests on |
| `telemetrySignal` | string | what an audit could observe, or that it cannot |
| `providers` | string[] | who it applies to |

## The verdict enum

| verdict | means |
|---|---|
| `PASS_ABSOLUTE` | nothing on the wire changed |
| `PASS_METADATA` | only a field the model never reads changed |
| `PASS_SCHEDULING` | only *when* the request was sent changed |
| `PASS_REPLAY` | a stored response hash-matches a byte-identical repeat |
| `CONTRACTUAL_ONLY` | the provider asserts identity and we cannot verify it — ships opt-in, never default |
| `FAIL` | the model reads different tokens, a different model answers, or a different amount of thinking happens |
| `INSUFFICIENT_EVIDENCE` | we could not settle it, and say so rather than guessing |

A documentation sentence is **the provider's word**, however clearly it reads, and caps at
`CONTRACTUAL_ONLY`. Only a measurement or a structural argument — no output was generated, no
request was ever sent — supports `PASS_ABSOLUTE`.

## Optional fields

`verifiedAgainst` (the source re-read, with the date) · `class` · `whoActsOnIt` ·
`estimatedReach` · `trap` (the way this bites people) · `implementationNote` ·
`settlingExperiment` (what would close an unresolved entry) · `crosscheckOverride` (where an
adversarial pass overruled the first adjudication).

## `corrections` — the field that matters

```json
"corrections": [
  { "date": "2026-08-12", "kind": "withdrawn-from-passing", "note": "why, with what was checked" }
]
```

`kind` is one of `withdrawn-from-passing`, `verdict-changed`, `source-corrected`,
`superseded`. Corrections are **appended, never edited away**, and the original reasoning stays
in place above them. Twenty-six entries carry one today. The first four were ids 13, 15, 16 and
18, expelled on 2026-08-12 when their cited tools turned out to be zero-star repositories and one
could not be found at all; the pass count fell from 70 to 66 that day and the site said so. The
rest arrived on 2026-08-18, when the passing column was adversarially audited for the first time
and the pass count fell again, from 71 to 59.

A register that can only grow its pass count is advertising. The `corrections` array is how this
one proves it is not.

## Challenging a verdict

See [CONTRIBUTING.md](../../CONTRIBUTING.md). The short version: bring the source, name the
entry id, and say which of the three clauses of the bar you think was misapplied. A challenge
that lands becomes a `corrections` entry with your name on the reasoning.
