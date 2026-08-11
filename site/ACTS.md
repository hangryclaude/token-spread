# The six acts

Derived from the brief, not chosen. Each act carries one claim, and every number in it traces to
`BRIEF.md`. Nothing here is a fact the client did not supply.

---

## Act 1 · The thesis — `kinetic-marquee` + `display-type`

The headline **is** the marquee. Position is a function of TIME, opacity a function of SCROLL.
The `h1` is visually-hidden behind it so the page still has one real heading.

> **the same request · the same model · a smaller bill ·**

Sub, held still against the moving type:

> Most ways to cut an AI bill change what the model gives back. We only ship the ones that can't.

`fixed-hud` mounts here and stays for the whole document — a six-act page needs a way back.

---

## Act 2 · The problem — `sticky-split`

Pinned left: the two `usage` blocks, healthy against broken. Scrolling right: the argument.

> **A broken cache throws no error.**
>
> It doesn't crash. It doesn't warn. `cache_read_input_tokens` quietly goes to zero and your bill
> goes up. One dynamic field in the wrong place is enough.
>
> Anthropic now ships a beta that names the cause — `cache-diagnosis-2026-04-07` returns
> `system_changed`, `tools_changed`, `messages_changed` or `model_changed`. It is opt-in,
> first-party only, and needs the previous response id threaded through every turn.
>
> **The signal exists now. Nobody is watching it.**

---

## Act 3 · The proof — the twin terminals

Carried from the current homepage, unchanged in substance. Both panes stream the identical
response at the identical rate; only the meter differs.

> **$0.2075** against **$0.0275** — 40,000 tokens of context, 300 out, Opus 5.
> **7.55×**, byte-identical. Over a thousand turns, $207.50 against $27.50.

This is the act that has to land. It is the whole argument in one screen.

---

## Act 4 · The bar — `card-grammar` as ledgers

> **176 techniques. 66 survive.**
>
> One question decides it: does the model read a different sequence of tokens, does a different
> model answer, or does a different amount of thinking happen?

Ledger row — what we refuse and why:

| refusal | why |
|---|---|
| Model routing | a different model writes different words |
| Unknown models | excluded and counted, never guessed |
| `flex` / `priority` tiers | no published multiplier exists |
| Waste we cannot see | reports `UNQUANTIFIED`, not a flattering `$0` |
| TTL sized from aggregates | exposure without the timing that makes it a saving |
| Summed levers | multipliers compound by product; a sum overstates |

---

## Act 5 · What we found — `sticky-split` again, or ledgers

The two findings that are ours, both measured:

> **100% of cache writes ran at the 1-hour TTL.** 7,454 deduped requests, 40.4M write tokens,
> zero at five minutes. 95% of them were re-read inside five minutes, where 1.25× would have
> served instead of 2×.
>
> **Compaction bills twice and reports once.** Anthropic's own worked example shows
> `usage.input_tokens: 23,000` against 207,500 actually billed — an 8.6× under-report for
> anything reading the top-level field.

---

## Act 6 · The close — the audit document + `capsule-controls`

> **A document, not a dashboard login.**

The sample audit, shown and openable. Labelled synthetic wherever it appears.

> $19,486.50 of measured spend · a 5% cache-hit rate · $10,563.68 recoverable.

Then the measurement, not the calculator: one curl on their machine, the file never leaves it.

> **Send the file, get the audit.** No call required first. If the audit finds under 20% on the
> table, we'll say so and leave.

---

## What the page must never claim

No customer names, logos, testimonials, case studies or customer metrics. None exist. The only
third-party number on the page is ProjectDiscovery's published 7% → 84%, cited and linked.
