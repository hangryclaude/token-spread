# Contributing

The most valuable thing you can send is **proof that a verdict is wrong.**

## Challenging a verdict

Open an issue titled `challenge: <id> <name>` and give three things:

1. **The entry id.** Every entry in
   [`docs/research/2026-08-10-verdicts-final.json`](docs/research/2026-08-10-verdicts-final.json)
   and [`2026-08-12-addendum.json`](docs/research/2026-08-12-addendum.json) has a stable `id`.
2. **Which clause of the bar you think was misapplied.** The bar is one question with three
   clauses: *does the model read a different sequence of tokens, does a different model answer,
   or does a different amount of thinking happen?* Say which one, and why.
3. **The source, quoted.** The sentence you are relying on, and the URL, and the date you read
   it. Not a summary of it — the sentence.

A challenge that lands becomes a `corrections` entry on that verdict, dated, with your reasoning
attributed. See [the schema](docs/research/SCHEMA.md) for the exact shape. Four such corrections
already exist: ids 13, 15, 16 and 18 were expelled from the passing column on 2026-08-12 when
their cited tools turned out to be zero-star repositories and one could not be found at all. The
published pass count fell from 70 to 66 that day.

**This is the point of the project.** A register that can only grow its pass count is
advertising. If you can make the number go down, you have done the most useful possible thing.

## Proposing a new technique

Same shape, titled `technique: <name>`. Bring the mechanism, the source with a quote, and your
own read on which verdict class it lands in. Expect it to be adjudicated adversarially — roughly
over a third of what seventeen research sweeps proposed died on verification, most often because a
cited tool could not be found or a quote was inflated into a stronger claim than the source made.

Techniques that **change** what the model reads are welcome and are not second-class: they go in
the changes-results tier, honestly labelled. "Better and cheaper" is a good trade. It is just not
the trade this register certifies, and claiming better *and* unchanged is the one combination
that is always false.

## Code

```bash
bun install && bun test        # 186 tests
node site/tools/page-checks.mjs   # needs a local server on :8740
```

House rules, all of them learned the hard way:

- **A gate is not finished until something has failed it.** Every check ships with the control
  that proves it can fail — plant the bad input, watch the gate fire, remove the plant. A green
  suite that has never gone red is not evidence.
- **Verify with a different instrument than the one that made the change.** The fixer never
  grades the fix.
- **Never state a fact the source does not carry.** Quote the sentence. `— to supply —` is
  always available and is never embarrassing.
- **Comments explain why, never what.** The interesting comment is the one about the bug that
  made the line necessary.

## What not to send

Anything requiring account sharing, quota resale, key pooling, or automating a consumer UI as an
API. These get documented as `do-not-touch` with the rule they break, and go no further.
