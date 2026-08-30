export const meta = {
  name: 'audit-standing-passes',
  description: 'Attack the 69 entries in the register\'s passing column that have never been adversarially challenged',
  phases: [
    { title: 'Triage', detail: 'batches of three, matched against the five patterns that have killed passes before' },
    { title: 'Refute', detail: 'two dedicated refuters on every entry triage flagged' },
    { title: 'Synthesis', detail: 'what the passing column is actually worth' },
  ],
}

const FILE = '/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/scratchpad/standing-passes.json'

const BAR = `
THE BAR, verbatim — one question decides every entry: does the model read a different sequence of
tokens, does a different model answer, or does a different amount of thinking happen? If yes it is
FAIL.

  PASS_ABSOLUTE    nothing on the wire changed
  PASS_METADATA    only a field the model never reads changed
  PASS_SCHEDULING  only *when* the request was sent changed
  PASS_REPLAY      a stored response hash-matches a byte-identical repeat
  CONTRACTUAL_ONLY the provider asserts identity and we cannot verify it
  FAIL             the model reads different tokens, a different model answers, or a different
                   amount of thinking happens
  INSUFFICIENT_EVIDENCE  could not be settled

A documentation sentence is THE PROVIDER'S WORD and caps at CONTRACTUAL_ONLY. Only a measurement,
or a structural argument that no request was ever sent, supports PASS_ABSOLUTE.

APPLY THE BAR AS WRITTEN. Do not paraphrase it into something broader. A sweep on 2026-08-17
failed an entry on the reasoning "a different mechanism decides what gets produced" — a sentence
that is not in the bar and is broader than it — and the demotion was itself overturned. A
restated standard is the same error as a paraphrased quote.
`

const PATTERNS = `
THE FIVE PATTERNS THAT HAVE ACTUALLY KILLED PASSES IN THIS REGISTER. You are hunting these
specifically, because they are what experience says is there.

P1 · A DOCUMENTATION SENTENCE DOING A STRUCTURAL ARGUMENT'S JOB.
   The deciding question is whether the request left the customer's machine. If it did and the
   provider says it discarded or deduplicated it, that is the provider's word — CONTRACTUAL_ONLY,
   however plainly the sentence reads. This demoted AWS SQS FIFO MessageDeduplicationId (id 190)
   from PASS_ABSOLUTE.

P2 · A CONTENT-BLIND KEY PRESENTED AS CONTENT-DERIVED.
   Deduplication keyed on a caller-supplied string cannot distinguish a true repeat from two
   different requests that collide. The failure mode is not overspending — it is the second
   caller silently receiving an answer to someone else's question. This failed BullMQ (id 189)
   and Sidekiq Enterprise Unique Jobs (id 216). Sidekiq is the subtle version: its key IS
   content-derived, over the wrong content, because the vendor's own guidance is to keep job args
   small and resolve the real request later.

P3 · A CONDITIONAL PASS WHOSE CONDITION THE MECHANISM DOES NOT ENFORCE.
   "Provided the implementation genuinely hashes the full request", "valid where the job is
   idempotent". If the condition is a property of the caller rather than of the mechanism, the
   pass is not structural. The register's answer is either to move the condition into the entry's
   NAME so it cannot be read wider (see id 187, id 220) or to fail it. An unscoped conditional
   pass is an overclaim.

P4 · VERIFYING THE NAMED PROJECT AND SKIPPING THE MANDATORY DEPENDENCY.
   PromptXRay's own two files were honest; every request it proxies is rebuilt by a pinned
   LiteLLM whose transform_request rewrites image_url, inlines fetched PDFs and strips
   cache_control. Failed at id 192. Ask what else is in the path.

P5 · THE CLAIM HAS GONE STALE.
   Most of these entries were adjudicated on 2026-08-09/10 and none of them carries a date in
   verifiedAgainst — they say "this session". Providers reprice, withdraw features and change
   minimums. A quote that was true in August may not be true today, 2026-08-18.
`

const RULES = `
HARD RULES.
1. You are READ-ONLY on /Users/angus/dev/token-spread. Do not write, edit, create or delete any
   file there, and do not run git. Read files freely. Your return value is JSON.
2. Today is 2026-08-18.
3. Fetch pricing and feature-comparison tables as RAW HTML. Markdown conversion silently drops
   table cells whose content is an icon, which produced a wrong verdict on claude.com/pricing.
4. If a cited tool or repository is load-bearing, check it exists and report stars and last push.
5. Quote verbatim or do not claim it.
`

const TRIAGE_SCHEMA = {
  type: 'object',
  required: ['assessments'],
  properties: {
    assessments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'suspicion', 'patterns', 'note'],
        properties: {
          id: { type: 'integer' },
          suspicion: { type: 'string', enum: ['clean', 'questionable', 'likely-wrong'] },
          patterns: { type: 'array', items: { type: 'string', enum: ['P1', 'P2', 'P3', 'P4', 'P5'] } },
          note: { type: 'string' },
          staleQuote: { type: 'boolean' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['id', 'verdict', 'reason'],
  properties: {
    id: { type: 'integer' },
    verdict: { type: 'string', enum: ['upheld', 'overturned'] },
    reason: { type: 'string' },
    proposedVerdict: { type: 'string', enum: ['PASS_ABSOLUTE', 'PASS_METADATA', 'PASS_SCHEDULING', 'PASS_REPLAY', 'CONTRACTUAL_ONLY', 'FAIL', 'INSUFFICIENT_EVIDENCE'] },
    proposedName: { type: 'string' },
  },
}

const IDS = args && args.length ? args : [
  11, 44, 66, 110, 143, 154, 165, 23, 45, 56, 166, 24, 68, 167, 29, 84, 117, 26, 81, 92, 114,
  125, 136, 147, 169, 27, 38, 60, 82, 126, 148, 159, 28, 39, 61, 83, 94, 105, 127, 138, 74, 118,
  173, 9, 42, 64, 75, 141, 152, 163, 10, 43, 76, 98, 120, 164, 175, 25, 36, 102, 124, 168, 176,
  177, 178, 183, 184, 194, 213,
]

const BATCH = 3
const batches = []
for (let i = 0; i < IDS.length; i += BATCH) batches.push(IDS.slice(i, i + BATCH))

phase('Triage')
log(IDS.length + ' never-challenged passes, ' + batches.length + ' triage batches')

const triaged = await pipeline(
  batches,
  (ids, _o, i) => agent(
    RULES + '\n' + BAR + '\n' + PATTERNS + '\n\n' +
    'These entries sit in the passing column of a register that sells itself on the passing column ' +
    'being small and true. NONE of them has ever been adversarially challenged. Two sweeps that ' +
    'did challenge proposed passes killed five of six, both times.\n\n' +
    'Read ' + FILE + ' — a JSON array of all 69. Work ONLY on ids ' + ids.join(', ') + '.\n\n' +
    'For each, decide how much it deserves a full refutation. You are triaging, not delivering a ' +
    'final verdict: check the reasoning against the five patterns, and spot-check the source if ' +
    'the entry names one, especially where the claim is a price, a threshold or a minimum that ' +
    'could have moved since August.\n\n' +
    'clean = the structural argument holds and no pattern applies.\n' +
    'questionable = a pattern plausibly applies, or the source needs a real re-read.\n' +
    'likely-wrong = you can already see the flaw.\n\n' +
    'Be honest in BOTH directions. Calling everything questionable is as useless as calling ' +
    'everything clean — it just moves the work without doing any. In note, say what you actually ' +
    'checked.',
    { label: 'triage:' + ids.join(','), phase: 'Triage', schema: TRIAGE_SCHEMA },
  ),
)

const assessments = triaged.filter(Boolean).flatMap((t) => t.assessments || [])
const flagged = assessments.filter((a) => a.suspicion !== 'clean')
const counts = assessments.reduce((m, a) => ({ ...m, [a.suspicion]: (m[a.suspicion] || 0) + 1 }), {})
log('triage: ' + JSON.stringify(counts))
log(flagged.length + ' entries escalated to two refuters each')

phase('Refute')
const refutations = await parallel(
  flagged.flatMap((a) => [0, 1].map((n) => () =>
    agent(
      RULES + '\n' + BAR + '\n' + PATTERNS + '\n\n' +
      'REFUTE the verdict on entry id ' + a.id + '. Read it in ' + FILE + '.\n\n' +
      'Triage flagged it "' + a.suspicion + '"' +
      (a.patterns.length ? ' against pattern(s) ' + a.patterns.join(', ') : '') +
      ' and said: ' + a.note + '\n\n' +
      (n === 0
        ? 'YOUR LENS — MECHANISM. Does the structural argument actually hold, or does it hold only ' +
          'under a condition the mechanism does not enforce? Did the request leave the customer ' +
          'machine? Is any key content-blind? Is a dependency in the path doing unexamined work?'
        : 'YOUR LENS — SOURCE, TODAY. Re-fetch what the entry cites and check the quote verbatim ' +
          'against the page as it reads on 2026-08-18. These entries were adjudicated around ' +
          '2026-08-09 and carry no date in verifiedAgainst. Has the price, threshold, minimum or ' +
          'feature moved? Does the source still say what the entry says it says? Does it exist?') +
      '\n\nDefault to UPHELD. This register would rather keep a true pass than lose one to a ' +
      'clever argument — but it would far rather demote a false pass than publish it. Overturn ' +
      'when you can quote the thing that decides it.\n\n' +
      'If the right answer is a NARROWER pass rather than a demotion, say so in proposedName — ' +
      'moving the scope into the entry title is this register\'s established remedy (ids 187, 220).',
      { label: 'refute' + (n + 1) + ':id-' + a.id, phase: 'Refute', schema: VERDICT_SCHEMA },
    ),
  )),
)

const rv = refutations.filter(Boolean)
const byId = {}
for (const r of rv) (byId[r.id] = byId[r.id] || []).push(r)
const killed = Object.entries(byId).filter(([, v]) => v.filter((x) => x.verdict === 'overturned').length >= 2)
const wounded = Object.entries(byId).filter(([, v]) => v.filter((x) => x.verdict === 'overturned').length === 1)
log(killed.length + ' passes refuted by both · ' + wounded.length + ' by one of two')

phase('Synthesis')
const synthesis = await agent(
  RULES + '\n\n' +
  'You are summarising an audit of a register\'s passing column. 69 entries that had never been ' +
  'adversarially challenged were triaged, and the suspicious ones were attacked by two ' +
  'independent refuters.\n\n' +
  'TRIAGE:\n' + JSON.stringify(assessments, null, 1) + '\n\n' +
  'REFUTATIONS:\n' + JSON.stringify(rv, null, 1) + '\n\n' +
  'Answer, in prose, under 600 words:\n' +
  '1. What is the passing column actually worth? Give the number that survives and the number ' +
  'that does not, and do not round either in the register\'s favour.\n' +
  '2. Which of the five patterns turned out to be most common, and what does that say about how ' +
  'this register makes mistakes?\n' +
  '3. Which entries were upheld in a way that makes them STRONGER than before — attacked and ' +
  'survived is worth more than never attacked.\n' +
  '4. What did this audit fail to check, and what would settle it?\n' +
  'A synthesis that congratulates the register has not looked.',
  { label: 'synthesis', phase: 'Synthesis' },
)

return { assessments, refutations: rv, killed: killed.map(([id]) => Number(id)), wounded: wounded.map(([id]) => Number(id)), synthesis }
