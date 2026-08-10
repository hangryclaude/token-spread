# The Context Survival Register

**Every way to make a long session cost less — and what it costs you in fidelity.**

Date: 2026-08-11 · 48 new entries · 38 levers · 9 corrections to the strict register
Revised the same day after a blind re-run overturned the headline optical result — see
"The contamination control" below.

---

## Why this is a separate document

The [strict identity register](2026-08-10-strict-identity-register.md) admits a technique only
if the model reads the same bytes. Everything in this document **fails that bar**, and fails it
on purpose:

| Technique | Why it fails strict identity |
|---|---|
| Rendering text as an image | the model reads pixels, not those tokens |
| Compaction / `/compact` | earlier turns are replaced by a summary |
| Tool-result clearing | content the model could see is removed |
| Subagent delegation | a second model reads the files; the first never does |

So they are graded on a **different bar**, stated plainly so nothing is smuggled across:

> **Task-outcome preserving** — the agent still completes the task, to the same standard,
> from a smaller context. The intermediate token sequence is admitted to be different.

That bar cannot be proven by hashing. It can only be **measured**, per technique, with probes.
Where this document claims a technique is safe, there is a number behind it and a rig that
reproduces it. Where there is no number, the entry says `UNMEASURED` and ships off by default.

**Nothing here may be sold as identity-preserving.** The 66 in the strict register can be. These
cannot. Keeping the two documents apart is the entire point.

---

## Part 1 — Optical context compression, measured

### The claim on the internet

Two 2025 papers made "put the text in an image" a real idea rather than a joke:

| Paper | Claim | Where it holds |
|---|---|---|
| [DeepSeek-OCR: Contexts Optical Compression](https://arxiv.org/abs/2510.18234) | 97% decoding precision at <10× compression; ~60% at 20× | a purpose-built DeepEncoder — 100 vision tokens per page |
| [Glyph: Scaling Context Windows via Visual-Text Compression](https://arxiv.org/abs/2510.17800) | 3–4× token compression, accuracy comparable to Qwen3-8B | a VLM fine-tuned on rendered pages |

Both are real results. **Neither is a result about Claude.** DeepSeek's ratio comes from an
encoder trained to spend 100 tokens on a page. Claude's vision encoder is priced by a fixed
geometric rule, and that rule sets the ceiling before legibility is even considered.

### What Claude actually charges

Primary source, [Vision](https://platform.claude.com/docs/en/build-with-claude/vision), verified 2026-08-11:

> "Claude views images in patches instead of pixels. Each patch is a 28×28-pixel block of the
> image, referred to as a visual token. An image, therefore, costs `⌈width / 28⌉ × ⌈height / 28⌉`
> visual tokens."

| Resolution tier | Models | Max long edge | Max visual tokens |
|---|---|---:|---:|
| High-resolution | Claude 4.7 and later | 2576 px | 4784 |
| Standard | all other models | 1568 px | 1568 |

**This formula replaces the `(w × h) / 750` rule still quoted across the internet and in most
token calculators.** For a 1000×1000 image the old rule gives 1333 tokens; the documented table
gives 1296. Close enough to look right, wrong enough to mis-price a fleet.

The high-resolution tier is where optical compression has to live: the largest page that is
**not** downscaled is **2576 × 1456 px = 92 × 52 = exactly 4784 visual tokens**.

### The rig

`bench/optical/` renders a corpus packed to fill the page by construction, with a
`PROBE-nnnn=xxxxxx` hex code embedded at a fixed interval. Recall of those probes is scored by
exact string match against ground truth. This is probe-based evaluation, not a similarity score:
a page can look perfectly transcribed and still fail every probe.

Two corpora, to separate "small type is hard to read" from "code carries no redundancy to repair
a misread":

- **code** — deterministic TypeScript-shaped source, near-zero linguistic redundancy, and dense
  with `key: "<hex>"` distractors that look exactly like the probes.
- **prose** — real technical English lifted from this repo's own research docs, probes bracketed
  as `[PROBE-nnnn=xxxxxx]` in flowing text.

Grading is done by reading the PNG back through Claude Code's `Read` tool on Claude Opus 5 — the
delivery path a real agent would use, not a synthetic one.

### The contamination control, and why it changed the answer

**A grader must never score two pages rendered from the same seed.** The corpus is seeded, so two
renders sharing a seed share their probe id→code mapping exactly. Grade one, and you have
memorised the answers to the other; the second "reading" is recall.

The first run of this study broke that rule and produced a spectacular false result: prose at
9.3 px scored **97%**, seemingly proving that linguistic redundancy rescues identifiers from the
downscale cliff. It proves nothing of the sort — that page shared seed `20260811` with a page
already graded at native size. Re-run blind on fresh seeds, the same condition scores **32%** and
**43%**.

Every figure below is labelled by grading status. Only the blind rows support a claim.

| Page | Corpus | Delivered font | Ratio | Grading | Exact recall | 95% CI |
|---|---|---:|---:|---|---:|---|
| `page-12px` | code | 9.3 px | 2.12× | clean (first from seed) | **30.3%** (10/33) | 17.4 – 47.3 |
| `page-14px` | code | 10.9 px | 1.50× | partial | 91.4% (32/35) | 77.6 – 97.0 |
| `n12px` | code | 12.0 px | 2.07× | **contaminated** | ~~97.0%~~ | — |
| `codeB` | code | 12.0 px | 2.07× | **blind** | **93.9%** (31/33) | 80.4 – 98.3 |
| `prose-native` | prose | 12.0 px | 1.86× | clean (first from seed) | 97.2% (35/36) | 85.8 – 99.5 |
| `prose-over` | prose | 9.3 px | 1.91× | **contaminated** | ~~97.2%~~ | — |
| `proseB` | prose | 9.3 px | 1.91× | **blind** | **32.1%** (9/28) | 17.9 – 50.7 |
| `proseC` | prose | 9.3 px | 1.91× | **blind, careful** | **42.9%** (9/21) | 24.5 – 63.5 |

### H1 — Delivered pixel size is the variable `MEASURED`

At ~12 px delivered, blind recall is **93.9%** (CI 80.4–98.3). At 9.3 px it is **30–43%** across
three independent blind passes on two corpora.

Claude Code downscales any image over a 2000 px long edge, so a page rendered at the API's
2576 px maximum arrives at 0.776 scale: 12 px type becomes 9.3 px. **Render at exactly the size
the client will deliver, never larger.** Oversizing loses twice — you may be billed 4,784 visual
tokens for the 2576 px page and get the legibility of the 2,952-token one. The intuition that a
higher-resolution source gives better OCR is exactly inverted, because the resample happens after
you have already paid for the pixels.

### H2 — Prose does not rescue identifiers `MEASURED`

This is the correction the blind re-run forced. At 9.3 px, prose scores 32–43% and code scores
30.3%; the intervals overlap almost completely. Surrounding English repairs *the prose*. It
carries no information about a random hex string, so an identifier fails in prose exactly as it
fails in code.

"Gist through images, never identifiers" is therefore not softened by context — it is confirmed
by it.

### H3 — Two failure modes, and only one of them is fixable `MEASURED`

An earlier draft of this entry claimed association drift — reading a value correctly and filing it
under the wrong key — was the dominant failure. **Measuring it says otherwise.** Classifying every
wrong probe by whether its transcribed code appears anywhere in ground truth:

| Page | Delivered | Exact | Drift | Glyph error | Read-anywhere |
|---|---:|---:|---:|---:|---:|
| `codeB` | 12.0 px | 93.9% | 0 | 2 | 93.9% |
| `n12px` | 12.0 px | ~~97.0%~~ | 0 | 1 | ~~97.0%~~ |
| `prose-native` | 12.0 px | 97.2% | 0 | 1 | 97.2% |
| `page-14px` | 10.9 px | 91.4% | 0 | 3 | 91.4% |
| `page-12px` | 9.3 px | 30.3% | 0 | 22 | 30.3% |
| `proseB` | 9.3 px | 32.1% | 3 | 16 | 42.9% |
| `proseC` | 9.3 px | 42.9% | 1 | 11 | 47.6% |

**Glyph error dominates: 56 of 60 errors.** Drift is 4 — rare, confined to the prose pages, and
absent from every code page and every page at 12 px.

The `read-anywhere` column is the ceiling if keying were free: score a probe correct whenever its
code was read correctly *somewhere*. At 9.3 px that ceiling is **30–48%**. So even a perfect fix
for drift leaves the technique unusable at that size. **Delivered pixel size is the whole game;
drift is a rounding error on top of it.**

Drift still matters for a reason unrelated to its frequency: **it is the one error class no
character-level check can catch.** In `proseC`, probe `0104`'s code `943c2b` was transcribed
perfectly and filed under probe `0096` — two probes wrong, zero characters misread. A checksum
over the transcription passes. Only the key→value binding is broken.

That it appears only in prose is suggestive but untested: prose probes sit 40 words apart in
flowing text, so the eye travels further between a key and its value than in the code corpus,
where probes recur at a fixed short interval. Layout, not font size, would be the lever — if the
size problem were solved first, which it is not.

One metric warning either way: per-character error rates *understate* the damage badly. At 9.3 px
character error runs 21–33% while exact-probe recall is 30–43%, because one bad glyph destroys a
whole identifier. **Report probe recall. Character accuracy is the number that makes this
technique look survivable.**

### H4 — Character errors are single-glyph and survive review `MEASURED`

Where characters do fail, 25–59% of wrong probes are wrong by exactly one glyph — `95798d` read
as `05798d`, `f60f3b` as `f68f3b`, `b3d0cb` as `b3d8cb`. Confusion clusters on `0`/`8`/`9`,
`c`/`e`, `f`/`b`, `d`/`0`.

A one-character error in a hash, key, commit SHA, port, or version **passes every human review and
every LLM review**. It is indistinguishable from correct until it is executed. Truncated-summary
loss is loud; optical loss is silent.


### H5 — The ratio ceiling, and why the technique is dominated

Geometry alone, before legibility:

| Font | Cols × rows on 2576×1456 | Chars | Ratio at 4784 visual tokens |
|---:|---|---:|---:|
| 7 px | 609 × 181 | 110,229 | 6.40× |
| 8 px | 533 × 160 | 85,280 | 4.95× |
| 10 px | 426 × 120 | 51,120 | 2.97× |
| 12 px | 355 × 103 | 36,565 | 2.12× |
| 14 px | 304 × 85 | 25,840 | 1.50× |

The 6.4× headline needs 7 px type. At the measured floor, the achievable ratio is **~2×**.

Now price the alternative. Anthropic's own [context-window
walkthrough](https://code.claude.com/docs/en/context-window) documents a subagent that reads
`session.ts`, `timeouts.ts` and `config/*.ts` in its own window and returns **420 tokens** to the
parent. Delegation routinely achieves **20–100×** on the same job, loses nothing that was going
to be used, and corrupts no identifiers.

> **Verdict: optical context compression is real, reproducible, and dominated.** ~2× with a
> silent-corruption tail, against 20–100× clean from delegation. It is the right tool only when
> the content is *already* pixels (a screenshot, a PDF page, a chart) — there, the image is the
> cheap representation and transcribing it to text is the expensive mistake.

### H6 — Standard-tier models cannot do this at all `PRIMARY-DOC`

Pre-4.7 models downscale to a 1568 px long edge. A page rendered at 2000 px arrives at 0.784
scale, putting 12 px type at 9.4 px — the 30% band. Optical compression is a **Claude 4.7+
technique only**, and on standard tier the whole page caps at 1568 visual tokens anyway.

### H7 — Traps that cost tokens without returning any

| Trap | Detail |
|---|---|
| Base64 in multi-turn | full image bytes re-sent in the payload every turn; use the Files API and `file_id` |
| Lossy re-encode | "heavy JPEG compression can make text difficult to read" — primary doc; compounding passes are worse |
| >20 images per request | a stricter per-image dimension limit kicks in; keep each ≤2000 px or stay ≤20 blocks |
| Animation | "only the first frame is used" |
| Metadata | "Claude does not parse or receive any metadata from images" — EXIF captions are not a side channel |
| Images are write-once | cannot be diffed, patched, grepped, or partially re-read; any edit means re-rendering and re-paying |

---

## Part 2 — Compaction economics

### I1 — Compaction's cost is invisible in the field everyone reads `PRIMARY-DOC`

[Compaction](https://platform.claude.com/docs/en/build-with-claude/compaction), beta
`compact-2026-01-12`:

> "Compaction requires an additional sampling step, which contributes to rate limits and billing."

> "The top-level `input_tokens` and `output_tokens` do not include compaction iteration usage."

Their own worked example:

| Iteration | Input | Output |
|---|---:|---:|
| `compaction` | 180,000 | 3,500 |
| `message` | 23,000 | 1,000 |
| **Top-level `usage.input_tokens` reports** | **23,000** | **1,000** |
| **Actually billed** | **203,000** | **4,500** |

**24,000 reported, 207,500 billed — an 8.6× under-report** on any dashboard that reads the
top-level fields. Every cost tool built before this beta, including our own importer, is wrong on
compacting traffic. `usage.iterations` must be summed.

> **This is the single highest-value finding in this document for the product.** It is a
> detectable, quantifiable, content-blind billing defect — exactly the shape of the audit the
> Savings Report already does.

### I2 — Compaction levers

| Lever | Detail | Trap |
|---|---|---|
| `trigger` | default 150,000 input tokens; minimum 50,000 | triggering early pays the sampling step more often |
| `cache_control` on the compaction block | keeps the summary cached across subsequent turns | the compaction event itself invalidates everything before it |
| Separate system-prompt breakpoint | keeps system cached independently of the summary | without it, every compaction re-writes the system prefix |
| Microcompact | clears stale tool results **without a model call** | strictly cheaper than compaction; prefer it |
| `clear_tool_uses_20250919` | clears old tool results only | "Invalidates cached prompt prefixes when content is cleared" |
| `clear_at_least` | refuses to fire unless N tokens are freed | without it, a small clear can cost more in lost cache than it saves |
| `clear_thinking_20251015` | clears thinking blocks | keeping them **preserves** the cache; clearing invalidates from that point |
| `exclude_tools` | never clear results from named tools | the artifact-trail fix: exclude the tools that record file state |

### I3 — What Claude Code silently loses at compaction `PRIMARY-DOC`

| Mechanism | After compaction |
|---|---|
| System prompt, output style | unchanged |
| Project-root CLAUDE.md, unscoped rules | re-injected from disk |
| Auto memory | re-injected from disk |
| **Rules with `paths:` frontmatter** | **lost until a matching file is read again** |
| **Nested CLAUDE.md in subdirectories** | **lost until a file in that subdirectory is read again** |
| Invoked skill bodies | re-injected, capped **5,000 tokens per skill / 25,000 total**, oldest dropped first |

Two consequences almost nobody accounts for:

1. **A path-scoped rule is a rule that stops applying after a compaction.** If it must survive,
   drop the `paths:` frontmatter or move it to the project-root CLAUDE.md.
2. **Skill truncation keeps the start of the file.** Put the instructions that matter at the top
   of `SKILL.md`; anything past 5,000 tokens is not guaranteed to survive a long session.

### I4 — Session controls

| Control | Range / default | Notes |
|---|---|---|
| `/autocompact <n>` | 100K–1M | persists to the `autoCompactWindow` user setting |
| `--autocompact` | same | one launch; not preempted by managed settings, unlike the command |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | plain token count only | outranks the command, the flag, and the setting |
| `/compact <focus>` | — | "keeps what you choose instead of what the automatic pass guesses" |
| `/clear` | — | the cheapest lever in the whole document: zero sampling step, zero summary |

`/autocompact auto` restores the model-tuned window. Claude Code caps the window at the model's
real context window regardless.

---

## Part 3 — Context that never enters (the levers that actually win)

Measured token costs from Anthropic's own session walkthrough. These are the real denominators.

| Item | Tokens | Lever |
|---|---:|---|
| System prompt | 4,200 | fixed |
| Project CLAUDE.md | 1,800 | **keep under 200 lines**; move reference content to skills or path-scoped rules |
| Auto memory | 680 | capped at first 200 lines / 25 KB |
| Skill descriptions index | 450 | `disable-model-invocation: true` removes a skill from the index entirely |
| Global CLAUDE.md | 320 | |
| Environment info | 280 | |
| **MCP tools, deferred** | **120** | names only; full schemas load on demand |
| A single file read | 1,100–2,400 | dominates everything above |
| Subagent returns | **420** | after reading an unbounded number of files in its own window |

### J1 — Deferred MCP schemas `PRIMARY-DOC`

Tool *names* cost 120 tokens. Full schemas for a large MCP fleet cost thousands, every turn,
forever. `ENABLE_TOOL_SEARCH=auto` loads them upfront only if they fit in 10% of the context
window; `ENABLE_TOOL_SEARCH=false` loads everything. Default (deferred) is correct for anyone
running more than a couple of servers.

Related, from the pricing page: the tool-use system prompt is itself billed, and it is
**non-monotonic across models**:

| Model | `auto` / `none` | `any` / `tool` |
|---|---:|---:|
| Claude Opus 5 | 286 | 406 |
| Claude Opus 4.8 | 290 | 410 |
| **Claude Opus 4.7** | **675** | **804** |
| Claude Opus 4.6 | 497 | 589 |
| Claude Sonnet 5 | 354 | 474 |

Opus 4.7 charges **2.4× Opus 5** for the same tool-use preamble on every single request.

Per-tool definitions on top: bash `325` (Opus 4.7+) or `244`, text editor `700`,
computer use `735` plus `466–499` of system prompt.

### J2 — Cap what a fetch can drag in `PRIMARY-DOC`

Web fetch is free of surcharge, so the whole cost is context:

| Fetched | Tokens |
|---|---:|
| Average web page (10 kB) | ~2,500 |
| Large documentation page (100 kB) | ~25,000 |
| **Research paper PDF (500 kB)** | **~125,000** |

One unguarded PDF fetch is **five sixths of a 150K compaction trigger**. `max_content_tokens`
exists precisely for this and is unset in most integrations.

### J3 — Thinking blocks now accumulate by default `PRIMARY-DOC`

> On Claude Opus 4.5 and later Opus models, Claude Sonnet 4.6 and later, Fable 5, Mythos 5 and
> Mythos Preview, "the API keeps previous thinking blocks by default, and they count toward the
> context window like any other input tokens." On earlier Opus/Sonnet models and **all Haiku
> models**, the API strips them automatically.

Upgrading across that boundary changes context growth rate on wire-identical traffic. Nothing
warns you. `clear_thinking_20251015` overrides it in either direction — at the cost of cache
invalidation from the clear point.

### J4 — Cheap habits, real money

| Habit | Why |
|---|---|
| `!command` prefix | you put the output in context deliberately, instead of Claude spending a turn to get it |
| grep/head/jq before it lands | file reads dominate; filtering at the source is free |
| Short hook output | `additionalContext` "enters context without truncation" |
| One task per session, `/clear` between | old conversation is re-billed on **every** subsequent message |
| `disable-model-invocation: true` | side-effecting skills cost zero context until invoked by name |

### J5 — More window is not the fix `PRIMARY-DOC`

> "more context isn't automatically better. As token count grows, accuracy and recall degrade,
> a phenomenon known as *context rot*."

And: "Cached prompt prefixes still occupy the context window: prompt caching changes what you
pay for those tokens, not whether they count."

---

## Part 4 — Corrections to the strict identity register

Nine items from today's primary-doc pass that change entries already published.

| # | Register said | Correct as of 2026-08-11 |
|---|---|---|
| 1 | image tokens ≈ `(w×h)/750` | `⌈w/28⌉ × ⌈h/28⌉`; tiers cap at 1568 / 4784 visual tokens |
| 2 | 1M context carries a long-context price premium | **"Claude 4.6 and later models … include the full 1M token context window at standard pricing. (A 900k-token request is billed at the same per-token rate as a 9k-token request.)"** No beta header, no premium. |
| 3 | caching needs manual breakpoints, hard cap 4, 20-block lookback | **Automatic caching now exists**: "Add a single `cache_control` field at the top level of your request. The system automatically manages cache breakpoints as conversations grow." Recommended default; sidesteps the 4-breakpoint cap and the 20-block lookback for most callers. Manual placement becomes the fine-grained option, not the baseline. |
| 4 | tokenizer swings "1×–1.35×", unsourced | **primary doc, verbatim: "Claude 4.7 and later models and Claude Mythos Preview use a newer tokenizer … approximately 30% more tokens for the same text."** Boundary is exact: Sonnet 4.6 and earlier use the previous tokenizer. Opus 4.6 → 4.7 at an unchanged $5/MTok is a **~30% cost increase on identical text.** |
| 5 | — | **Fast mode doubles the bill**: Opus 5 / 4.8 at `speed:"fast"` bill **$10/$50 vs $5/$25**, "across the full context window", and are **not available with the Batch API**. Not on 4.7 (errors) or 4.6 (silently runs standard). |
| 6 | cross-region ≈10% on Bedrock | first-party equivalent is `inference_geo:"us"` = **1.1× on every category** (input, output, cache writes, cache reads) on 4.6+. Earlier models 400 on the parameter. |
| 7 | Sonnet 5 intro pricing noted | **expires 2026-08-31 — 20 days from today.** $2/$10 → $3/$15, a **50% increase**. The most time-boxed item in either register. |
| 8 | batch stacks with caching | still true, and confirmed: multipliers "stack with other pricing modifiers, including the Batch API discount and data residency." Fast mode does **not** stack with batch. |
| 9 | — | **Code execution: 1,550 free container-hours per org per month**, then $0.05/hour; **free entirely** when used alongside web search or web fetch. Files in the request bill execution time *even if the tool is never called.* |

Items 2, 3 and 4 are not footnotes — they change what the register recommends. Item 4 in
particular means a customer who "just upgraded to 4.7" saw a ~30% bill rise from the tokenizer
alone, which will be misread as waste and mis-attributed to whatever else changed that month.

---

## Verdicts

| Technique | Verdict | Basis |
|---|---|---|
| Subagent delegation | **SHIP, default on** | 420 tokens returned for an unbounded read, primary doc |
| `/clear` between tasks | **SHIP, default on** | no sampling step, no summary, no loss |
| Deferred MCP schemas | **SHIP, default on** | 120 tokens vs thousands, primary doc |
| `max_content_tokens` on fetches | **SHIP, default on** | one PDF = 125,000 tokens |
| Microcompact | **SHIP** | clears stale tool results with no model call |
| `exclude_tools` on file-state tools | **SHIP** | fixes the artifact-trail loss that compaction causes |
| Compaction (server-side) | **SHIP, opt-in, priced** | works, but bills a hidden extra sampling step |
| `clear_tool_uses` | **OPT-IN** | pair with `clear_at_least` or it loses more in cache than it frees |
| Optical compression, content already pixels | **SHIP** | the image is the cheap representation |
| Optical compression, text → image, ≥12 px delivered, gist only | **OPT-IN, measured** | 2.07× at 93.9% blind probe recall (CI 80.4–98.3) |
| Optical compression for identifiers | **REJECT** | ~1-in-16 corrupted even at the best measured setting; errors are single-glyph or mis-keyed, and survive review |
| Optical compression at >2000 px into Claude Code | **REJECT** | 30–43% blind recall on both corpora; pays more, reads worse |
| Optical compression on pre-4.7 models | **REJECT** | forced downscale puts every legible font under the floor |

---

## Open questions

1. ~~**How much of the 9.3 px failure is association drift?**~~ **Answered, 2026-08-11: 4 of 60
   errors.** Glyph error dominates. The position-independent ceiling at 9.3 px is 30–48%, so
   drift is not what makes the technique fail. What remains open is *why drift appears only in
   prose* — the hypothesis is visual distance between a key and its value, which is a layout
   variable, not a size one.
2. ~~**Does prose recover?**~~ **Answered, 2026-08-11: no.** Blind, prose at 9.3 px scores
   32–43% against code's 30.3%. Redundancy repairs the prose around an identifier, never the
   identifier. What remains open is whether *prose itself* — as opposed to the probes embedded in
   it — survives at 9.3 px. *Test:* word error rate on a marked verbatim region, which this rig
   renders but does not yet score.
3. **What is actually billed when the client downscales?** 2576 px in, 2000 px delivered — is the
   charge 4784 or 2952 visual tokens? *Test:* `count_tokens` on both, same content.
4. **Does compaction's sampling step get the cache discount?** 180,000 input tokens at full price
   versus at 0.1× is the difference between compaction being cheap and being the largest single
   line on the bill. Docs are silent.
5. **Is microcompact free?** "Without a model call" implies zero tokens, but it still mutates the
   prefix and therefore the cache. *Test:* usage deltas either side of a microcompact.

---

## Provenance

| Grade | Count |
|---|---:|
| primary-doc (platform.claude.com / code.claude.com, fetched 2026-08-11) | 31 |
| **measured here** (rig + probe scoring, Opus 5, 8 pages, 3 blind) | 8 |
| peer-reviewed | 2 |
| practitioner | 3 |

Rig: `bench/optical/render.mjs` (headless Chrome, deterministic corpus, page packed by
construction) and `score.py` (exact-match probe scoring). Grading instrument was Claude Code's
`Read` on Opus 5 — deliberately a different instrument from the renderer.

**Numbers deliberately not repeated here:** DeepSeek-OCR's 10×/97% and Glyph's 3–4× are cited as
what those papers measured **on their own models**, never as Claude figures. The measured Claude
ceiling is 2.07× at 93.9% blind recall.

**Numbers retracted here:** the 97% figures for `n12px` and `prose-over`. Both were graded after a
same-seed page, so both are recall, not reading. They are left in the results table struck through
rather than deleted — a retraction that removes the evidence is not a retraction.
