export const meta = {
  name: 'tiebreak-splits',
  description: 'Break the six 1-1 splits from the passing-column audit, and say whether the reasoning generalises',
  phases: [{ title: 'Tiebreak', detail: 'a third judge per split, holding both prior arguments' }],
}

const FILE = '/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/scratchpad/standing-passes.json'
const AUDIT = '/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/tasks/wcqdxj1hp.output'

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

APPLY THE BAR AS WRITTEN. Do not broaden it. An entry was wrongly failed on 2026-08-17 for
"a different mechanism decides what gets produced" — not in the bar — and that demotion was
itself overturned.
`

const RULES = `
READ-ONLY on /Users/angus/dev/token-spread — do not write, edit or run git. Today is 2026-08-18.
Fetch pricing and comparison tables as RAW HTML; markdown conversion drops icon-only cells.
Quote verbatim or do not claim it.
`

const SCHEMA = {
  type: 'object',
  required: ['id', 'verdict', 'reason', 'generalises'],
  properties: {
    id: { type: 'integer' },
    verdict: { type: 'string', enum: ['PASS_ABSOLUTE', 'PASS_METADATA', 'PASS_SCHEDULING', 'PASS_REPLAY', 'CONTRACTUAL_ONLY', 'FAIL', 'INSUFFICIENT_EVIDENCE'] },
    reason: { type: 'string' },
    proposedName: { type: 'string' },
    generalises: { type: 'string' },
    generalisesToIds: { type: 'array', items: { type: 'integer' } },
  },
}

const SPLITS = [
  { id: 92, note: 'Responses API previous_response_id / server-side conversation state.' },
  { id: 126, note: 'Native budget alerts and hard spend caps (org + workspace level).' },
  { id: 39, note: 'Conditional-write claim/revert state machine for exactly-once batch submission.' },
  {
    id: 164,
    note: 'Anthropic explicit cache_control breakpoints — write/read pricing. THIS IS THE REGISTER\'S ' +
      'CENTRAL LEVER and the mechanism the product is built on. Decide it on the merits exactly as ' +
      'you would any other entry. Do not shade it either way because it matters; a register that ' +
      'protects its favourite entry is worth nothing. But DO be explicit in generalises about ' +
      'whether your reasoning applies to the other ~38 PASS_METADATA entries resting on the same ' +
      'Anthropic caching documentation, because if it does, this decision is not about one row.',
  },
  { id: 176, note: 'Zero-output refusals are not billed (Anthropic, from 2026-06-02).' },
  { id: 177, note: 'Sonnet 5 introductory pricing became the standard price.' },
]

phase('Tiebreak')
const out = await parallel(
  SPLITS.map((s) => () =>
    agent(
      RULES + '\n' + BAR + '\n\n' +
      'You are the deciding judge on a 1-1 split. Two independent refuters examined register entry ' +
      'id ' + s.id + '; one upheld its verdict and one overturned it. Nobody broke the tie.\n\n' +
      'ENTRY: ' + s.note + '\n\n' +
      'Read the entry in ' + FILE + ' (JSON array, find id ' + s.id + ').\n' +
      'Read BOTH prior arguments in ' + AUDIT + ' — the JSON has .result.refutations, an array; ' +
      'take the objects where .id == ' + s.id + '. Also look at .result.assessments for the triage ' +
      'note on that id.\n\n' +
      'The question at the centre of every one of these splits is the same: is a provider\'s ' +
      'documentation sentence being treated as structural proof? The register\'s rule says that ' +
      'caps at CONTRACTUAL_ONLY. The counter-argument is that some of these are genuinely ' +
      'structural — the request never leaves the customer\'s machine, or the field is one the ' +
      'model demonstrably never reads.\n\n' +
      'Do your own verification. Do not just weigh the two arguments against each other — go to ' +
      'the source and decide. Give the verdict you would defend in public.\n\n' +
      'In `generalises`, say plainly whether your reasoning applies to other entries in this ' +
      'register and roughly which — a decision that quietly implies twenty other rows are wrong ' +
      'needs to say so out loud.',
      { label: 'tiebreak:id-' + s.id, phase: 'Tiebreak', schema: SCHEMA },
    ),
  ),
)

const decided = out.filter(Boolean)
log('decided ' + decided.length + '/6')
for (const d of decided) log('id ' + d.id + ' → ' + d.verdict)
return { decided }
