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
- 184 candidate techniques adjudicated. **66 pass, 27 pass on the provider's word alone,
  51 rejected, 40 unresolved.** Those four add to 184 — the brief carried only three of them
  until 2026-08-12, which is how the pages came to publish a breakdown summing to 152.
- The pass count FELL from 70 to 66 on 2026-08-12: four entries (ids 13, 15, 16, 18) were
  downgraded when review found their cited tools were zero-star vanity repos, one unlocatable.
  The page may state this openly; a register that only ever grows its pass count is advertising.
- Two cohorts: the original 176 in `2026-08-10-verdicts-final.json`, plus 8 in
  `2026-08-12-addendum.json` from nine later sweeps. The page states the combined tally; the
  files stay separate so which process produced which verdict is never lost.
- The question: does the model read a different sequence of tokens, does a different model answer,
  or does a different amount of thinking happen?
- Model routing is **rejected** — a different model writes different words.
- Source: `docs/research/2026-08-10-strict-identity-register.md`.

### Rates (rate card captured 2026-08-08, `src/rates.ts`)
- Opus 5 / 4.8 / 4.7: **$5 / MTok input, $25 / MTok output**
- Sonnet 5: **$2 / $10**. Announced as introductory through 2026-08-31; Anthropic's pricing page
  now states this is the standard price and that the scheduled rise to $3 / $15 on 2026-09-01
  "will not occur" (read 2026-08-12). The page may not state a future Sonnet 5 increase.
- Haiku 4.5: **$1 / $5**
- Cache read: **0.1×** input · 5-minute write: **1.25×** · 1-hour write: **2×**
- Batch: **50%** off input and output

### Anthropic cache mechanics (public API behaviour, in the register)
- **4 cache breakpoints, maximum** — register entry *"4-breakpoint budget algorithm
  (system=1, last-tool=1, message window shrinks to fit remainder)"*.
- **20-block lookback** from a breakpoint — register entry *"20-block cache lookback limit and its
  interaction with tool-heavy turns"*.
- **Minimum cacheable prefix is model-specific**: 512 tokens on Opus 5, longer on older and smaller
  models — register entry *"Model-specific minimum-cacheable-prefix-length awareness"*. Any page
  stating 512 must carry the model qualifier; a bare "512 tokens" is wrong for Haiku.

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
- **175 tests**, **0 bytes written** to any input, **0 prompts read**, no runtime dependencies.
- Five tests spawn the real CLI and assert every input file is byte-identical afterwards.
- Reads local Claude Code transcripts at every depth, **or** an organisation's Admin usage report.

### The sample audit (synthetic usage, labelled as such on the page)
- **$19,486.50** of measured spend · **5%** cache-hit rate · **$10,563.68** recoverable ·
  **$2.05 / MTok** blended.

### Third-party, published, cited
ProjectDiscovery, *How We Cut LLM Costs by 59% With Prompt Caching*.
https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching
Every figure below was re-read from the post itself on **2026-08-12**; the pages had been
quoting most of them while this brief authorised only the first line.
- Cache-hit rate **7% → 84%**.
- The relocation trick alone: **7% → 74%** in a single deployment ("overnight").
- Overall cost saving **59%**; post-optimisation **66%**; last ten days **70%**.
- **9.8 billion** tokens served from cache.
- A task at a 2% cache rate cost **roughly 60×** what the same task costs optimised.
- Three deliberate breakpoints; intermediate marks every eighteen blocks against the
  twenty-block lookback.

The relocation trick **fails our own bar** and the page must say so where it appears: moving
dynamic content out of the prefix changes the order the model reads, and their write-up measured
the hit rate, not whether the answers held. Source: the adversarial demotion recorded in
`docs/research/2026-08-10-sweep-per-modality.json`.

### Contact and plans (already live on the site)
- angus@angusbuilds.com
- Audit **$0** · Starter **$499/mo** · Growth **$1,999/mo** · Scale **$5,999/mo**

---

## Facts the page may NOT state

No customer names, logos, testimonials, case studies, headcount, funding, founding year, or any
metric attributed to a customer. **None exist.** A slot that wants one gets `— to supply —`.

The $19,486.50 audit is **synthetic** and the page must say so wherever it appears.
