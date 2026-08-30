export const meta = {
  name: 'finish-passing-column-audit',
  description: 'Attack the 33 passes that triage cleared without ever attacking, so every pass in the register has faced two refuters',
  phases: [
    { title: 'Refute', detail: 'two independent lenses on each of the 33' },
    { title: 'Synthesis', detail: 'what the passing column is worth once every row has been tested' },
  ],
}

const FILE = '/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/scratchpad/unattacked-passes.json'

const BAR = `
THE BAR, verbatim: does the model read a different sequence of tokens, does a different model
answer, or does a different amount of thinking happen? If yes, FAIL.

  PASS_ABSOLUTE    nothing on the wire changed
  PASS_METADATA    only a field the model never reads changed
  PASS_SCHEDULING  only *when* the request was sent changed
  PASS_REPLAY      a stored response hash-matches a byte-identical repeat
  CONTRACTUAL_ONLY the provider asserts identity and we cannot verify it
  FAIL / INSUFFICIENT_EVIDENCE

A documentation sentence is THE PROVIDER'S WORD and caps at CONTRACTUAL_ONLY. Only a measurement,
or a structural argument that no request was ever sent, supports PASS_ABSOLUTE.

APPLY THE BAR AS WRITTEN — do not broaden it. An entry was wrongly failed for "a different
mechanism decides what gets produced", a sentence not in the bar, and that demotion was itself
overturned. Over-correction is a failure too.
`

const PATTERNS = `
THE SIX PATTERNS THAT HAVE KILLED PASSES IN THIS REGISTER. P6 is new, found on 2026-08-18, and it
is the one most likely to apply here.

P1 · A DOCUMENTATION SENTENCE DOING A STRUCTURAL ARGUMENT'S JOB.
   The deciding question: did the request leave the customer's machine? If it did and the provider
   says it discarded, deduplicated or declined to bill it, that is the provider's word.
   Demoted ids 36, 92, 159, 176, 177, 178, 190.

P2 · A CONTENT-BLIND KEY PRESENTED AS CONTENT-DERIVED. Killed ids 189, 216.

P3 · A CONDITIONAL PASS WHOSE CONDITION THE MECHANISM DOES NOT ENFORCE. Killed ids 138, 188.
   The remedy, where the narrow claim is genuinely true, is to move the condition into the entry's
   NAME so it cannot be read wider — see ids 187, 220, 102, 125, 126.

P4 · VERIFYING THE NAMED PROJECT AND SKIPPING THE MANDATORY DEPENDENCY. Killed id 192.

P5 · THE CLAIM HAS GONE STALE. These entries were adjudicated around 2026-08-09 and most carry no
   date in verifiedAgainst — they say "this session". Prices, thresholds, minimums and issue
   states move. Eleven stale citations were found on 2026-08-18.

P6 · "IT SITS OUTSIDE THE CONTENT STRING, THEREFORE THE MODEL DOES NOT READ IT."
   This argument is INVALID and it demoted the register's central entry, id 164 (cache_control),
   on 2026-08-18. The counterexample is in the same schema: 'role' sits outside the content string
   and the model demonstrably reads it. Position in the request JSON proves nothing about
   visibility. An entry may still be a genuine PASS_METADATA — but it needs a reason better than
   where the field sits, and if the only support is the provider saying the model ignores it, that
   is P1 and caps at CONTRACTUAL_ONLY.

   NINE of the entries in this batch were named by that judge as resting on this exact argument:
   ids 10, 11, 42, 60, 61, 68, 83, 166, 173. If you are given one of those, P6 is your first test.
   Do not assume it fails — the judge was explicit that some may have a stronger basis it never
   checked. Go and find out which.
`

const RULES = `
HARD RULES.
1. READ-ONLY on /Users/angus/dev/token-spread. Do not write, edit, create or delete any file
   there, and do not run git. Read files freely. Your return value is JSON.
2. Today is 2026-08-18.
3. Fetch pricing and feature-comparison tables as RAW HTML. Markdown conversion silently drops
   cells whose content is an icon; that produced a wrong verdict on claude.com/pricing.
4. If a tool or repository is load-bearing, check it exists and report stars and last push. Four
   entries were expelled in August for citing zero-star repos, one of which did not exist.
5. Quote verbatim or do not claim it. On 2026-08-18 an entry was found presenting two phrases in
   quotation marks that returned ZERO hits in the page it cited, under the words "Independently
   verified this session". If an entry quotes a source, GREP THE LIVE PAGE FOR THAT STRING.
`

const SCHEMA = {
  type: 'object',
  required: ['id', 'verdict', 'reason', 'quoteCheck'],
  properties: {
    id: { type: 'integer' },
    verdict: { type: 'string', enum: ['upheld', 'overturned'] },
    reason: { type: 'string' },
    proposedVerdict: { type: 'string', enum: ['PASS_ABSOLUTE', 'PASS_METADATA', 'PASS_SCHEDULING', 'PASS_REPLAY', 'CONTRACTUAL_ONLY', 'FAIL', 'INSUFFICIENT_EVIDENCE'] },
    proposedName: { type: 'string' },
    patterns: { type: 'array', items: { type: 'string' } },
    quoteCheck: { type: 'string', enum: ['verified-verbatim', 'no-quote-to-check', 'source-unreachable', 'QUOTE-NOT-IN-SOURCE'] },
  },
}

const IDS = [10, 11, 24, 25, 26, 29, 42, 45, 60, 61, 68, 75, 76, 81, 83, 94, 105, 110, 114, 117, 120, 136, 143, 147, 154, 165, 166, 167, 173, 183, 184, 194, 213]

phase('Refute')
log(IDS.length + ' passes never attacked — two refuters each, ' + IDS.length * 2 + ' agents')

const out = await parallel(
  IDS.flatMap((id) => [0, 1].map((n) => () =>
    agent(
      RULES + '\n' + BAR + '\n' + PATTERNS + '\n\n' +
      'REFUTE the verdict on register entry id ' + id + '. Read it in ' + FILE + ' (a JSON array; ' +
      'find the object whose id is ' + id + ').\n\n' +
      'This entry sits in the passing column of a register that sells itself on that column being ' +
      'small and true. It has NEVER been adversarially challenged — an earlier triage pass cleared ' +
      'it without attacking it. On 2026-08-18 the entries that WERE attacked lost twelve of ' +
      'thirty-six. You are the first real test this one has had.\n\n' +
      (n === 0
        ? 'YOUR LENS — MECHANISM. Does the structural argument hold as a fact about the mechanism, ' +
          'or only under a condition the mechanism does not enforce? Did the request leave the ' +
          'customer machine? Is any key content-blind? Is a dependency in the path doing unexamined ' +
          'work? If the argument is "the field sits outside the content string", apply P6.'
        : 'YOUR LENS — SOURCE, TODAY. Fetch what the entry cites and check every quoted string ' +
          'verbatim against the page as it reads on 2026-08-18. Grep for the exact strings; report ' +
          'hit counts, and include a control phrase you expect to find so a zero result cannot be ' +
          'confused with a broken fetch. Has a price, threshold, minimum, issue state or feature ' +
          'moved since roughly 2026-08-09? Does the source exist at all?') +
      '\n\nDefault to UPHELD. This register would rather keep a true pass than lose one to a clever ' +
      'argument — and would far rather demote a false pass than publish it. Overturn when you can ' +
      'quote the thing that decides it.\n\n' +
      'If the honest answer is a NARROWER pass rather than a demotion, give the narrower title in ' +
      'proposedName and leave the verdict upheld — that is this register\'s established remedy.\n\n' +
      'Set quoteCheck to QUOTE-NOT-IN-SOURCE only if you grepped the live page and an entry\'s ' +
      'quoted string genuinely is not there. That is the most serious finding available to you.',
      { label: 'refute' + (n + 1) + ':id-' + id, phase: 'Refute', schema: SCHEMA },
    ),
  )),
)

const rv = out.filter(Boolean)
const byId = {}
for (const r of rv) (byId[r.id] = byId[r.id] || []).push(r)
const both = Object.entries(byId).filter(([, v]) => v.filter((x) => x.verdict === 'overturned').length >= 2)
const one = Object.entries(byId).filter(([, v]) => v.filter((x) => x.verdict === 'overturned').length === 1)
const fabricated = rv.filter((r) => r.quoteCheck === 'QUOTE-NOT-IN-SOURCE')
log(both.length + ' overturned by both · ' + one.length + ' by one of two · ' + (IDS.length - both.length - one.length) + ' survived clean')
if (fabricated.length) log('QUOTE NOT IN SOURCE on ids: ' + [...new Set(fabricated.map((f) => f.id))].join(', '))

phase('Synthesis')
const synthesis = await agent(
  RULES + '\n\n' +
  'Every pass in this register has now faced two independent refuters. Earlier today 36 entries ' +
  'were attacked and 12 were withdrawn; these are the remaining 33, which a triage pass had ' +
  'cleared without attacking.\n\n' +
  'RESULTS:\n' + JSON.stringify(rv, null, 1) + '\n\n' +
  'Answer in prose, under 600 words:\n' +
  '1. How many of these 33 hold, and how many do not? Do not round in the register\'s favour.\n' +
  '2. P6 — "it sits outside the content string, therefore the model does not read it" — was ' +
  'predicted to be the dominant failure here, and nine entries were named in advance. What ' +
  'actually happened to those nine, and was the prediction right?\n' +
  '3. Did any entry quote a source that does not contain the quote? Name it.\n' +
  '4. Now that every pass has been tested once: what is the honest characterisation of this ' +
  'register\'s passing column, in a sentence a sceptical customer would accept?\n' +
  '5. What still has not been done?\n' +
  'A synthesis that congratulates the register has not looked.',
  { label: 'synthesis', phase: 'Synthesis' },
)

return { refutations: rv, killedBoth: both.map(([id]) => Number(id)), killedOne: one.map(([id]) => Number(id)), fabricated, synthesis }
