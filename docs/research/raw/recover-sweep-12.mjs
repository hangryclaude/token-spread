export const meta = {
  name: 'recover-sweep-12',
  description: 'Re-read the sources for the 13 entries sweep 12 adjudicated and never merged, then refute the ones that pass',
  phases: [
    { title: 'Verify', detail: 'one agent per stranded entry: re-fetch its source, confirm or correct the quote' },
    { title: 'Refute', detail: 'attack every entry proposed as a pass' },
    { title: 'Critic', detail: 'what did the recovery miss' },
  ],
}

const BAR = `
THE BAR — one question decides every entry: does the model read a different sequence of tokens,
does a different model answer, or does a different amount of thinking happen? If yes it is FAIL —
a changed product sold as a saving.

  PASS_ABSOLUTE    nothing on the wire changed
  PASS_METADATA    only a field the model never reads changed
  PASS_SCHEDULING  only *when* the request was sent changed
  PASS_REPLAY      a stored response hash-matches a byte-identical repeat
  CONTRACTUAL_ONLY the provider asserts identity and we cannot verify it
  FAIL             the model reads different tokens, a different model answers, or a different
                   amount of thinking happens
  INSUFFICIENT_EVIDENCE  we could not settle it, and say so rather than guessing

A documentation sentence is THE PROVIDER'S WORD, however clearly it reads, and caps at
CONTRACTUAL_ONLY. Only a measurement or a structural argument — no output was generated, no
request was ever sent — supports PASS_ABSOLUTE.

Scope is the hosted-API customer of a frontier LLM provider.
`

const RULES = `
HARD RULES.
1. You are READ-ONLY on /Users/angus/dev/token-spread. Do not write, edit, create or delete any
   file there, and do not run git. Your return value is JSON and nothing else. This is not
   advisory — an agent that edits the repo corrupts a register that is mid-merge.
2. Today is 2026-08-17. Fetch the source. Do not trust the quote you are given: sweep 12 itself
   caught a finding whose "quote" was a paraphrase dressed up in quotation marks.
3. verifiedAgainst MUST contain an ISO date (YYYY-MM-DD). Use 2026-08-17 for the day you read
   it. If the page states its own revision date, put that first, then the read date.
4. If the quote no longer matches the page, that is a finding, not an obstacle. Report it in
   quoteStillAccurate:false with what the page says now.
5. Write reasoning the way the register writes it: the mechanism at the level of what the model
   reads, then the quote that decided it, then the condition under which it stops holding. Name
   the trap. Do not pad.
`

const ENTRY_SCHEMA = {
  type: 'object',
  required: ['name', 'strictVerdict', 'reasoning', 'savings', 'provenance', 'telemetrySignal', 'providers', 'verifiedAgainst', 'quoteStillAccurate'],
  properties: {
    name: { type: 'string' },
    strictVerdict: { type: 'string', enum: ['PASS_ABSOLUTE', 'PASS_METADATA', 'PASS_SCHEDULING', 'PASS_REPLAY', 'CONTRACTUAL_ONLY', 'FAIL', 'INSUFFICIENT_EVIDENCE'] },
    reasoning: { type: 'string' },
    savings: { type: 'string' },
    provenance: { type: 'string' },
    telemetrySignal: { type: 'string' },
    providers: { type: 'array', items: { type: 'string' } },
    verifiedAgainst: { type: 'string' },
    trap: { type: 'string' },
    settlingExperiment: { type: 'string' },
    quoteStillAccurate: { type: 'boolean' },
    quoteNow: { type: 'string' },
    verdictChangedFromBrief: { type: 'boolean' },
    verdictChangeReason: { type: 'string' },
  },
}

const REFUTE_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    proposedVerdict: { type: 'string' },
  },
}

const STRANDED = [
  {
    label: 'k8s-cronjob',
    name: 'K8s CronJob concurrencyPolicy: Forbid/Replace',
    verdict: 'PASS_ABSOLUTE',
    quote: `kubernetes.io: "if it is time for a new Job run and the previous Job run hasn't finished yet, the CronJob skips the new Job run"`,
    note: `Time-overlap only — no content check. Passes only if the job is independently known idempotent.`,
    where: `kubernetes.io docs, CronJob concurrency policy`,
  },
  {
    label: 'bullmq',
    name: 'BullMQ job deduplication (Simple Mode)',
    verdict: 'PASS_ABSOLUTE',
    quote: `docs.bullmq.io: "any subsequent job with the same deduplication ID will be ignored"`,
    note: `taskforcesh/bullmq: reported 9,279 stars, MIT, pushed 2026-08-12. ID-gated, cleaner than the CronJob row. Confirm the star count and last-push date too — the register expelled four entries in August whose cited tools turned out to be zero-star repos.`,
    where: `docs.bullmq.io deduplication page, and the GitHub repo`,
  },
  {
    label: 'sqs-fifo',
    name: 'AWS SQS FIFO MessageDeduplicationId',
    verdict: 'PASS_ABSOLUTE',
    quote: `AWS docs: "If you retry the SendMessage action within the 5-minute deduplication interval, Amazon SQS doesn't introduce any duplicates into the queue."`,
    note: `Same mechanism family as BullMQ: an enqueue-time id stops a duplicate LLM call before it is ever sent.`,
    where: `docs.aws.amazon.com SQS FIFO exactly-once processing`,
  },
  {
    label: 'reservation-amortization',
    name: 'Reservation amortization (pure accounting)',
    verdict: 'PASS_ABSOLUTE',
    quote: `learn.microsoft.com: "Amortization is the process of breaking the one-time cost into periodic costs... available only for reservations and savings plans."`,
    note: `Nothing on the wire changes — recognition-timing only, applies to PTU reservations specifically. Be careful: this saves no money at all, it changes when a cost is recognised. Say that plainly in savings rather than implying a discount.`,
    where: `learn.microsoft.com cost management, amortization`,
  },
  {
    label: 'grpc-retry-throttling',
    name: 'gRPC retry throttling (token-bucket retry budget)',
    verdict: 'PASS_SCHEDULING',
    quote: `grpc.io: token_count/maxTokens/tokenRatio mechanism, "retries are paused until the count recovers" below half of maxTokens`,
    note: `Two caveats the brief itself raised: (a) it is one client's aggregate retry budget, not the concurrent-caller thundering-herd problem register id 158 named; (b) Anthropic's and OpenAI's public APIs are HTTP, so this is only actionable behind a gRPC gateway the customer runs themselves. Both belong in the entry.`,
    where: `grpc.io retry policy / gRFC A6 documentation`,
  },
  {
    label: 'team-enterprise-seats',
    name: 'Team/Enterprise per-seat pricing as the sanctioned alternative to account sharing',
    verdict: 'CONTRACTUAL_ONLY',
    quote: `claude.com/pricing: Standard $20/mo annual, Premium $100/mo annual ("5x more usage"), Enterprise "$20/seat" plus API-rate usage`,
    note: `A procurement fact, not a request-identity technique — same cap class the register already applies to batch and PTU. Re-check every price; this is the kind of number that moves.`,
    where: `claude.com/pricing`,
  },
  {
    label: 'azure-ptu-exit',
    name: 'Azure PTU Reservations — exit and cancellation mechanics',
    verdict: 'CONTRACTUAL_ONLY',
    quote: `learn.microsoft.com (ms.date 2026-05-22): "Cancelable, with limits" table row; exchange page (ms.date 2026-07-22): $50,000/12-month cap, "no early termination fee... in the future there might be a 12% early termination fee"`,
    note: `A new angle on an already-registered base lever (register ids 103, 112) — the exit mechanics specifically were not covered. Put each page's own ms.date first in verifiedAgainst, then your read date.`,
    where: `learn.microsoft.com reservation cancellation and exchange pages`,
  },
  {
    label: 'bedrock-pt-no-exit',
    name: 'AWS Bedrock Provisioned Throughput has no exit',
    verdict: 'FAIL',
    quote: `docs.aws.amazon.com: "1 month – You can't delete the Provisioned Throughput until the one month commitment term is over... Billing continues until you delete the Provisioned Throughput."`,
    note: `REFUTED on its own thesis: no cancellation, no exchange, no resale. It is a bet, not a hedge. This belongs in the register precisely because it is a plausible-sounding premise closed by the provider's own words rather than by absence of search effort.`,
    where: `docs.aws.amazon.com Bedrock provisioned throughput`,
  },
  {
    label: 'no-ri-marketplace',
    name: 'No EC2-RI-Marketplace-style secondary market exists for LLM capacity',
    verdict: 'FAIL',
    quote: `docs.aws.amazon.com: "Only Amazon EC2 Standard regional and zonal Reserved Instances can be sold... Reserved Instances for other AWS services, such as Amazon RDS and Amazon ElastiCache, cannot be sold in the Reserved Instance Marketplace."`,
    note: `REFUTED structurally — Bedrock PT is not an EC2 RI product, so it is categorically outside this marketplace's own eligibility text.`,
    where: `docs.aws.amazon.com Reserved Instance Marketplace eligibility`,
  },
  {
    label: 'automation-carveout',
    name: 'Automated/non-human access ban — whether Claude Code satisfies the Consumer Terms Section 3 API-key carve-out',
    verdict: 'INSUFFICIENT_EVIDENCE',
    quote: `Consumer Terms Section 3 bars accessing the Services "through automated or non-human means, whether through a bot, script, or otherwise", "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it"`,
    note: `The brief flagged this as the submitter's inference from adjacent, individually-true quotes — no source states it explicitly. Keep it unresolved. What would settle it is an explicit Anthropic statement, not more doc-reading; say so in settlingExperiment. Re-fetch the Consumer Terms and quote Section 3 exactly.`,
    where: `anthropic.com/legal/consumer-terms`,
  },
  {
    label: 'kimi-cache',
    name: 'Moonshot/Kimi context caching — no output-invariance statement anywhere in the documentation',
    verdict: 'INSUFFICIENT_EVIDENCE',
    quote: `Kimi's documentation describes cache mechanism and threshold only, with zero output-invariance language`,
    note: `Thinner than Gemini's already-demoted analogous entry (register id 93). What would settle it is live temperature-0 diffs against their API — which this project cannot run, having no key. Say that.`,
    where: `platform.moonshot.cn / Kimi API context caching docs`,
  },
  {
    label: 'promptxray',
    name: 'PromptXRay (karminski) — read-only cache-hit diagnostic',
    verdict: 'INSUFFICIENT_EVIDENCE',
    quote: `The tool's "never rewrites" guarantee is its own self-description, not independently exercised against live traffic`,
    note: `Reported as 50 stars, MIT, active. VERIFY THE REPO EXISTS AND CHECK THE STAR COUNT — on 2026-08-12 this register expelled four entries from its passing column because their cited tools were zero-star repos and one could not be found at all. If the repo is gone or the numbers are wrong, say so; that is the single most valuable thing you can return.`,
    where: `github.com/karminski PromptXRay`,
  },
  {
    label: 'midterm-price-cut',
    name: 'Who captures a mid-term list-price decrease on committed-spend or PTU agreements',
    verdict: 'INSUFFICIENT_EVIDENCE',
    quote: `Anthropic's and Azure's rate-change clauses are quoted correctly, but "no doc says X" is not evidence that the answer is no`,
    note: `Could be silent because it is handled off-doc in account-team negotiation. Keep unresolved; settlingExperiment is an actual negotiation or a live price cut to test against.`,
    where: `anthropic.com/legal/commercial-terms and Azure reservation rate-change terms`,
  },
]

phase('Verify')
const verified = await pipeline(
  STRANDED,
  (s) => agent(
    RULES + '\n' + BAR + '\n\n' +
    'You are recovering ONE entry that the 2026-08-12 sweep of the token-spread register ' +
    'adjudicated and then never merged. It sat in a markdown brief for five days. Your job is to ' +
    're-read its source as of today and hand back a register entry that is true on 2026-08-17.\n\n' +
    'ENTRY: ' + s.name + '\n' +
    "THE BRIEF'S VERDICT: " + s.verdict + '\n' +
    "THE BRIEF'S QUOTE: " + s.quote + '\n' +
    "THE BRIEF'S NOTE: " + s.note + '\n' +
    'WHERE TO LOOK: ' + s.where + '\n\n' +
    'Fetch it. Confirm the quote verbatim or correct it. Then return the entry.\n\n' +
    "You may DISAGREE with the brief's verdict — set verdictChangedFromBrief and explain. The " +
    "register's value is that its passing column is small and survives attack, so a demotion you " +
    'can justify is worth more to it than an agreement you cannot.\n\n' +
    'providers: the vendor/product slugs this applies to, e.g. ["kubernetes"] or ["aws"].\n' +
    'savings: the size of the prize, or "UNQUANTIFIED" with what it depends on, or "None".\n' +
    'provenance: one of primary-doc, primary-blog, practitioner-data, peer-reviewed, inferred, ' +
    'unsourced-claim — qualified in a phrase if it is mixed.\n' +
    'telemetrySignal: what a content-blind audit could observe that would show this happening, ' +
    'or a plain statement that it cannot be observed that way.',
    { label: 'verify:' + s.label, phase: 'Verify', schema: ENTRY_SCHEMA },
  ),
)

const recovered = verified.filter(Boolean)
log(recovered.length + '/13 recovered')

const quoteDrift = recovered.filter((e) => e.quoteStillAccurate === false)
const changed = recovered.filter((e) => e.verdictChangedFromBrief === true)
log(quoteDrift.length + ' quotes no longer match the page · ' + changed.length + ' verdicts changed from the brief')

phase('Refute')
const passes = recovered.filter((e) => e.strictVerdict.startsWith('PASS_'))
log(passes.length + ' entries claim a pass — attacking each')

const refutations = await parallel(
  passes.map((e) => () =>
    agent(
      RULES + '\n' + BAR + '\n\n' +
      'Try to REFUTE this verdict. Default to refuted:true if you cannot settle it — the register ' +
      'would rather demote a real pass than publish a false one.\n\n' +
      'CLAIM: "' + e.name + '" is ' + e.strictVerdict + '.\n' +
      'REASONING GIVEN: ' + e.reasoning + '\n' +
      'SOURCE: ' + e.verifiedAgainst + '\n\n' +
      'Check specifically:\n' +
      '- Does the mechanism trigger on something content-blind, or does it inspect the request?\n' +
      '- Is there any path where it suppresses a call that would NOT have been a true duplicate?\n' +
      '- At temperature > 0, does it collapse independent samples into one frozen sample?\n' +
      '- Does the cited quote actually support the claim, or is the claim an inference from it?\n' +
      '- Is a documentation sentence being treated as proof? That caps at CONTRACTUAL_ONLY.\n\n' +
      'If you refute it, name the verdict you would give instead.',
      { label: 'refute:' + e.name.slice(0, 32), phase: 'Refute', schema: REFUTE_SCHEMA },
    ).then((v) => ({ name: e.name, verdict: e.strictVerdict, refuted: v.refuted, reason: v.reason, proposedVerdict: v.proposedVerdict })),
  ),
)

const alive = refutations.filter(Boolean)
const killed = alive.filter((r) => r.refuted)
log(killed.length + '/' + passes.length + ' passes refuted')

phase('Critic')
const critique = await agent(
  RULES + '\n\n' +
  'You are the completeness critic on a recovery pass over 13 register entries. Here is what ' +
  'came back:\n\n' +
  JSON.stringify(recovered.map((e) => ({ name: e.name, verdict: e.strictVerdict, provenance: e.provenance, verifiedAgainst: e.verifiedAgainst, quoteStillAccurate: e.quoteStillAccurate })), null, 1) +
  '\n\nAnd here is what the refuters said about the ones claiming a pass:\n' +
  JSON.stringify(alive, null, 1) +
  '\n\nAnswer, specifically and without padding:\n' +
  '1. Which entries rest on a single source that nobody cross-checked?\n' +
  '2. Which verdict is the agent inference rather than something the quote actually says?\n' +
  '3. Which entries are really the same mechanism cited three times, and should the register say so?\n' +
  '4. What did this recovery NOT check that it should have?\n' +
  'Return prose, under 400 words. A critic that finds nothing has not looked.',
  { label: 'critic', phase: 'Critic' },
)

return { recovered, refutations: alive, killed, critique }
