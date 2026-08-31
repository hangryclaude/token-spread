export const meta = {
  name: 'sweep-14-all-areas',
  description: 'Thirty-four axes across every area of LLM cost, adjudicated with symmetric challenge and a quote-grep gate',
  phases: [
    { title: 'Find', detail: 'thirty-four axes, read-only, every quote grepped before submission' },
    { title: 'Dedupe', detail: 'cross-axis and against the standing 226' },
    { title: 'Adjudicate', detail: 'batches of four, judged independently' },
    { title: 'Challenge', detail: 'two refuters per pass, one advocate per rejection' },
    { title: 'Critic', detail: 'what thirty-four axes still did not look at' },
  ],
}

const DEDUPE = '/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/scratchpad/existing-226.txt'

const BAR = [
  'THE BAR, verbatim: does the model read a different sequence of tokens, does a different model',
  'answer, or does a different amount of thinking happen? If yes it is FAIL — a changed product',
  'sold as a saving.',
  '',
  '  PASS_ABSOLUTE    nothing on the wire changed',
  '  PASS_METADATA    only a field the model never reads changed',
  '  PASS_SCHEDULING  only *when* the request was sent changed',
  '  PASS_REPLAY      a stored response hash-matches a byte-identical repeat',
  '  CONTRACTUAL_ONLY the provider asserts identity and we cannot verify it',
  '  FAIL             the model reads different tokens, a different model answers, or a different',
  '                   amount of thinking happens',
  '  INSUFFICIENT_EVIDENCE  could not be settled, and we say so rather than guessing',
  '',
  "A documentation sentence is THE PROVIDER'S WORD, however plainly it reads, and caps at",
  'CONTRACTUAL_ONLY. Only a measurement, or a structural argument that no request was ever sent,',
  'supports PASS_ABSOLUTE. The question that decides most cases: DID THE REQUEST LEAVE THE',
  "CUSTOMER'S MACHINE? If it did and the provider says it discarded, deduplicated or declined to",
  'bill it, that is CONTRACTUAL_ONLY.',
  '',
  'APPLY THE BAR AS WRITTEN. Do not broaden it into "a different mechanism decides what gets',
  'produced" or anything like it — that phrasing is not in the bar, it failed an entry wrongly,',
  'and the demotion was itself overturned. Over-correction is a failure too.',
  '',
  'NOTHING IN THIS SWEEP IS MEASURED. There is no ANTHROPIC_API_KEY and no live traffic. Any claim',
  'needing a measurement to stand must say so in settlingExperiment and must not be rounded up.',
].join('\n')

const RULES = [
  'HARD RULES — every one of these exists because it was violated and cost something.',
  '',
  '1. READ-ONLY on /Users/angus/dev/token-spread. Do not write, edit, create or delete any file',
  '   there and do not run git. Read files freely. Your return value is JSON.',
  '',
  '2. Today is 2026-08-18.',
  '',
  '3. GREP YOUR OWN QUOTE BEFORE YOU SUBMIT IT. This is the big one. A sweep of this register on',
  '   2026-08-18 grepped every quoted string against its cited source and found 22% of them',
  '   defective — 13 absent from the page entirely, 9 spliced together from fragments the source',
  '   never said as a unit. Two of the register\'s most load-bearing entries quoted text that does',
  '   not exist, under the words "Independently verified this session".',
  '   So: fetch the page, grep for the exact string you intend to quote, and report the hit count',
  '   in quoteHits. Also report a control phrase you expect to find and its count, so a zero',
  '   result cannot be confused with a broken fetch. If your quote is not a contiguous substring',
  '   of the source, either quote a shorter string that is, or do not submit the candidate.',
  '',
  '4. NEVER SPLICE. Joining two real fragments from different sentences or sections with an',
  '   ellipsis produces a quotation the source never made. If you need two statements, give two',
  '   quotes.',
  '',
  '5. Fetch pricing and feature-comparison tables as RAW HTML, not converted markdown. Conversion',
  '   silently drops table cells whose content is an icon rather than text — that is how a',
  '   check-marked "Priority access at high traffic times" row went unseen on claude.com/pricing',
  '   and produced a wrong verdict.',
  '',
  '6. If a documentation site is a JavaScript-rendered SPA and curl returns an empty shell, do not',
  '   give up and do not guess. Try the Wayback Machine (web.archive.org), which worked on Yandex',
  '   when direct fetching failed, or an alternate docs host, or the provider\'s GitHub. Report',
  '   what you tried. An axis that reports "unreachable" honestly is worth more than one that',
  '   reports a guess.',
  '',
  '7. If a tool or repository is load-bearing, verify it exists and report stars and last push.',
  '   Four entries were expelled in August for citing zero-star repos, one of which did not exist.',
  '',
  '8. Read ' + DEDUPE + ' first — 226 lines, "id|verdict|name". Do not resubmit',
  '   anything already there. If your candidate restates one of them, say so and drop it.',
].join('\n')

const CANDIDATE_SCHEMA = {
  type: 'object',
  required: ['candidates', 'axisNotes'],
  properties: {
    axisNotes: { type: 'string' },
    unreachable: { type: 'array', items: { type: 'string' } },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'mechanism', 'quote', 'quoteHits', 'controlPhrase', 'controlHits', 'sourceUrl', 'providers', 'savings', 'proposedVerdict', 'whyNovel'],
        properties: {
          name: { type: 'string' },
          mechanism: { type: 'string' },
          quote: { type: 'string' },
          quoteHits: { type: 'integer' },
          controlPhrase: { type: 'string' },
          controlHits: { type: 'integer' },
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
    decisions: { type: 'array', items: { type: 'object', required: ['name', 'status'], properties: {
      name: { type: 'string' }, status: { type: 'string', enum: ['novel', 'duplicate', 'restatement'] },
      ofId: { type: 'integer' }, note: { type: 'string' } } } },
  },
}

const ENTRY_SCHEMA = {
  type: 'object',
  required: ['entries'],
  properties: { entries: { type: 'array', items: { type: 'object',
    required: ['name', 'strictVerdict', 'reasoning', 'savings', 'provenance', 'telemetrySignal', 'providers', 'verifiedAgainst'],
    properties: {
      name: { type: 'string' },
      strictVerdict: { type: 'string', enum: ['PASS_ABSOLUTE', 'PASS_METADATA', 'PASS_SCHEDULING', 'PASS_REPLAY', 'CONTRACTUAL_ONLY', 'FAIL', 'INSUFFICIENT_EVIDENCE'] },
      reasoning: { type: 'string' }, savings: { type: 'string' }, provenance: { type: 'string' },
      telemetrySignal: { type: 'string' }, providers: { type: 'array', items: { type: 'string' } },
      verifiedAgainst: { type: 'string' }, trap: { type: 'string' }, settlingExperiment: { type: 'string' },
    } } } },
}

const VERDICT_SCHEMA = {
  type: 'object', required: ['verdict', 'reason'],
  properties: { verdict: { type: 'string', enum: ['upheld', 'overturned'] }, reason: { type: 'string' },
    proposedVerdict: { type: 'string' }, proposedName: { type: 'string' } },
}

const AXES = [
  { l: 'anthropic-surface', t: 'Anthropic, the entire billing surface', b: 'Every priced or exempted surface Anthropic operates: models, tiers, fast mode, batch, caching, tool pricing, code execution containers, Managed Agents session runtime, Files API, Admin API, Compliance API, workspaces, spend limits, seats, usage credits. Look for what is NOT billed as hard as for what is. Include anything shipped since 2026-08-17.' },
  { l: 'openai-surface', t: 'OpenAI, the entire billing surface', b: 'Models, service tiers, Batch, prompt caching, cached-input pricing, Realtime, Responses API state, reserved capacity, priority processing, fine-tuning, embeddings, moderation, tool fees. What is exempt, what is free, what is silently repriced.' },
  { l: 'google-surface', t: 'Google Gemini and Vertex AI, the entire billing surface', b: 'Implicit and explicit context caching, batch mode, provisioned throughput and GSU burndown, Live API, grounding fees, embeddings, Gemini Flash tiers, free tier limits. Vertex and AI Studio price differently for the same model.' },
  { l: 'bedrock-surface', t: 'AWS Bedrock, the entire billing surface', b: 'On-demand, batch, provisioned throughput, prompt caching, cross-region inference profiles, model marketplace, Guardrails pricing, Knowledge Bases, AgentCore, distillation, imported models.' },
  { l: 'azure-surface', t: 'Azure OpenAI and Microsoft Foundry, the entire billing surface', b: 'PTU and reservations, Global vs Regional vs DataZone deployment pricing, batch, prompt caching, spillover, Provisioned Managed, Foundry Agent Service, content filtering costs, MACC burn-down.' },
  { l: 'fast-inference-hosts', t: 'Fast-inference hosts', b: 'Groq, Cerebras, SambaNova, Together, Fireworks, Baseten, Replicate, Deepinfra, Novita, Hyperbolic. Per-token prices for open-weight models, batch discounts, dedicated endpoints, caching. Where the same open weights are served at very different prices, that is a real customer lever — but adjudicate honestly whether a different serving stack is the same product.' },
  { l: 'european-providers', t: 'European and Israeli providers', b: 'Mistral, Aleph Alpha, AI21, Cohere, Reka, Silo, LightOn, Nebius. Caching, batch, commitments, and any output-invariance language.' },
  { l: 'china-deep', t: 'Greater China providers — the pass sweep 13 could not finish', b: 'Sweep 13 got quotable primary sources for only 3 of 10 named providers because Doubao/Volcengine and Tencent Hunyuan serve JavaScript-rendered docs that curl cannot read, and it gave up. Another axis in the same sweep solved the identical problem with a Wayback Machine snapshot. USE THAT. Providers: ByteDance Doubao/Volcengine, Tencent Hunyuan, Baidu ERNIE/Qianfan, iFlytek Spark, MiniMax, StepFun, Baichuan, 01.AI, SenseTime, Alibaba Qwen, Zhipu/Z.ai, Moonshot/Kimi, DeepSeek. Read the Chinese documentation in Chinese and quote it in Chinese with a translation.' },
  { l: 'apac-providers', t: 'Korea, Japan, India, Russia providers', b: 'Naver HyperCLOVA X, Upstage Solar, LG EXAONE, Kakao, Sakana, Preferred Networks, Rakuten, NTT tsuzumi, Sarvam, Krutrim, Yandex, Sber GigaChat. Caching, batch, off-peak, commitments, invariance language.' },
  { l: 'aggregators', t: 'Aggregators and routers as pricing surfaces', b: 'OpenRouter, Requesty, Eden AI, Unify, Martian, Portkey, LiteLLM cloud, Helicone. Their own margins, their caching, their free tiers, their BYOK terms, and whether routing between providers is disclosed to the customer.' },
  { l: 'caching-family', t: 'Prompt caching as a complete family, every provider', b: 'Minimums, TTLs, write multipliers, read discounts, breakpoint limits, lookback windows, invalidation rules, implicit vs explicit, and every documented way a cache silently fails to engage. The register already holds many of these — find what is missing, especially minimums and invalidation rules nobody has written down.' },
  { l: 'batch-family', t: 'Batch and asynchronous tiers, every provider', b: 'Discount size, turnaround guarantees, what is not billed on failure, interaction with caching, size limits, and which platforms lack batch entirely.' },
  { l: 'offpeak-family', t: 'Off-peak, time-of-day and demand-tiered pricing', b: 'DeepSeek publishes an off-peak discount and Tencent resells it on a peak/valley schedule. Who else? Flex, spot, priority, standard and scheduled tiers across every provider. This is the PASS_SCHEDULING family and it is still the register\'s thinnest bucket.' },
  { l: 'commitment-family', t: 'Commitment and capacity products', b: 'Azure PTU, Bedrock Provisioned Throughput, Vertex GSU, OpenAI reserved capacity, Anthropic committed spend. Purchase, exit, exchange, transfer, expiry, what happens on a mid-term price change, and what happens to unused capacity.' },
  { l: 'queue-dedup', t: 'Enqueue-time deduplication across orchestrators', b: 'Temporal, Celery, Sidekiq, Airflow, Dagster, Prefect, Step Functions, Cloud Tasks, Kafka, Oban, RQ, Resque, Hatchet, Inngest, Trigger.dev, Hangfire, Quartz. The question that decides every one: is the dedup key derived from the request CONTENT, or is it a caller-supplied string? A caller-supplied string is content-blind and this register has failed BullMQ and Sidekiq for exactly that.' },
  { l: 'gateway-caching', t: 'Gateway and proxy exact-match caching', b: 'LiteLLM, Portkey, Helicone, Bifrost, Cloudflare AI Gateway, Kong AI Gateway, Apigee, Envoy AI Gateway, Higress, LangDB, TrueFoundry, Traefik AI. Exact-match response caching, single-flight coalescing, request dedup, budget guards — and whether any of them rewrites the request body in transit, which is what failed PromptXRay.' },
  { l: 'sdk-waste', t: 'Client SDK waste and double-billing', b: 'Official SDKs for Anthropic, OpenAI, Google, AWS, Azure in python, typescript, go, java, rust. Default retry counts and backoff, timeout behaviour, what a retry re-bills, whether a dropped stream bills the server-completed generation, connection reuse, idempotency support, and any default that costs money silently.' },
  { l: 'streaming-billing', t: 'Streaming versus non-streaming billing', b: 'What happens to billing when a stream is cut, when a client disconnects, when a proxy times out, when max_tokens is hit, when a stop sequence fires. Which providers document it and which are silent.' },
  { l: 'tool-overhead', t: 'Tool use and function calling token overhead', b: 'The fixed system-prompt tax per provider and model, per-tool-definition cost, tool_choice variants, parallel tool calls, tool search and deferred loading, MCP server definitions, and the token-efficient tool-use betas.' },
  { l: 'structured-outputs', t: 'Structured outputs, grammars and schemas', b: 'Injected instruction overhead, grammar compilation caching, schema stability requirements, incompatibilities with other features, and whether constrained decoding costs or saves.' },
  { l: 'context-management', t: 'Context management APIs', b: 'Context editing, tool-result clearing, thinking-block stripping, memory tools, compaction, automatic truncation. What each one deletes, what it bills, and what it does to the cache.' },
  { l: 'multimodal-billing', t: 'Multimodal billing', b: 'Images, PDFs, audio, video, documents. Tokens per tile and per page, resizing rules, the double-billing of a PDF as both text and image, audio input and output pricing, video frame sampling. Every provider prices these differently and most customers never look.' },
  { l: 'embeddings-rerank', t: 'Embeddings, reranking and retrieval cost', b: 'Per-token embedding prices, dimension reduction, batch embedding, rerank pricing, hosted vector stores, and the cost of re-embedding a corpus on model upgrade.' },
  { l: 'finetune-distill', t: 'Fine-tuning and distillation economics', b: 'Training cost, hosting cost, inference price differences for tuned models, minimum commitments, and whether a distilled model is cheaper enough to matter. Adjudicate honestly: a different model answering is FAIL by the bar, so most of this axis will reject — say so.' },
  { l: 'billing-finops', t: 'Billing, FinOps and the invoice', b: 'SLA and outage credits, billing-error disputes and refund paths, credit expiry, tax, VAT and withholding, billing currency, payment rails, invoice thresholds, purchase orders, and the mechanics of getting money back when a provider overcharges.' },
  { l: 'channels-resellers', t: 'Marketplaces, resellers and channels', b: 'AWS Marketplace, Azure Marketplace, GCP Marketplace, CSP partners, distributors, and whether buying through a channel changes the price, the terms or the commitment drawdown.' },
  { l: 'credit-programs', t: 'Credit and discount programmes', b: 'Startup programmes, research and academic credits, nonprofit rates, hackathon credits, accelerator perks, cloud provider AI credits, and open-source maintainer programmes across every major provider.' },
  { l: 'contract-terms', t: 'Contract terms that move money', b: 'Price protection, most-favoured-nation clauses, rate-change notice periods, auto-renewal, termination for convenience, assignment, audit rights, and what a customer can actually negotiate.' },
  { l: 'metering-correctness', t: 'Metering correctness and billing errors', b: 'Documented cases of providers over-billing or mis-classifying usage, reconciliation between usage APIs and invoices, known discrepancies between reported and billed tokens, and tools that audit an LLM invoice.' },
  { l: 'observability', t: 'Observability that finds waste', b: 'Usage and cost APIs, per-key attribution, cache-hit reporting, token accounting fields, and open-source tools that surface spend. The register cares because a lever you cannot observe is a lever you cannot prove.' },
  { l: 'anthropic-products', t: 'Anthropic product surfaces', b: 'Claude Code, Agent SDK, Managed Agents, Routines, Skills, MCP connectors, the Console, Workbench, Admin API, Compliance API. What each bills, what is exempt, and where subscription and API billing meet.' },
  { l: 'self-hosting', t: 'Self-hosting economics, scoped to the customer-run gateway', b: 'vLLM, SGLang, TensorRT-LLM, llama.cpp, Ollama. STRICTLY SCOPED: only techniques a hosted-API customer could apply by running their own gateway or proxy count. Serving-stack internals for someone else\'s inference are out of scope and the register has already rejected them.' },
  { l: 'agent-loops', t: 'Agent loop economics', b: 'Sub-agent isolation, orchestrator patterns, retry storms, tool-call loops, context accumulation across turns, and documented cases where an agent framework multiplied a bill. Anthropic, OpenAI, LangChain, LangGraph, CrewAI, AutoGen, Letta, Goose.' },
  { l: 'terms-boundary', t: 'The terms boundary', b: 'What is and is not permitted: account sharing, automation, resale, sublicensing, credential sharing, multi-account use, and any provider whose terms differ from Anthropic\'s. The register has this settled for Anthropic; nobody has checked whether OpenAI, Google, AWS or Azure draw the line in the same place.' },
]

phase('Find')
log(AXES.length + ' axes')

const found = await pipeline(
  AXES,
  (a) => agent(
    RULES + '\n\n' + BAR + '\n\n' +
    'AXIS: ' + a.t + '\n\n' + a.b + '\n\n' +
    'Return your strongest candidates, at most eight. Quality over count — this register has just ' +
    'spent a day withdrawing a third of its own passing column, and a padded submission costs more ' +
    'than an empty one. An axis that returns nothing is a publishable finding and will be printed ' +
    'as such.\n\n' +
    'Put in axisNotes everything you looked at and rejected, and why. That is what makes the sweep ' +
    'falsifiable. Put any source you could not reach in unreachable, with what you tried.\n\n' +
    'For each candidate: mechanism is what actually happens at the level of what the model reads. ' +
    'quote is a CONTIGUOUS substring of the source, grepped, with quoteHits and a controlPhrase ' +
    'and controlHits alongside. whyNovel says why this is none of the 226 entries in the dedupe ' +
    'file.',
    { label: 'find:' + a.l, phase: 'Find', schema: CANDIDATE_SCHEMA },
  ),
)

const axes = found.filter(Boolean)
const all = axes.flatMap((r, i) => (r.candidates || []).map((c) => ({ ...c, axis: AXES[i].l })))
const dry = axes.map((r, i) => ({ a: AXES[i].l, n: (r.candidates || []).length })).filter((x) => x.n === 0)
const badQuotes = all.filter((c) => c.quoteHits === 0 || c.controlHits === 0)
log(all.length + ' candidates from ' + axes.length + ' axes')
if (dry.length) log('axes returning nothing: ' + dry.map((d) => d.a).join(', '))
if (badQuotes.length) log('DROPPED for a zero-hit quote or control: ' + badQuotes.length)

const sound = all.filter((c) => c.quoteHits > 0 && c.controlHits > 0)

phase('Dedupe')
const deduped = await agent(
  RULES + '\n\n' +
  'You are the dedupe pass over ' + sound.length + ' candidates from ' + axes.length + ' independent ' +
  'sweeps that could not see each other. Cross-axis collisions are certain — the caching family will ' +
  'collide with every provider axis, the queue family with the gateway family.\n\n' +
  JSON.stringify(sound.map((c) => ({ name: c.name, axis: c.axis, mechanism: c.mechanism, providers: c.providers })), null, 1) +
  '\n\nRead ' + DEDUPE + ' — the 226 entries already held.\n\n' +
  'Return novel, duplicate (of another candidate here — name the one you keep), or restatement (of ' +
  'a register entry — give its id in ofId). Judge on MECHANISM, not wording.',
  { label: 'dedupe', phase: 'Dedupe', schema: DEDUPE_SCHEMA },
)

const kill = new Set((deduped?.decisions || []).filter((d) => d.status !== 'novel').map((d) => d.name))
const novel = sound.filter((c) => !kill.has(c.name))
log(novel.length + ' novel (' + (sound.length - novel.length) + ' deduped away)')

phase('Adjudicate')
const batches = []
for (let i = 0; i < novel.length; i += 4) batches.push(novel.slice(i, i + 4))
log(batches.length + ' adjudication batches')

const judged = await pipeline(
  batches,
  (b, _o, i) => agent(
    RULES + '\n\n' + BAR + '\n\n' +
    'Adjudicate these ' + b.length + ' candidates. Judge each INDEPENDENTLY and do not balance ' +
    'your verdicts.\n\n' + JSON.stringify(b, null, 1) + '\n\n' +
    'Re-check every quote against its source before relying on it, and do not carry a quote ' +
    'forward that you cannot grep yourself.\n\n' +
    'verifiedAgainst MUST contain an ISO date — a schema test rejects this cohort without one.\n' +
    'telemetrySignal: what a CONTENT-BLIND audit could observe, or a plain statement that it cannot.\n' +
    'settlingExperiment: for anything unresolved, and for any claim needing a measurement.\n' +
    'trap: the way this bites whoever adopts it.',
    { label: 'judge:b' + (i + 1), phase: 'Adjudicate', schema: ENTRY_SCHEMA },
  ),
)

const entries = judged.filter(Boolean).flatMap((r) => r.entries || [])
log(entries.length + ' adjudicated')

phase('Challenge')
const passes = entries.filter((e) => e.strictVerdict.startsWith('PASS_'))
const rejects = entries.filter((e) => e.strictVerdict === 'FAIL' || e.strictVerdict === 'INSUFFICIENT_EVIDENCE')
log(passes.length + ' passes x2 refuters · ' + rejects.length + ' rejections x1 advocate')

const challenged = await parallel([
  ...passes.flatMap((e) => [0, 1].map((n) => () =>
    agent(
      RULES + '\n\n' + BAR + '\n\n' +
      'REFUTE this verdict. Default to overturned if you cannot settle it.\n\n' +
      'CLAIM: "' + e.name + '" is ' + e.strictVerdict + '\nREASONING: ' + e.reasoning +
      '\nSOURCE: ' + e.verifiedAgainst + '\n\n' +
      (n === 0
        ? 'YOUR LENS — MECHANISM. Did the request leave the customer machine? Is any key ' +
          'content-blind? Does the argument hold as a fact about the mechanism, or only under a ' +
          'condition the mechanism does not enforce? Is a dependency in the path unexamined?'
        : 'YOUR LENS — SOURCE. Fetch it and grep every quoted string with a control phrase. Does ' +
          'the quote exist, contiguously, as quoted? Is it spliced? Does the source say what the ' +
          'reasoning claims, or the opposite? Does the cited repo or tool exist?') +
      '\n\nIf the honest answer is a NARROWER pass, give the narrower title in proposedName and ' +
      'uphold — moving scope into the name is this register\'s established remedy.',
      { label: 'refute' + (n + 1) + ':' + e.name.slice(0, 24), phase: 'Challenge', schema: VERDICT_SCHEMA },
    ).then((v) => ({ kind: 'refute', name: e.name, was: e.strictVerdict, ...v })))),
  ...rejects.map((e) => () =>
    agent(
      RULES + '\n\n' + BAR + '\n\n' +
      'ADVOCATE. This candidate was judged ' + e.strictVerdict + '. Find out whether that was too ' +
      'harsh — for most of this register\'s history nothing ever checked a rejection.\n\n' +
      'CLAIM: "' + e.name + '"\nREASONING: ' + e.reasoning + '\nSOURCE: ' + e.verifiedAgainst + '\n\n' +
      'Is there a narrower scoping under which it genuinely passes? Was a documentation sentence ' +
      'read as weaker than it is? Was it rejected for a property of a bad configuration rather ' +
      'than of the mechanism? Does a source actually answer what was called unresolved?\n\n' +
      'DEFAULT TO UPHELD. Overturn only where you can quote the thing that changes it. An advocate ' +
      'who wins every case is worth nothing.',
      { label: 'advocate:' + e.name.slice(0, 24), phase: 'Challenge', schema: VERDICT_SCHEMA },
    ).then((v) => ({ kind: 'advocate', name: e.name, was: e.strictVerdict, ...v }))),
])

const verdicts = challenged.filter(Boolean)
log(verdicts.filter((v) => v.kind === 'refute' && v.verdict === 'overturned').length + ' refutations landed · ' +
    verdicts.filter((v) => v.kind === 'advocate' && v.verdict === 'overturned').length + ' rejections argued down')

phase('Critic')
const critique = await agent(
  RULES + '\n\n' +
  'Completeness critic on a thirty-four-axis sweep.\n\nAXES:\n' +
  JSON.stringify(axes.map((r, i) => ({ axis: AXES[i].l, found: (r.candidates || []).length, notes: r.axisNotes, unreachable: r.unreachable })), null, 1) +
  '\n\nENTRIES:\n' + JSON.stringify(entries.map((e) => ({ name: e.name, verdict: e.strictVerdict, provenance: e.provenance, source: e.verifiedAgainst })), null, 1) +
  '\n\nCHALLENGES:\n' + JSON.stringify(verdicts, null, 1) +
  '\n\nAnswer specifically:\n' +
  '1. Which axes were searched shallowly, and what would a real pass have covered?\n' +
  '2. Which entries rest on a single uncorroborated source?\n' +
  '3. Which verdict is inference rather than something a quote says?\n' +
  '4. Which sources went unreachable, and does that leave a claim unverified rather than absent?\n' +
  '5. After thirty-four axes, what area of LLM cost is still not represented in this register at all?\n' +
  'Question 5 matters most. Under 700 words.',
  { label: 'critic', phase: 'Critic' },
)

return {
  axes: axes.map((r, i) => ({ axis: AXES[i].l, found: (r.candidates || []).length, notes: r.axisNotes, unreachable: r.unreachable })),
  candidatesFound: all.length, droppedForBadQuote: badQuotes.length,
  entries, verdicts, critique,
}
