export const meta = {
  name: 'sweep-13',
  description: 'Ten-axis sweep for new token-cost techniques, adjudicated with symmetric challenge in both directions',
  phases: [
    { title: 'Find', detail: 'ten axes, read-only, verbatim quotes only' },
    { title: 'Dedupe', detail: 'cross-axis and against the standing 201' },
    { title: 'Adjudicate', detail: 'batches of four, each judged independently' },
    { title: 'Challenge', detail: 'two refuters per pass; one advocate per reject — the bias runs both ways' },
    { title: 'Critic', detail: 'what the sweep did not look at' },
  ],
}

const DEDUPE = '/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/scratchpad/existing-201.txt'

const BAR = `
THE BAR — one question decides every candidate: does the model read a different sequence of
tokens, does a different model answer, or does a different amount of thinking happen? If yes it
is FAIL — a changed product sold as a saving.

  PASS_ABSOLUTE    nothing on the wire changed
  PASS_METADATA    only a field the model never reads changed
  PASS_SCHEDULING  only *when* the request was sent changed
  PASS_REPLAY      a stored response hash-matches a byte-identical repeat
  CONTRACTUAL_ONLY the provider asserts identity and we cannot verify it
  FAIL             the model reads different tokens, a different model answers, or a different
                   amount of thinking happens
  INSUFFICIENT_EVIDENCE  we could not settle it, and say so rather than guessing

A documentation sentence is THE PROVIDER'S WORD, however clearly it reads, and caps at
CONTRACTUAL_ONLY. Only a measurement, or a structural argument that no request was ever sent,
supports PASS_ABSOLUTE. The distinction that decides most cases: did the request leave the
customer's machine? If it did and the provider says it discarded it, that is CONTRACTUAL_ONLY.

SOURCE-DERIVED AND MEASURED ARE DIFFERENT THINGS AND MUST NOT BE BLURRED. This project has no
ANTHROPIC_API_KEY and ran no live traffic. Nothing in this sweep is measured. Any claim that
would need a measurement to stand must say so in settlingExperiment and must not be rounded up.

Scope is the hosted-API customer of a frontier LLM provider. Serving-stack internals (vLLM,
SGLang, KV-cache offload) are out of scope unless the customer runs the gateway themselves.
`

const RULES = `
HARD RULES.
1. You are READ-ONLY on /Users/angus/dev/token-spread. Do not write, edit, create or delete any
   file there, and do not run git. Read files if you need to. Your return value is JSON.
2. Today is 2026-08-17. Every claim needs a VERBATIM quote and a URL. A paraphrase inside
   quotation marks is the one failure this register has already caught itself making — do not
   repeat it. If you cannot quote it, do not submit it.
3. Fetch pricing and feature-comparison tables as RAW HTML, not converted markdown. Markdown
   conversion silently drops table cells whose content is an icon rather than text; that is how
   a check-marked "Priority access at high traffic times" row went unseen on claude.com/pricing
   five days ago and produced a wrong verdict.
4. When a tool or repository is cited, verify it exists and report its star count and last push.
   Four entries were expelled from this register's passing column in August because their cited
   tools turned out to be zero-star repos and one could not be found at all.
5. Do not submit anything already in the register. Read ${DEDUPE} first — 201 lines,
   "id|verdict|name". If your candidate is a restatement of one of those, say so and drop it.
`

const CANDIDATE_SCHEMA = {
  type: 'object',
  required: ['candidates'],
  properties: {
    axisNotes: { type: 'string' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'mechanism', 'quote', 'sourceUrl', 'providers', 'savings', 'proposedVerdict', 'whyNovel'],
        properties: {
          name: { type: 'string' },
          mechanism: { type: 'string' },
          quote: { type: 'string' },
          sourceUrl: { type: 'string' },
          providers: { type: 'array', items: { type: 'string' } },
          savings: { type: 'string' },
          proposedVerdict: { type: 'string', enum: ['PASS_ABSOLUTE', 'PASS_METADATA', 'PASS_SCHEDULING', 'PASS_REPLAY', 'CONTRACTUAL_ONLY', 'FAIL', 'INSUFFICIENT_EVIDENCE'] },
          whyNovel: { type: 'string' },
        },
      },
    },
  },
}

const DEDUPE_SCHEMA = {
  type: 'object',
  required: ['decisions'],
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'status'],
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['novel', 'duplicate', 'restatement'] },
          ofId: { type: 'integer' },
          note: { type: 'string' },
        },
      },
    },
  },
}

const ENTRY_SCHEMA = {
  type: 'object',
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'strictVerdict', 'reasoning', 'savings', 'provenance', 'telemetrySignal', 'providers', 'verifiedAgainst'],
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
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'reason'],
  properties: {
    verdict: { type: 'string', enum: ['upheld', 'overturned'] },
    reason: { type: 'string' },
    proposedVerdict: { type: 'string' },
  },
}

const AXES = [
  {
    label: 'anthropic-new',
    title: 'Anthropic surfaces changed since 2026-08-12',
    brief: `Everything Anthropic has shipped, repriced or documented since 2026-08-12 — five days.
    Release notes, changelog, the pricing page, new beta headers, new API parameters, docs pages
    with a recent revision date. This is the axis the register's own exhaustion statement calls
    structurally incapable of going dry, because it is generated by release cadence rather than by
    search effort. Expect a small harvest; report honestly if it is empty.`,
  },
  {
    label: 'other-frontier-new',
    title: 'OpenAI, Google/Vertex, AWS Bedrock and Azure, changed since 2026-08-12',
    brief: `Same axis, other providers. New batch/caching/tiering features, pricing changes,
    new commitment products, changed cache TTLs or minimums, new billing-exemption rules.`,
  },
  {
    label: 'china-providers',
    title: 'Greater China providers',
    brief: `Baidu ERNIE, ByteDance Doubao / Volcano Engine, Tencent Hunyuan, iFlytek Spark,
    MiniMax, StepFun, Baichuan, 01.AI, SenseTime, Alibaba Qwen. For each: does it have context
    caching, batch, or off-peak pricing, and does its documentation make any OUTPUT-INVARIANCE
    claim? The register already holds DeepSeek (CONTRACTUAL_ONLY) and Kimi (unresolved, no
    invariance language). Sweep 12 checked three providers out of dozens. Documentation is often
    Chinese-only — read it in Chinese and quote it in Chinese with a translation.`,
  },
  {
    label: 'row-providers',
    title: 'Rest-of-world providers',
    brief: `Naver HyperCLOVA X, Upstage Solar, LG EXAONE, Kakao, Sakana, Preferred Networks,
    Rakuten, Sarvam, Krutrim, Mistral, Aleph Alpha, AI21, Cohere, Reka, Yandex, Sber GigaChat.
    Same questions: caching, batch, off-peak, commitment discounts, and any output-invariance
    language. Untouched by construction — no sweep has looked here.`,
  },
  {
    label: 'offpeak-pricing',
    title: 'Off-peak and time-of-day pricing, as a family',
    brief: `DeepSeek's off-peak discount is real and registered. Nobody has asked who else does
    it. Sweep every provider you can for time-of-day, weekend, or demand-tiered pricing, and for
    flex/priority/spot-style service tiers whose only variable is WHEN the work runs. This is the
    PASS_SCHEDULING family and it is the register's thinnest bucket — one entry out of 201.`,
  },
  {
    label: 'billing-finops',
    title: 'The billing and FinOps layer',
    brief: `Never swept. SLA and outage credits on LLM services; billing-error dispute and refund
    paths; credit expiry rules; tax, VAT and withholding treatment; billing currency; payment
    rails and card-vs-invoice differences; marketplace, CSP and reseller channels; AWS EDP/PPA;
    Azure MACC burn-down; GCP committed-use discounts; startup, research and academic credit
    programmes. Most of these change what you PAY without changing any request — which is exactly
    the shape the register's passing column is for. Be careful to distinguish a real mechanism
    from a sales motion.`,
  },
  {
    label: 'sdk-waste',
    title: 'Client-SDK waste and double-billing failure modes',
    brief: `Read the official Anthropic SDKs — python, typescript, go, java — and the OpenAI ones
    for contrast. What are the DEFAULT retry counts, backoff, and timeouts? What exactly does a
    retry re-bill? What happens to a stream that drops mid-generation: is the server-completed
    generation billed even though the client never received it? Does the SDK reuse connections?
    Is there any request-deduplication or idempotency support? The register has one entry on this
    and its provenance is "inferred" — this axis deserves source, not inference.`,
  },
  {
    label: 'queue-dedup',
    title: 'Queue and orchestration enqueue-time deduplication',
    brief: `Extends the family sweep 12 opened with K8s CronJob, BullMQ and SQS FIFO — note that
    of those, only the K8s Forbid case survived adversarial review, and only scoped to provably
    idempotent jobs. Check: Temporal, Celery, Sidekiq, Airflow, Dagster, AWS Step Functions,
    Google Cloud Tasks, Kafka idempotent producer, Oban, RQ, Resque, Hatchet, Inngest, Trigger.dev.
    The question that decides each one: is the dedup key derived from the request CONTENT, or is
    it a caller-supplied string? A caller-supplied string is content-blind and the register has
    just failed BullMQ for exactly that.`,
  },
  {
    label: 'gateway-layer',
    title: 'The gateway and proxy layer, as it ships today',
    brief: `LiteLLM, Portkey, Helicone, Bifrost, Cloudflare AI Gateway, OpenRouter, Requesty,
    Kong AI Gateway, Apigee, Envoy AI Gateway, Higress, LangDB, TrueFoundry. Look for exact-match
    response caching, single-flight/in-flight coalescing, request dedup, and budget guards. The
    register's existing entries here are up to a year old and several cite specific source files
    — check whether those files still say what they said. Also check whether any gateway rewrites
    the request body in transit, which is what just failed PromptXRay.`,
  },
  {
    label: 'anthropic-products',
    title: 'Anthropic product-surface cost mechanics',
    brief: `Claude Code, the Agent SDK, Managed Agents, the Admin API's usage and cost endpoints,
    workspaces and spend limits, the subscription/usage-credit boundary, and Routines. What is
    billed, what is not, what is exempt, what silently changes rate. The register already holds
    the cache-TTL-flip-on-billing-boundary entry; there are likely more of that shape.`,
  },
]

phase('Find')
const found = await pipeline(
  AXES,
  (a) => agent(
    RULES + '\n' + BAR + '\n\n' +
    'AXIS: ' + a.title + '\n\n' + a.brief + '\n\n' +
    'Return your strongest candidates, at most six. Quality over count: a sweep that reports a ' +
    'find on every axis is a sweep that is padding, and an empty result is a publishable finding ' +
    'that this axis is dry. Put anything you looked at and rejected, and why, in axisNotes — that ' +
    'is what makes the sweep falsifiable.\n\n' +
    'For each candidate: mechanism is what actually happens at the level of what the model reads. ' +
    'quote is verbatim from the source. whyNovel says why this is none of the 201 entries in the ' +
    'dedupe file.',
    { label: 'find:' + a.label, phase: 'Find', schema: CANDIDATE_SCHEMA },
  ),
)

const axes = found.filter(Boolean)
const all = axes.flatMap((r, i) => (r.candidates || []).map((c) => ({ ...c, axis: AXES[i].label })))
log(all.length + ' candidates across ' + axes.length + ' axes')
const dry = axes.map((r, i) => ({ axis: AXES[i].label, n: (r.candidates || []).length })).filter((x) => x.n === 0)
if (dry.length) log('axes returning nothing: ' + dry.map((d) => d.axis).join(', '))

phase('Dedupe')
const deduped = await agent(
  RULES + '\n\n' +
  'You are the dedupe pass. Here are ' + all.length + ' candidates from ten independent sweeps ' +
  'that could not see each other. Cross-axis collisions are certain — off-peak pricing will ' +
  'collide with the regional axes, gateways with queues.\n\n' +
  JSON.stringify(all.map((c) => ({ name: c.name, axis: c.axis, mechanism: c.mechanism, providers: c.providers })), null, 1) +
  '\n\nRead ' + DEDUPE + ' — the 201 entries already in the register.\n\n' +
  'For each candidate return novel, duplicate (of another candidate in this list — name the one ' +
  'you keep), or restatement (of a register entry — give its id in ofId). Judge on MECHANISM, not ' +
  'on wording: the same technique under two names is one technique.',
  { label: 'dedupe', phase: 'Dedupe', schema: DEDUPE_SCHEMA },
)

const kill = new Set((deduped?.decisions || []).filter((d) => d.status !== 'novel').map((d) => d.name))
const novel = all.filter((c) => !kill.has(c.name))
log(novel.length + ' novel after dedupe (' + (all.length - novel.length) + ' dropped)')

phase('Adjudicate')
const BATCH = 4
const batches = []
for (let i = 0; i < novel.length; i += BATCH) batches.push(novel.slice(i, i + BATCH))

const judged = await pipeline(
  batches,
  (b, _orig, i) => agent(
    RULES + '\n' + BAR + '\n\n' +
    'Adjudicate these ' + b.length + ' candidates. Judge each one INDEPENDENTLY — do not let one ' +
    "candidate's reasoning bleed into the next, and do not balance your verdicts.\n\n" +
    JSON.stringify(b, null, 1) + '\n\n' +
    'Re-check each quote against its source before you rely on it. Then return one register entry ' +
    'per candidate.\n\n' +
    'reasoning: the mechanism at the level of what the model reads, then the quote that decided ' +
    'it, then the condition under which it stops holding.\n' +
    'verifiedAgainst: the source and an ISO date (2026-08-17 for today). REQUIRED — a schema test ' +
    'rejects entries in this cohort without one.\n' +
    'telemetrySignal: what a CONTENT-BLIND audit could observe, or a plain statement that it ' +
    'cannot be observed that way.\n' +
    'settlingExperiment: for anything unresolved, and for any claim that would need a measurement ' +
    'rather than a document to stand.\n' +
    'trap: the way this bites someone who adopts it.',
    { label: 'judge:batch-' + (i + 1), phase: 'Adjudicate', schema: ENTRY_SCHEMA },
  ),
)

const entries = judged.filter(Boolean).flatMap((r) => r.entries || [])
log(entries.length + ' adjudicated')

phase('Challenge')
/* Symmetric, deliberately. The 2026-08-17 recovery pass attacked only the entries claiming a
   pass, so its bias check ran one direction and its own critic said so. Passes get two
   independent refuters; rejections and unresolveds get an advocate arguing they were judged too
   harshly. Both sides default to leaving the verdict alone. */
const passes = entries.filter((e) => e.strictVerdict.startsWith('PASS_'))
const rejects = entries.filter((e) => e.strictVerdict === 'FAIL' || e.strictVerdict === 'INSUFFICIENT_EVIDENCE')
log(passes.length + ' passes get two refuters each · ' + rejects.length + ' rejections get an advocate each')

const challenged = await parallel([
  ...passes.flatMap((e) => [0, 1].map((n) => () =>
    agent(
      RULES + '\n' + BAR + '\n\n' +
      'REFUTE this verdict. Default to overturned if you cannot settle it — this register would ' +
      'rather demote a real pass than publish a false one.\n\n' +
      'CLAIM: "' + e.name + '" is ' + e.strictVerdict + '\n' +
      'REASONING: ' + e.reasoning + '\n' +
      'SOURCE: ' + e.verifiedAgainst + '\n\n' +
      (n === 0
        ? 'YOUR LENS — mechanism. Does it trigger on something content-blind, or does it inspect ' +
          'the request? Is there a path where it suppresses or alters a call that would NOT have ' +
          'been a true duplicate? At temperature > 0, does it collapse independent samples into ' +
          'one frozen sample? Does the request leave the customer machine, and if so is a provider ' +
          'sentence doing the work a measurement should?'
        : 'YOUR LENS — evidence. Does the cited quote actually say what the reasoning claims, ' +
          'or is the claim an inference from it? Fetch the source and check the quote verbatim. ' +
          'If it is a pricing or feature table, fetch RAW HTML, because markdown conversion drops ' +
          'icon-only cells. If a tool or repo is cited, does it exist, and what are its stars and ' +
          'last push? Is any dependency doing the load-bearing work unexamined?') +
      '\n\nIf you overturn it, name the verdict you would give instead.',
      { label: 'refute' + (n + 1) + ':' + e.name.slice(0, 26), phase: 'Challenge', schema: VERDICT_SCHEMA },
    ).then((v) => ({ kind: 'refute', name: e.name, was: e.strictVerdict, ...v })),
  )),
  ...rejects.map((e) => () =>
    agent(
      RULES + '\n' + BAR + '\n\n' +
      'ADVOCATE for this candidate. It was judged ' + e.strictVerdict + '. Your job is to find ' +
      'out whether that was too harsh — the previous pass over this register attacked only the ' +
      'entries claiming a pass, so nothing has ever checked a rejection, and its own critic ' +
      'flagged that as an asymmetric bias.\n\n' +
      'CLAIM: "' + e.name + '" is ' + e.strictVerdict + '\n' +
      'REASONING: ' + e.reasoning + '\n' +
      'SOURCE: ' + e.verifiedAgainst + '\n\n' +
      'Ask: is there a narrower scoping under which this genuinely passes, the way K8s CronJob ' +
      'Forbid passes when the job is provably idempotent? Was a documentation sentence read as ' +
      'weaker than it is? Was it rejected for a property of a bad configuration rather than of ' +
      'the mechanism? Is INSUFFICIENT_EVIDENCE hiding a question that a source actually answers?\n\n' +
      'DEFAULT TO UPHELD. Overturn only where you can quote the thing that changes it. An ' +
      'advocate who wins every case is worth nothing to this register.',
      { label: 'advocate:' + e.name.slice(0, 26), phase: 'Challenge', schema: VERDICT_SCHEMA },
    ).then((v) => ({ kind: 'advocate', name: e.name, was: e.strictVerdict, ...v })),
  ),
])

const verdicts = challenged.filter(Boolean)
const overturnedPasses = verdicts.filter((v) => v.kind === 'refute' && v.verdict === 'overturned')
const overturnedRejects = verdicts.filter((v) => v.kind === 'advocate' && v.verdict === 'overturned')
log(overturnedPasses.length + '/' + passes.length * 2 + ' refutations landed · ' + overturnedRejects.length + '/' + rejects.length + ' rejections argued down')

phase('Critic')
const critique = await agent(
  RULES + '\n\n' +
  'You are the completeness critic on sweep 13 of this register. Ten axes were swept.\n\n' +
  'AXES AND WHAT EACH REPORTED:\n' +
  JSON.stringify(axes.map((r, i) => ({ axis: AXES[i].label, found: (r.candidates || []).length, notes: r.axisNotes })), null, 1) +
  '\n\nFINAL ENTRIES:\n' +
  JSON.stringify(entries.map((e) => ({ name: e.name, verdict: e.strictVerdict, provenance: e.provenance, source: e.verifiedAgainst })), null, 1) +
  '\n\nCHALLENGE RESULTS:\n' + JSON.stringify(verdicts, null, 1) +
  '\n\nAnswer specifically, without padding:\n' +
  '1. Which axis was searched shallowly, and what would a real pass at it have covered?\n' +
  '2. Which entries rest on a single source nobody cross-checked?\n' +
  '3. Which verdict is an inference rather than something a quote actually says?\n' +
  '4. Which conclusions are source-derived but written as though they were measured?\n' +
  '5. What did this sweep not look at that it should have?\n' +
  'Under 500 words. A critic that finds nothing has not looked.',
  { label: 'critic', phase: 'Critic' },
)

return {
  axes: axes.map((r, i) => ({ axis: AXES[i].label, found: (r.candidates || []).length, notes: r.axisNotes })),
  candidatesFound: all.length,
  dedupeDecisions: deduped?.decisions || [],
  entries,
  verdicts,
  critique,
}
