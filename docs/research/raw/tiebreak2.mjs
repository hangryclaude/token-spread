export const meta = {
  name: 'tiebreak-round-2',
  description: 'Decide the ten 1-1 splits, and re-examine id 164 on evidence that arrived after its demotion',
  phases: [{ title: 'Decide', detail: 'a third judge each, holding both prior arguments' }],
}

const UNATTACKED = '/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/scratchpad/unattacked-passes.json'
const AUDIT2 = '/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/tasks/wnbrle97h.output'
const REPO = '/Users/angus/dev/token-spread'

const BAR = [
  'THE BAR, verbatim: does the model read a different sequence of tokens, does a different model',
  'answer, or does a different amount of thinking happen? If yes, FAIL.',
  '',
  '  PASS_ABSOLUTE    nothing on the wire changed',
  '  PASS_METADATA    only a field the model never reads changed',
  '  PASS_SCHEDULING  only *when* the request was sent changed',
  '  PASS_REPLAY      a stored response hash-matches a byte-identical repeat',
  '  CONTRACTUAL_ONLY the provider asserts identity and we cannot verify it',
  '  FAIL / INSUFFICIENT_EVIDENCE',
  '',
  "A documentation sentence is THE PROVIDER'S WORD and caps at CONTRACTUAL_ONLY. Only a",
  'measurement, or a structural argument that no request was ever sent, supports PASS_ABSOLUTE.',
  '',
  'APPLY THE BAR AS WRITTEN. Do not broaden it, and do not over-correct: an entry was wrongly',
  'failed for "a different mechanism decides what gets produced", a sentence not in the bar, and',
  'that demotion was itself overturned.',
].join('\n')

const RULES = [
  'HARD RULES.',
  '1. READ-ONLY on ' + REPO + '. Do not write, edit or run git. Read files freely.',
  '2. Today is 2026-08-18.',
  '3. Fetch pricing and comparison tables as RAW HTML; markdown conversion drops icon-only cells.',
  '4. Quote verbatim or do not claim it. If an entry quotes a source, GREP THE LIVE PAGE for that',
  '   exact string and report hit counts, including a control phrase you expect to find so a zero',
  '   result cannot be confused with a broken fetch. Five entries have already been caught this',
  '   week quoting text that is not on the page they cite, one of them inverted.',
].join('\n')

const SCHEMA = {
  type: 'object',
  required: ['id', 'verdict', 'reason'],
  properties: {
    id: { type: 'integer' },
    verdict: { type: 'string', enum: ['PASS_ABSOLUTE', 'PASS_METADATA', 'PASS_SCHEDULING', 'PASS_REPLAY', 'CONTRACTUAL_ONLY', 'FAIL', 'INSUFFICIENT_EVIDENCE'] },
    reason: { type: 'string' },
    proposedName: { type: 'string' },
  },
}

const SPLITS = [11, 25, 42, 81, 83, 94, 114, 136, 154, 166]

phase('Decide')
log(SPLITS.length + ' splits to decide, plus a re-examination of id 164')

const decided = await parallel([
  ...SPLITS.map((id) => () =>
    agent(
      RULES + '\n' + BAR + '\n\n' +
      'You are the deciding judge on a 1-1 split. Two independent refuters examined register entry ' +
      'id ' + id + '; one upheld its verdict and one overturned it.\n\n' +
      'Read the entry in ' + UNATTACKED + ' (JSON array, find id ' + id + ').\n' +
      'Read both prior arguments in ' + AUDIT2 + ' — the JSON has .result.refutations, an array of ' +
      'objects; take the ones where .id == ' + id + '.\n\n' +
      'Do your own verification. Do not merely weigh the two arguments — go to the source and ' +
      'decide. Give the verdict you would defend in public.\n\n' +
      'If one of the refuters alleged a quote is not in its source, CHECK THAT YOURSELF FIRST, with ' +
      'a control phrase. A fabricated or inverted quote is the most serious defect available here ' +
      'and it decides the entry regardless of whether the underlying mechanism is sound.\n\n' +
      'If the honest answer is a narrower pass rather than a demotion, give the narrower title in ' +
      "proposedName — moving scope into the name is this register's established remedy.",
      { label: 'decide:id-' + id, phase: 'Decide', schema: SCHEMA },
    ),
  ),
  () =>
    agent(
      RULES + '\n' + BAR + '\n\n' +
      'RE-EXAMINE register entry id 164 — Anthropic explicit cache_control breakpoints. It is the ' +
      "register's central lever and the mechanism this product is built on.\n\n" +
      'HISTORY. On 2026-08-18 it was demoted from PASS_METADATA to CONTRACTUAL_ONLY by a tiebreak ' +
      'judge, on this argument: the entry claimed cache_control sits outside the content string and ' +
      'is therefore not read by the model, and the judge answered that `role` is a same-schema ' +
      'counterexample — a field outside the content string that the model demonstrably does read — ' +
      'so position in the request JSON proves nothing.\n\n' +
      'NEW EVIDENCE, arriving after that ruling. Several independent refuters examining sibling ' +
      'entries rejected that counterexample as non-transferring, on the ground that `role` IS ' +
      'rendered into the tokenized prompt by the chat template — which is precisely why the model ' +
      'reads it — whereas cache_control is never concatenated into any text field and is consumed ' +
      'by an infrastructure-side prefix-hash lookup before tokenization. They argue that is a ' +
      'structural distinction, not a positional one.\n\n' +
      'Read the entry and its 2026-08-18 correction in ' + REPO + '/docs/research/ (it is in one of ' +
      'the cohort JSON files listed in docs/research/cohorts.json), and the audit brief at ' +
      REPO + '/docs/research/2026-08-18-passing-column-audit.md. Read the sibling arguments in ' +
      AUDIT2 + '.\n\n' +
      'Then decide, on the merits, what verdict id 164 should carry. The demotion may have been ' +
      'right, or it may have been an over-correction. Both are live possibilities and this register ' +
      'has made both errors this week. Say which, and why, with sources you checked yourself.\n\n' +
      'Be explicit about the thing that actually decides it: is there any customer-side way to ' +
      'establish that cache_control does not enter the tokenized prompt, or does that rest on ' +
      "Anthropic's word? If it rests on their word, CONTRACTUAL_ONLY is correct however sound the " +
      'mechanism sounds.',
      { label: 'reexamine:id-164', phase: 'Decide', schema: SCHEMA },
    ),
])

const out = decided.filter(Boolean)
for (const d of out) log('id ' + d.id + ' → ' + d.verdict)
return { decided: out }
