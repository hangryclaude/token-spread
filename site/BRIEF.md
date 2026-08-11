# Tokens Saved — scroll homepage brief

Every fact below is measured and traceable. **Nothing on the page may say anything that is not
in this file.** Where the page needs a fact that is not here, it gets the token `— to supply —`
and a `data-sc-tbd` naming what is owed.

## The stack (from the interview, 2026-08-11)

| slot | effect | answer that chose it |
|---|---|---|
| ground | `caustic-field` | dark ground, one for the whole document |
| hero | `kinetic-marquee` | "type in motion" — the headline *is* the marquee |
| spine | `sticky-split` | "explain something" — a technical argument |
| motion | `act-breaks` | "sections arrive as you scroll", zero backdrops |
| type | `display-type` | display type doing structural work |
| layout | `card-grammar` | the refusals row, as **ledgers** (no imagery) |
| chrome | `fixed-hud` | mandatory past ~5 viewports — a way back |
| chrome | `capsule-controls` | CTA and nav in one system |

Answers taken as read from the working session: purpose (explain a technical argument), client
(real, real content), type voice (IBM Plex, established), imagery (none — the product's own
artifacts are the imagery).

Budget: ceiling was set at $20. **Spend is $0** — a type hero needs no generation, and there is
no real product to photograph. Generating an image of a thing that does not exist would break the
Truth rules, not the budget.

---

## Facts the page may state

### The bar
- 176 candidate techniques adjudicated. **66 pass, 50 rejected, 36 unresolved.**
- The question: does the model read a different sequence of tokens, does a different model answer,
  or does a different amount of thinking happen?
- Model routing is **rejected** — a different model writes different words.
- Source: `docs/research/2026-08-10-strict-identity-register.md`.

### Rates (rate card captured 2026-08-08, `src/rates.ts`)
- Opus 5 / 4.8 / 4.7: **$5 / MTok input, $25 / MTok output**
- Sonnet 5: **$2 / $10** introductory, **through 2026-08-31**, then $3 / $15
- Haiku 4.5: **$1 / $5**
- Cache read: **0.1×** input · 5-minute write: **1.25×** · 1-hour write: **2×**
- Batch: **50%** off input and output

### The twin terminals
- A turn carrying 40,000 tokens of context and generating 300 output tokens, on Opus 5:
  **$0.2075 uncached** against **$0.0275 cached** — **7.55×**, byte-identical output.
- Over 1,000 turns: **$207.50** against **$27.50**.

### Cache-write TTL
- Measured across **7,454 deduped requests**: **40.4M** cache-write tokens, **100% at the 1-hour
  TTL**, zero at 5 minutes.
- **95%** of those 1-hour writes were re-read **inside five minutes**, where 1.25× would have served.
- Pricing every write at the 5-minute rate understated a **$1,632** sample by **$150.69 (9.2%)**.

### Compaction
- Anthropic's own worked example reports `usage.input_tokens: 23,000` while billing **207,500**
  tokens in total — an **8.6×** under-report for anything reading the top-level field.
- Their words: *"The top-level `input_tokens` and `output_tokens` do not include compaction
  iteration usage."*

### The tool itself
- **130 tests**, **0 bytes written** to any input, **0 prompts read**, no runtime dependencies.
- Five tests spawn the real CLI and assert every input file is byte-identical afterwards.
- Reads local Claude Code transcripts at every depth, **or** an organisation's Admin usage report.

### The sample audit (synthetic usage, labelled as such on the page)
- **$19,486.50** of measured spend · **5%** cache-hit rate · **$10,563.68** recoverable ·
  **$2.05 / MTok** blended.

### Third-party, published, cited
- ProjectDiscovery went from a **7%** to an **84%** cache-hit rate.
  https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching

### Contact and plans (already live on the site)
- angus@angusbuilds.com
- Audit **$0** · Starter **$499/mo** · Growth **$1,999/mo** · Scale **$5,999/mo**

---

## Facts the page may NOT state

No customer names, logos, testimonials, case studies, headcount, funding, founding year, or any
metric attributed to a customer. **None exist.** A slot that wants one gets `— to supply —`.

The $19,486.50 audit is **synthetic** and the page must say so wherever it appears.
