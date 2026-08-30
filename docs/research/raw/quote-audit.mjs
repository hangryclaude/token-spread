export const meta = {
  name: 'quote-integrity-sweep',
  description: 'Grep every quoted string in the register against the source it cites',
  phases: [
    { title: 'Grep', detail: 'batches of four entries; every quoted string checked against a live fetch' },
    { title: 'Report', detail: 'what the sweep found, and whether it found the seeded controls' },
  ],
}

const FILE = '/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/scratchpad/quote-audit.json'

const RULES = [
  'HARD RULES.',
  '1. READ-ONLY on /Users/angus/dev/token-spread. Do not write, edit or run git. Your return',
  '   value is JSON.',
  '2. Today is 2026-08-18.',
  '3. Fetch every page as RAW HTML with curl, not through a markdown converter. Conversion drops',
  '   icon-only table cells and reflows text, which produces false negatives on a quote check.',
  '4. ALWAYS report a control phrase. Pick a short string you are confident appears on the page',
  '   (a heading, the product name), grep for it, and report its hit count alongside the quote',
  '   results. A zero hit count on a quote means nothing if the fetch itself failed, and this is',
  '   the only way to tell those apart.',
  '5. Report what you find. Do not repair anything, do not soften anything, and do not assume a',
  '   quote is fine because the claim around it sounds plausible.',
].join('\n')

const CONTEXT = [
  'WHY THIS EXISTS. This register adjudicates whether a cost technique changes what a model reads,',
  'and its entire value is that its citations are real. In one week five entries were caught',
  'presenting text in quotation marks that is not in the page they cite:',
  '',
  '  id 74   two phrases, zero hits, under the words "Independently verified this session"',
  '  id 164  four fragments, zero hits, under "Directly confirmed this session"',
  '  id 60   zero hits on the cited page and on two other candidate pages',
  '  id 166  a splice: two bullets from different sections welded into one sentence',
  '  id 114  inverted: cited AWS as restricting eligibility when AWS expanded it',
  '',
  'All five were found by accident, by reviewers who happened to be reading those entries for',
  'another reason. Nobody has ever checked the rest. That is this job.',
  '',
  'THE FOUR OUTCOMES, and the distinctions matter:',
  '  verbatim   the string appears exactly as quoted. Report the hit count.',
  '  reflowed   the words are present and the meaning is intact, but the exact string does not',
  '             match — a line break, an inline link splitting the sentence, a curly vs straight',
  '             apostrophe, or the page renders it across two elements. NOT a defect; say so.',
  '  spliced    the words all appear on the page but not contiguously — two sentences joined, a',
  '             clause dropped from the middle, or fragments from different sections welded',
  '             together. This IS a defect: it presents as one quotation something the source',
  '             never said as one.',
  '  absent     the string is not on the page in any form. Check for it elsewhere on the same',
  '             site before concluding, and say where you looked.',
  '  inverted   the source says the opposite of what the entry uses the quote to establish. The',
  '             most serious outcome available, because the citation is not merely unsupported',
  '             but actively misleading.',
].join('\n')

const SCHEMA = {
  type: 'object',
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'sourceFetched', 'controlPhrase', 'controlHits', 'quotes'],
        properties: {
          id: { type: 'integer' },
          sourceFetched: { type: 'string' },
          fetchOk: { type: 'boolean' },
          controlPhrase: { type: 'string' },
          controlHits: { type: 'integer' },
          quotes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['quote', 'outcome'],
              properties: {
                quote: { type: 'string' },
                outcome: { type: 'string', enum: ['verbatim', 'reflowed', 'spliced', 'absent', 'inverted', 'source-unreachable', 'not-a-source-quote'] },
                hits: { type: 'integer' },
                note: { type: 'string' },
              },
            },
          },
          worstOutcome: { type: 'string' },
        },
      },
    },
  },
}

/* args can arrive as a JSON-encoded string rather than an array; a string has .length and
   .slice, so an unparsed one batches into substrings and every agent dies on ids.join. */
const IDS = typeof args === 'string' ? JSON.parse(args) : (Array.isArray(args) && args.length ? args : null)
if (IDS && !Array.isArray(IDS)) throw new Error('args did not resolve to an array of ids')

phase('Grep')

const BATCHES = []
{
  const ids = IDS || [
    0, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
    29, 30, 31, 32, 33, 34, 35, 36, 37, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
    55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78,
    79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 93, 94, 95, 96, 97, 98, 99, 100, 101, 103,
    104, 105, 106, 107, 108, 109, 111, 112, 113,
  ]
  for (let i = 0; i < ids.length; i += 4) BATCHES.push(ids.slice(i, i + 4))
}

log(BATCHES.length + ' batches')

const out = await pipeline(
  BATCHES,
  (ids) => agent(
    RULES + '\n\n' + CONTEXT + '\n\n' +
    'Read ' + FILE + ' — a JSON array of register entries, each with an id, its verifiedAgainst ' +
    'source, and a quotes array of every quoted string found in its text.\n\n' +
    'Work ONLY on these ids: ' + ids.join(', ') + '. Some of them may not be present in the file; ' +
    'skip any that are not, and do not substitute others.\n\n' +
    'For each entry: fetch the source named in verifiedAgainst as raw HTML, grep for your control ' +
    'phrase, then grep for each quoted string and classify it. Where several entries cite the same ' +
    'page, fetch it once and reuse it.\n\n' +
    'Some quoted strings will not be quotations from the source at all — they are the register ' +
    'quoting its own vocabulary, a verdict name, a field name, or a phrase from its own rubric. ' +
    'Classify those not-a-source-quote and move on; they are not defects.\n\n' +
    'Set worstOutcome to the most serious outcome among that entry\'s quotes, using the order ' +
    'verbatim < reflowed < not-a-source-quote < source-unreachable < spliced < absent < inverted.',
    { label: 'grep:' + ids[0] + '-' + ids[ids.length - 1], phase: 'Grep', schema: SCHEMA },
  ),
)

const results = out.filter(Boolean).flatMap((r) => r.results || [])
const bad = results.filter((r) => ['spliced', 'absent', 'inverted'].includes(r.worstOutcome))
const unreachable = results.filter((r) => r.fetchOk === false || r.controlHits === 0)
log(results.length + ' entries checked · ' + bad.length + ' carrying a defective quote · ' + unreachable.length + ' with a failed or suspect fetch')
if (bad.length) log('defective: ' + bad.map((b) => b.id + '(' + b.worstOutcome + ')').join(', '))

phase('Report')
const report = await agent(
  RULES + '\n\n' +
  'You are reporting a quote-integrity sweep over a research register. Every quoted string in ' +
  'these entries was grepped against the source the entry cites.\n\n' +
  'RESULTS:\n' + JSON.stringify(results, null, 1) + '\n\n' +
  'CONTROL. Four entries in this batch were already known to carry defective quotes before the ' +
  'sweep ran: ids 74, 164, 60 and 166. The agents were not told which. If the sweep did NOT flag ' +
  'those four, the sweep is unreliable and that is the most important thing in your report — say ' +
  'it first and plainly, and do not report a clean bill of health on an instrument that missed ' +
  'its own controls.\n\n' +
  'Then answer:\n' +
  '1. How many entries carry a defective quote — absent, spliced or inverted — and which?\n' +
  '2. What is the defect rate among entries whose quotes could actually be checked? State the ' +
  'denominator; entries whose source could not be fetched are not passes.\n' +
  '3. Is there a pattern — particular sources, particular kinds of claim, particular vintages?\n' +
  '4. What did this sweep fail to cover?\n' +
  'Under 500 words, and do not congratulate anyone.',
  { label: 'report', phase: 'Report' },
)

return { results, defective: bad, unreachable, report }
