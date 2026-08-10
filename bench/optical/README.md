# Optical context compression — the rig

Measures whether rendering text as an image actually buys context on Claude, and what it
costs in fidelity. Backs Part 1 of
[`docs/research/2026-08-11-context-survival-register.md`](../../docs/research/2026-08-11-context-survival-register.md).

## Run it

```bash
# defaults: code corpus, 2576x1456, five font sizes
node render.mjs

# the configuration that actually works: native client size, one font
CORPUS=prose W=2000 H=1130 SIZES=12 SEED=31415926 TAG=proseC node render.mjs
```

| Env | Default | What it does |
|---|---|---|
| `CORPUS` | `code` | `code` (dense, distractor-rich) or `prose` (real English from this repo's docs) |
| `W`, `H` | `2576`, `1456` | page size — set these to what the **client delivers**, not what the API accepts |
| `SIZES` | `7,8,10,12,14` | comma-separated font sizes |
| `SEED` | `20260811` | corpus seed — **see the contamination rule below** |
| `TAG` | corpus name | output filename prefix |
| `PUPPETEER_FROM` | `~/skills/package.json` | any package.json whose tree has `puppeteer-core` |

Requires Chrome at `/Applications/Google Chrome.app`. `puppeteer-core` is resolved from
outside this repo on purpose — the bench is a research rig, and adding a browser driver to
token-spread's dependencies to run it would be a poor trade.

## The contamination rule — read this before grading anything

> **One seed, one graded page. Ever.**

The corpus is seeded, so two renders sharing a seed share their probe id→code mapping
exactly. Grade one page, and you have memorised the answers to every other page from that
seed — the second "reading" is recall, and it will score near-perfectly no matter how
illegible the image is.

This is not hypothetical. It is how the first run of this study concluded that prose
survives the downscale cliff at 97%. Re-run blind on fresh seeds, the same condition scored
32% and 43%. **Two of the eight results in the register are struck through for this reason.**

If you need a second pass on a condition you have already graded, re-render with a new
`SEED`. Do not re-read the same page.

## Score it

Grading needs a vision pass, which is manual by design — **the grader must be a different
instrument from the renderer.** For each page:

1. Read `out/<tag>-<n>px.png` with a vision model (this run used Claude Code's `Read` on Opus 5).
2. Transcribe every `PROBE-nnnn=xxxxxx` you can make out into `read-<tag>-<n>px.txt`, one per
   line. Two disciplines, both learned the hard way:
   - Transcribe what you *see*, never what you can infer — inferring is the thing being tested.
   - Read the id and the code **as one unit**. Transcribing a column of codes and a column of
     ids separately produces off-by-one drift, which scores as two wrong probes and hides the
     fact that the glyphs were read correctly.
3. Score:

```bash
python3 score.py 14px                 # or codeB-12px, proseC-12px, ...
python3 score.py codeB-12px --pass b  # a second grading pass on the same page
```

`score.py` reports exact recall with a Wilson 95% interval, the per-character error rate,
single-glyph error share, the confusion pairs, and ghosts (probe ids transcribed that are not
on the page).

## Why probes, and why not per-character accuracy

Recall of a hex code is pass/fail. A summary-similarity score would rate a page "95% accurate"
while every identifier on it is wrong by one character — the failure mode that actually costs
money.

Per-character accuracy has the same problem in reverse: at 9.3 px it reads 67–79% while exact
probe recall is 30–43%, because one wrong glyph destroys a whole identifier. **Report probe
recall. Character accuracy is the number that makes this technique look survivable.**

## Results as run, 2026-08-11, Claude Opus 5

| Page | Corpus | Delivered font | Ratio | Grading | Exact recall |
|---|---|---:|---:|---|---:|
| `page-12px` | code | 9.3 px | 2.12× | clean (first from seed) | 30.3% (10/33) |
| `page-14px` | code | 10.9 px | 1.50× | partial | 91.4% (32/35) |
| `n12px` | code | 12.0 px | 2.07× | contaminated | ~~97.0%~~ |
| `codeB` | code | 12.0 px | 2.07× | blind | **93.9%** (31/33) |
| `prose-native` | prose | 12.0 px | 1.86× | clean (first from seed) | 97.2% (35/36) |
| `prose-over` | prose | 9.3 px | 1.91× | contaminated | ~~97.2%~~ |
| `proseB` | prose | 9.3 px | 1.91× | blind | 32.1% (9/28) |
| `proseC` | prose | 9.3 px | 1.91× | blind, careful | 42.9% (9/21) |

Delivered pixel size is the variable. Corpus type is not — prose does not rescue identifiers.

`native2000-12px.png` is `n12px`; it was produced by re-running with `W=2000 H=1130 SIZES=12`.

## Known limits

- One grader (Claude Opus 5), one pass per page. Intervals are wide; treat the boundaries,
  not the point estimates, as the result.
- Grader variance is real and large: a rushed pass and a careful pass on comparable pages gave
  32.1% and 42.9%. Neither is more "correct" — both are what a real agent might do.
- Error position on the page is not recorded, so it is not known whether errors cluster.
- Association drift is counted as two wrong probes, not reported as its own class.
- Text-token counts use a chars/token approximation (3.6 code, 4.0 prose), not `count_tokens`
  — which would need an API key the rig deliberately avoids.
- The prose corpus is this repo's own docs, so it is technical English, not general prose.
