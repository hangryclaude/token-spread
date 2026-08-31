<!-- The merge that never happened, found five days later and done properly. -->

# Sweep 12, recovered — and what the second look cost it

On 2026-08-12 the twelfth sweep adjudicated fifteen candidates. Two reached the verdict files.
The other thirteen sat in [`2026-08-12-exhaustion-statement.md`](2026-08-12-exhaustion-statement.md)
carrying ids **185–199**, which the verdict files had already spent — id 185 was DeepSeek's
on-disk cache, id 186 was a Claude Code read-path measurement. Nothing in the repository could
have noticed. The cohort list lived in three places, ids were assigned by whoever typed the
brief, and the site published 187 because 187 was the number in the JSON.

They are now ids **187–200**, and the register stands at **201**.

## What the second look cost them

Every entry had its source re-read on 2026-08-17. Then every entry claiming a pass was handed to
an adversary told to refute it and to default to refuted when unsure. **Five of six proposed
passes did not survive.**

| id | Entry | Brief, 2026-08-12 | Recovered, 2026-08-17 |
|---:|---|---|---|
| 187 | K8s CronJob `Forbid` — skip-on-overlap, scoped to provably idempotent jobs | PASS_ABSOLUTE | **PASS_ABSOLUTE**, scope moved into the title |
| 188 | K8s CronJob `Replace` — kill-and-restart on overlap | *bundled with the above* | **FAIL**, split out |
| 189 | BullMQ job deduplication (Simple Mode) | PASS_ABSOLUTE | **FAIL** |
| 190 | AWS SQS FIFO `MessageDeduplicationId` | PASS_ABSOLUTE | **CONTRACTUAL_ONLY** |
| 191 | Team/Enterprise per-seat pricing | CONTRACTUAL_ONLY | **CONTRACTUAL_ONLY** |
| 192 | PromptXRay — read-only cache-hit diagnostic | INSUFFICIENT_EVIDENCE | **FAIL** |
| 193 | gRPC retry throttling (token-bucket budget) | PASS_SCHEDULING | **FAIL** |
| 194 | Reservation amortization (pure accounting) | PASS_ABSOLUTE | **PASS_ABSOLUTE** — survived refutation |
| 195 | Azure PTU Reservations — exit and cancellation mechanics | CONTRACTUAL_ONLY | **CONTRACTUAL_ONLY** |
| 196 | AWS Bedrock Provisioned Throughput has no exit | FAIL | **FAIL** |
| 197 | No EC2-RI-Marketplace secondary market for LLM capacity | FAIL | **FAIL** |
| 198 | Automated-access ban vs the API-key carve-out | INSUFFICIENT_EVIDENCE | **INSUFFICIENT_EVIDENCE** |
| 199 | Moonshot/Kimi cache — no invariance statement | INSUFFICIENT_EVIDENCE | **INSUFFICIENT_EVIDENCE** |
| 200 | Who captures a mid-term list-price decrease | INSUFFICIENT_EVIDENCE | **CONTRACTUAL_ONLY** |

Net to the published tally: **+2 pass · +4 provider's-word · +6 rejected · +2 unresolved**.
The enqueue-time dedup family arrived promising four passes and delivered one.

## The three findings worth more than the entries

**A documentation sentence kept being read as a structural argument.** The register's rule is
explicit — only a measurement, or the fact that no request was ever sent, supports
`PASS_ABSOLUTE`. Three entries crossed that line in the same way. SQS FIFO is the clean case: the
client *does* send the second `SendMessage`, and AWS's prose says it discards it server-side.
That is the provider's word about the provider's internals, which is what `CONTRACTUAL_ONLY`
exists for. The genuine enqueue-time cases are different in kind, not degree — there, nothing
leaves the machine.

**ID-gated dedup is content-blind, and the failure mode is worse than overspending.** BullMQ's
collision test is `SET deduplicationKey jobId NX` — a caller-supplied string against a
caller-supplied string, with no bytes of the payload in the comparison. Its own documented
example uses an arbitrary application id. When two distinct requests collide, the second is
discarded and `.add()` resolves to the *first* job's result: the model never sees the second
question and the caller is handed an answer to someone else's, silently. The first pass wrote
that consequence down and still graded it a pass, treating it as a note about sizing. It is not
a note about sizing.

**Markdown conversion silently drops table cells whose content is an icon.** This one is
methodological and will outlive the entry it came from. A first pass read `claude.com/pricing`
as converted markdown and concluded, in writing, that "nothing on the page describes
Team/Enterprise routing to dedicated or priority capacity". The adversary fetched the same URL as
raw HTML and found a row titled **"Priority access at high traffic times"**, check-marked for
Team and both Enterprise tiers, in a Team/Enterprise-scoped comparison table. The check-mark is
an SVG path; the conversion rendered the cell empty. **Any future sweep adjudicating a pricing or
feature-comparison table must fetch it raw.**

A fourth, smaller: PromptXRay was promoted to `PASS_METADATA` on a reading of the four files in
its own repository, all of which are honest. The adversary opened the pinned dependency those
files hand every request to — `litellm==1.91.2` — and found `transform_request()` rewrites
`image_url`, fetches referenced PDFs and substitutes re-encoded bytes, and strips `cache_control`
against openai.com hosts. Verifying the code with the project's name on it and skipping the
mandatory hop underneath is the same shape as sweep 12's paraphrase-dressed-as-a-quote.

## What the critic said this pass did not do

Recorded because it is the honest half.

- **The refutation ran one direction only.** Six entries claiming a pass were attacked. Nothing
  checked whether a `FAIL` or `INSUFFICIENT_EVIDENCE` verdict was too harsh, so the bias check is
  asymmetric by construction.
- **Nothing was measured.** Every check in this pass was source-reading. No traffic was observed
  through any mechanism, including the two that now carry `PASS_ABSOLUTE`.
- **Three entries draw on one Azure documentation cluster** — amortization, PTU exit mechanics,
  and the mid-term price question all rest on the same Microsoft Learn pages, scored
  independently. A contradiction found between two of those pages while checking one entry was
  never carried back to the other two.
- **Several sources carry no revision date at all** (SQS, Bedrock PT, EC2 RI Marketplace), so a
  future sweep has no anchor against which to detect that they changed.

## What now prevents the stranding

The merge did not fail because anyone was careless. It failed because nothing could see it.

- [`cohorts.json`](cohorts.json) is the only list of cohort files. The schema test, the film and
  the CLI all read it; the README's download block is checked against it.
- `bun run register next-id` answers the question the brief guessed at.
- `bun run register check` and `tests/registerIds.test.ts` fail on a duplicate id.
- `tests/publishedCounts.test.ts` reads every published number out of the register and fails when
  a page disagrees — including the two image alt texts, which had been saying **51 rejected**
  against a register holding 52 since the day four entries were expelled from the passing column.
- `bun run render:media --check` now compares the film against a stamp of the tally it was
  rendered from. It previously reported "counts reconcile" on both sides of a re-render that
  changed the file.

## Dating

`SCHEMA.md` documents `verifiedAgainst` as "the source re-read, with the date". Of the 187
entries predating this cohort, 98 carry the field and **none carries a date** — the phrase they
use is "this session", which was unambiguous to whoever typed it and is unrecoverable now. Those
stay as written; inventing a date would be worse than admitting there isn't one. `register stale`
falls back to the date in each cohort's filename and marks it `~` to say so. All fourteen entries
here carry a real one, and `tests/registerSchema.test.ts` now holds every cohort dated 2026-08-17
or later to that standard.

## Still needing a live account

Unchanged by this pass, and not settleable by any amount of further reading:

1. Whether Batch/Flex/PTU run identical weights and precision.
2. DeepSeek's and Kimi's output-invariance claims, never independently replayed.
3. Whether Claude Code on a subscription login satisfies the Consumer Terms §3 API-key carve-out
   (id 198) — needs an explicit Anthropic statement.
4. Who captures a mid-term list-price decrease on the **Anthropic** half of id 200. Azure's EA
   terms answer it; Anthropic's do not.

The blocker on all four is the same: no `ANTHROPIC_API_KEY`.
