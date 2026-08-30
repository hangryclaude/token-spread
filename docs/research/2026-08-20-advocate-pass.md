<!-- The advocate pass sweep 14 was owed, extended to every unresolved entry in the register. -->

# The advocate pass — arguing our own verdicts up

**274 entries · 62 pass · 72 on the provider's word · 89 rejected · 51 unresolved.**

Sweep 14 closed with a debt on the record: its refuters attacked the passes, but no advocate
ever argued its 20 FAILs and 7 unresolveds back up, the check sweep 13's rejections got. This
pass pays that debt and widens it: advocates over all 27 sweep-14 FAIL/INSUFFICIENT_EVIDENCE
entries, and settlers over the 49 older entries that had sat unresolved — 76 findings in all.

The gate was the register's standing one, run in the direction it had never fully run before:
**every proposed upgrade faced two independent skeptics**, each re-fetching every cited source
raw and grepping quotes verbatim with a control phrase, each instructed to refute unless the
change was airtight. A change survived only if both declined to refute.

| | |
|---|---:|
| entries examined | 76 |
| verdict changes proposed by advocates | 29 |
| killed by at least one skeptic | 24 |
| applied | **5** |
| settlingExperiment added to entries that lacked one | 16 |

## The five that survived

| id | technique | movement |
|---:|---|---|
| 16 | bedrockcache — 6-layer breakpoint/threshold audit across Bedrock abstraction stacks | INSUFFICIENT_EVIDENCE → **PASS_ABSOLUTE** |
| 18 | prompt-cache-doctor — byte-level diff detector for silent invalidators | INSUFFICIENT_EVIDENCE → **PASS_ABSOLUTE** |
| 22 | 4-breakpoint budget algorithm (system=1, last-tool=1, window shrinks to fit) | INSUFFICIENT_EVIDENCE → **PASS_METADATA** |
| 95 | Vertex GSU burndown discount for cached tokens under Provisioned Throughput | INSUFFICIENT_EVIDENCE → **CONTRACTUAL_ONLY** |
| 201 | Claude Code workflow fan-out prefix staggering | INSUFFICIENT_EVIDENCE → **CONTRACTUAL_ONLY** |

Three of the five are the register correcting its own corrections, which is the point of
running the challenge both ways:

- **16 and 18** were parked on 2026-08-12 when their cited tools looked like zero-star
  vapourware. The advocate did what neither the original entry-writer nor the 2026-08-12
  reviewer did: downloaded the actual artifacts and read the code. bedrockcache's entire
  published package imports nothing network-capable — argparse/json/sys/dataclasses/typing/enum
  and nothing else — so it is structurally incapable of sending a request. prompt-cache-doctor's
  wrapper executes `response = original(*args, **kwargs)` untouched, exactly as its docstring
  claims. Structural arguments, not the tools' say-so. The credibility caveat (0–1 stars)
  carries forward unchanged; obscurity is not a verdict.
- **22** fell to a crosscheck that had checked the wrong repository — the override cited
  msglm's core.py (entry 11's source) while entry 22's source was always a Franklin issue,
  which the advocate fetched and which shows a full unsliced copy of every message with only
  `cache_control` placement changing. The demotion's stated worry (content trimming) is
  answered by the diff itself.
- **95** was settled by fetching the Vertex page with a browser user agent after three separate
  WebFetch attempts had returned only the navigation shell — the 0.1x burndown figure was on
  the primary page the whole time. It lands at CONTRACTUAL_ONLY, where every sibling
  Provisioned Throughput entry already sits: Google's word about Google's billing.
- **201** resolves a 2026-08-17 split between two refuters in favour of the stricter one: the
  mechanism is documented precisely, but documentation of a closed-source client caps at
  CONTRACTUAL_ONLY, and the register holds zero PASS_SCHEDULING entries to keep it company.

## The twenty-four that did not

`refute/allow` reads: skeptic #1's vote / skeptic #2's vote. One refute kills.

| id | technique | proposed | votes | retained |
|---:|---|---|---|---|
| 13 | prompt-cache-key / prompt-cache-key-rs — canonical hash of cacheable scope | PASS_ABSOLUTE | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 15 | cachebench / cachebench-rs — per-call hit-ratio + cost instrumentation | PASS_ABSOLUTE | refute/refute | **PASS_METADATA** |
| 17 | prompt-pillar — find_stable_prefix() diagnostic | PASS_ABSOLUTE | allow/refute | **INSUFFICIENT_EVIDENCE** |
| 19 | cache-audit — 6-rule static audit | PASS_ABSOLUTE | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 20 | cache-refund — gap-classification of recoverable cache misses | PASS_ABSOLUTE | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 39 | Conditional-write claim/revert for Bedrock batch orchestration | CONTRACTUAL_ONLY | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 46 | RadixAttention / SGLang | CONTRACTUAL_ONLY | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 47 | Hydragen | CONTRACTUAL_ONLY | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 48 | ChunkAttention | CONTRACTUAL_ONLY | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 49 | AttentionStore / CachedAttention | FAIL | refute/allow | **INSUFFICIENT_EVIDENCE** |
| 65 | OpenRouter cross-provider cache-savings audit endpoint | PASS_ABSOLUTE | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 78 | Service tiers: Priority, Standard, Batch; Fast mode; inference_geo | CONTRACTUAL_ONLY | refute/allow | **INSUFFICIENT_EVIDENCE** |
| 87 | Priority / Fast mode processing (service_tier priority, fast) | CONTRACTUAL_ONLY | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 100 | AWS Bedrock Provisioned Throughput committed-capacity break-even | CONTRACTUAL_ONLY | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 111 | OpenAI Enterprise committed-spend / volume discount | PASS_ABSOLUTE | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 115 | Google Cloud Marketplace private offer drawing down committed spend | PASS_ABSOLUTE | refute/allow | **INSUFFICIENT_EVIDENCE** |
| 119 | Hyperscaler startup cloud-credit programs | CONTRACTUAL_ONLY | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 129 | SOC 2 Type II report as procurement gate | PASS_ABSOLUTE | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 130 | DPA with Standard Contractual Clauses as procurement gate | PASS_ABSOLUTE | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 131 | Zero Data Retention (ZDR) as enterprise add-on/gate | CONTRACTUAL_ONLY | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 134 | Egress review / network allowlisting as procurement gate | PASS_ABSOLUTE | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 198 | Automated/non-human access ban vs the API-key carve-out | CONTRACTUAL_ONLY | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 248 | XGBoost per-endpoint latency prediction for SLO-aware routing | PASS_ABSOLUTE | refute/refute | **INSUFFICIENT_EVIDENCE** |
| 271 | Azure GPT-5.6 Luna price-cut copy-paste regression | INSUFFICIENT_EVIDENCE | allow/refute | **FAIL** |

The kill patterns repeat the register's oldest lessons, now applied to its own advocates. The
tools-never-built cluster (13, 15, 17, 19, 20) died on tier, not on effort — the id-15
advocate even installed and ran the real package, but a measurement of a diagnostic tool
running once is not a measurement of the entry's general claim, and the rest leaned on
READMEs; the two that survived (16, 18) are the two where the published code itself carries
the structural argument. The procurement cluster (111, 115, 129, 130, 134) tried the
docs-sentence-to-PASS move with the tier field relabeled "structural"; the skeptics priced the
evidence, not the label. The kernel-paper cluster (46–48) failed on scope: a measured paper
about self-hosted serving says nothing contractual about anyone's hosted API — and 49 was
argued the opposite direction, toward FAIL, where a split vote left it exactly as unresolved
as it was. 271 stands as the same reminder from the other side: one skeptic allowed, one
refuted, FAIL holds.

Four skeptic verdicts were single-vote saves (`allow/refute` or `refute/allow` on 17, 49, 78,
115) — entries one lenient reviewer away from a wrong upgrade. That is the gate earning its
second seat.

## Housekeeping

Sixteen unresolved entries that lacked a `settlingExperiment` now carry one (ids 7, 12, 48,
93, 109, 130, 138, 150, 154, 228, 248, 250, 251, 252, 253, 254): each names the measurement
that would settle the entry and which way each result points. A completeness critic reviewed
the whole batch; its substantive findings — the wrong-shaped tier labels on 111/115/65, id
130's bundling violation, the novel compliance-gate template on 129/130/134 — all concern
proposals the gate had already killed, and are recorded here so a re-run does not resurrect
them. Raw findings, all 76, with every skeptic's full reasoning:
`raw/2026-08-20-advocate-settler-raw.json`.
