import { readFileSync, writeFileSync } from "node:fs";
import { loadRegister } from "/Users/angus/dev/token-spread/src/register/load";
import { assignIds, nameCollisions, type Candidate } from "/Users/angus/dev/token-spread/src/register/merge";

const OUT = "/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/tasks/w6n12zu3k.output";
const wf = JSON.parse(readFileSync(OUT, "utf8"));
const R: any[] = wf.result.recovered;
const by = (frag: string) => {
  const hit = R.find((e) => e.name.includes(frag));
  if (!hit) throw new Error(`no recovered entry matching ${frag}`);
  return hit;
};

/** Strip the fields the workflow used to talk to itself; keep only what SCHEMA.md defines. */
const clean = (e: any): Candidate => {
  const { quoteStillAccurate, quoteNow, verdictChangedFromBrief, verdictChangeReason, ...rest } = e;
  return rest as Candidate;
};

const k8s = by("K8s CronJob");
const grpc = by("gRPC retry");
const midterm = by("mid-term list-price");

const candidates: Candidate[] = [
  // ── split out of one bundled row during adversarial review ─────────────────────
  {
    name: "K8s CronJob concurrencyPolicy: Forbid — skip-on-overlap, valid only where the job is provably idempotent",
    strictVerdict: "PASS_ABSOLUTE",
    reasoning:
      "Structural, not documentary: under Forbid the controller asks only whether an active Job object from this " +
      "CronJob already exists. If one does it creates no Job — no Pod, no process, no HTTP request. Nothing was sent, " +
      "so nothing about a request can have changed. kubernetes.io, verbatim 2026-08-17: \"Forbid: The CronJob does not " +
      "allow concurrent runs; if it is time for a new Job run and the previous Job run hasn't finished yet, the CronJob " +
      "skips the new Job run.\" The condition in this entry's title is not decoration. The check reads Job status and " +
      "the clock, never content, so it cannot tell a redundant duplicate from distinct work that happens to overlap — " +
      "and where the skipped run would have done distinct work, a different amount of thinking happens (zero instead of " +
      "some), which is this register's own FAIL condition. Kubernetes declines to guarantee the property the pass rests " +
      "on and puts it on the operator: \"A CronJob creates a Job object approximately once per execution time of its " +
      "schedule... Therefore, the Jobs that you define should be idempotent.\" So the pass is real and the scope is " +
      "narrow: it holds for the skipped invocation of a job whose idempotence is established outside Kubernetes, and " +
      "for nothing else.",
    savings:
      "UNQUANTIFIED — bounded above by the cost of one duplicate invocation per overlap event. A function of job " +
      "runtime against schedule interval, which is a property of the deployment and not of the mechanism.",
    provenance: "primary-doc (kubernetes.io CronJob concept page, v1.36)",
    telemetrySignal: k8s.telemetrySignal,
    providers: ["kubernetes"],
    verifiedAgainst: "kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/ (v1.36 docs, read 2026-08-17)",
    trap:
      "Time-overlap detection with no content check, sitting on top of Kubernetes' own disclaimer that scheduling is " +
      "\"approximately once\" and jobs \"should be idempotent\". Where that assumption does not hold the mechanism " +
      "silently drops necessary work rather than saving anything.",
    settlingExperiment: k8s.settlingExperiment,
    crosscheckOverride:
      "The first pass graded \"Forbid/Replace\" as one PASS_ABSOLUTE row. Adversarial re-read refused the blanket claim " +
      "on two counts: Forbid's safety rests on an idempotency assumption Kubernetes explicitly declines to guarantee, " +
      "and Replace fails outright. The row was split — this one carries the scope in its own title, and Replace became " +
      "a separate FAIL rather than being dropped.",
  },
  {
    name: "K8s CronJob concurrencyPolicy: Replace — kill-and-restart on overlap",
    strictVerdict: "FAIL",
    reasoning:
      "Replace kills a running Job and starts a fresh one when the schedule ticks during an active run. Kubernetes' " +
      "guarantee stops at the Pod ceasing to run; nothing retracts a model request that Pod had already dispatched. For " +
      "any call with real latency — which is most of them, and precisely the ones long enough to trigger an overlap in " +
      "the first place — the kill lands after the request is in flight, so the provider bills the discarded generation " +
      "and then bills its replacement. That is more tokens on the wire, not fewer: it fails the bar in the direction " +
      "opposite to the one it was submitted for. It is here because it arrived bundled with Forbid under a single " +
      "PASS_ABSOLUTE heading, and a register that quietly drops the half that failed is doing the thing it exists to " +
      "prevent.",
    savings:
      "None, and negative in the kill-after-dispatch window — which is the common case for jobs long enough to overlap.",
    provenance: "primary-doc (kubernetes.io CronJob concept page, v1.36)",
    telemetrySignal:
      "Content-blind and observable: a Job deletion event immediately followed by a new Job creation at the same " +
      "schedule tick, correlated against provider-side usage showing a billed generation with no corresponding " +
      "completed Job.",
    providers: ["kubernetes"],
    verifiedAgainst: "kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/ (v1.36 docs, read 2026-08-17)",
    trap:
      "Reads as the safer sibling of Forbid because it sounds decisive. It is the more expensive one: Forbid declines " +
      "to spend, Replace spends twice.",
    settlingExperiment:
      "Point a CronJob at a job that makes one real, cheap model call. Set concurrencyPolicy: Replace and engineer a " +
      "tick that lands mid-request. Read the provider's usage log: if the killed run's tokens were billed despite its " +
      "output being discarded, the overlap cost more than doing nothing.",
    crosscheckOverride:
      "Split out of the Forbid entry during adversarial review. The first pass had already called Replace \"the softer " +
      "half\" in its own reasoning and graded the pair PASS_ABSOLUTE anyway.",
  },

  // ── demoted on adversarial review ──────────────────────────────────────────────
  {
    name: "BullMQ job deduplication (Simple Mode)",
    strictVerdict: "FAIL",
    reasoning:
      "The mechanism is exactly as documented, and the source bears it out: addStandardJob-9.lua runs " +
      "deduplicateJobWithoutReplace before storeJob, so a colliding job is never written to Redis and never reaches a " +
      "worker. But the collision test is `SET deduplicationKey jobId NX` — a caller-supplied string against a " +
      "caller-supplied string, with zero bytes of the payload in the comparison. It cannot distinguish the same request " +
      "retried from two different requests that happen to share an id, and BullMQ's own example encourages an arbitrary " +
      "application-level id (`{ id: 'customValue' }`) rather than a hash of the request. When that invariant breaks the " +
      "second caller's genuinely different request is discarded and `.add()` resolves to the first job's result: the " +
      "model never sees the second question and the caller is handed an answer to someone else's, with no error. " +
      "docs.bullmq.io, verbatim: \"as long as the job remains in an incomplete state (neither succeeded nor failed), " +
      "any subsequent job with the same deduplication ID will be ignored.\" PASS_ABSOLUTE needs the structural argument " +
      "to hold as a fact about the mechanism; this one holds only on caller discipline the library neither verifies nor " +
      "can verify, and its failure mode is a changed product returned as though it were the right one. That is the FAIL " +
      "condition, not a milder version of it. Repo checks out: taskforcesh/bullmq, MIT, 9,303 stars, pushed 2026-08-17.",
    savings:
      "UNQUANTIFIED, and not claimable — the prize scales with the caller's true-duplicate submission rate, which " +
      "BullMQ neither measures nor bounds, and the same mechanism that delivers it silently drops distinct work.",
    provenance: "primary-doc (docs.bullmq.io, plus the library's own Lua source read line-by-line)",
    telemetrySignal:
      "Observable content-blind at the queue: BullMQ emits a `deduplicated` event per suppression, so a count of those " +
      "against jobs submitted gives the suppression rate. What it cannot tell you is how many of those suppressions " +
      "were true duplicates rather than distinct work colliding on an id — which is the number that decides whether " +
      "this was a saving or a fault.",
    providers: ["taskforcesh/bullmq"],
    verifiedAgainst:
      "docs.bullmq.io/guide/jobs/deduplication (page Last-updated 2026-07-31) and github.com/taskforcesh/bullmq " +
      "src/commands/addStandardJob-9.lua, includes/deduplicateJobWithoutReplace.lua, includes/storeDeduplicatedNextJob.lua " +
      "— read 2026-08-17",
    trap:
      "The docs pitch Simple Mode for \"a critical update that should not be repeated if the initial attempt is still in " +
      "progress\" — a critical update, not an identical one. The encouraged usage is per-logical-task ids, which is " +
      "precisely the usage that makes the guarantee untrue.",
    settlingExperiment:
      "Reframe the entry to content-derived dedup ids (a hash of the canonicalised request body) and it becomes " +
      "adjudicable again — most likely CONTRACTUAL_ONLY, since nothing in the library enforces that the id was derived " +
      "that way. As shipped and as documented, it is not that.",
    crosscheckOverride:
      "Graded PASS_ABSOLUTE on first pass, on a correct and careful reading of the Lua source. Overruled on the ground " +
      "the first pass itself surfaced and then set aside as a sizing footnote: the dedup key is content-blind by " +
      "construction, so \"no request was ever sent\" is a property of the caller, not of the library.",
  },
  {
    name: "AWS SQS FIFO MessageDeduplicationId",
    strictVerdict: "CONTRACTUAL_ONLY",
    reasoning:
      "AWS states: \"If you retry the SendMessage action within the 5-minute deduplication interval, Amazon SQS doesn't " +
      "introduce any duplicates into the queue.\" Note where the boundary falls. The client does send the second " +
      "SendMessage; AWS discards it inside a service the customer cannot inspect. That is the provider's word about the " +
      "provider's internals — no measurement, and no client-side structural argument of the kind that carries the " +
      "enqueue-time cases where nothing ever leaves the machine. The register's own rule caps it here, and no counted " +
      "comparison of SendMessage calls against messages delivered to a consumer was run to lift it. Separately, in " +
      "explicit-id mode SQS compares only the supplied id string and never the body, so two genuinely different requests " +
      "sharing an id through a producer bug collapse into one with nothing surfaced to the caller.",
    savings:
      "UNQUANTIFIED — the cost of the suppressed duplicate enqueue, and only where the duplicate was genuine.",
    provenance: "primary-doc (AWS SQS developer guide) — provider assertion about provider-side behaviour",
    telemetrySignal:
      "Content-blind and countable, though nobody has counted it: SendMessage call count against messages actually " +
      "delivered to consumers, over a window shorter than the 5-minute dedup interval. The gap is the suppression rate. " +
      "Running that comparison is what would move this entry off CONTRACTUAL_ONLY.",
    providers: ["aws"],
    verifiedAgainst:
      "docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html " +
      "(no page-level revision date shown; read 2026-08-17)",
    trap:
      "Reads like the same mechanism as an enqueue-time client-side dedup and is not. There the duplicate never leaves " +
      "the customer's process and the argument is structural; here it goes over the wire and the argument is AWS's.",
    settlingExperiment:
      "Send N identical SendMessage calls inside one dedup interval against a FIFO queue and count messages received by " +
      "the consumer. A measured 1-of-N converts this to a pass; anything else is a finding.",
    crosscheckOverride:
      "Graded PASS_ABSOLUTE on first pass by treating an AWS documentation sentence as a structural argument. It is not " +
      "one — the distinction is whether the request leaves the client, and here it does.",
  },
  {
    name: "Team/Enterprise per-seat pricing as the sanctioned alternative to account sharing",
    strictVerdict: "CONTRACTUAL_ONLY",
    reasoning:
      "Team and Enterprise seats are Anthropic's own priced structure for exactly the multi-user access that account " +
      "sharing reaches informally and in breach. claude.com/pricing, read 2026-08-17: Standard $20/mo annual or $25/mo " +
      "monthly, Premium $100/mo annual (\"5x more usage than standard seats\") or $125/mo monthly, Enterprise from " +
      "$20/seat plus API-rate usage. It is a procurement fact rather than a request-identity technique, and it caps " +
      "below a pass for a reason visible only in the page's raw HTML: the Team/Enterprise comparison table carries a row " +
      "titled \"Priority access at high traffic times\", check-marked for Team and both Enterprise tiers. A seat holder " +
      "cannot observe their own queue position or rule out different treatment under contention, which is the same " +
      "unverifiable preferential-capacity claim that already parks the PTU and reserved-tier entries at " +
      "CONTRACTUAL_ONLY (ids 89, 103, 107, 108, 112, 113).",
    savings:
      "None as a technique. The number that matters is the alternative it replaces: there is no priced or contractual " +
      "path to one account serving more than one person, so the comparison is against a terms violation, not against a " +
      "cheaper legitimate option.",
    provenance: "primary-doc (claude.com/pricing, read as raw HTML rather than converted markdown)",
    telemetrySignal:
      "Not observable from outside. Priority access under contention is a scheduling decision inside Anthropic's " +
      "infrastructure; a customer sees only their own latency, which is indistinguishable from ordinary variance.",
    providers: ["anthropic"],
    verifiedAgainst: "claude.com/pricing (fetched as raw HTML, 2026-08-17)",
    trap:
      "A methodological one worth more than the entry: markdown conversion silently drops table cells whose content is " +
      "an icon rather than text. The \"Priority access at high traffic times\" row survives in the HTML and vanishes in " +
      "the conversion, so a sweep that reads converted pages concludes the feature does not exist. Any future sweep " +
      "adjudicating a pricing or feature-comparison table should fetch it raw.",
    settlingExperiment:
      "Nothing document-shaped settles it. It would take Anthropic stating what \"priority access\" does to a request, " +
      "or paired seat/non-seat traffic measured under a real contention event.",
    crosscheckOverride:
      "Promoted to PASS_ABSOLUTE on first pass, on the explicit premise that \"nothing on the page describes " +
      "Team/Enterprise routing to dedicated or priority capacity\". Adversarial re-read fetched the same page as raw " +
      "HTML instead of converted markdown and found exactly that description, check-marked, in a Team/Enterprise-scoped " +
      "table — restoring the verdict the 2026-08-12 brief had given it before the promotion.",
  },
  {
    name: "PromptXRay (karminski) — read-only cache-hit diagnostic",
    strictVerdict: "FAIL",
    reasoning:
      "The tool's own two files do what they say: gateway.py forwards the client's raw body unmodified. But it forwards " +
      "it to http://127.0.0.1:7411 — a LiteLLM subprocess runtime.py always spawns, with no code path that reaches the " +
      "real upstream directly. The body the provider actually receives is rebuilt by LiteLLM's " +
      "OpenAIGPTConfig.transform_request() (pinned litellm[proxy]==1.91.2), and that function is not a pass-through: it " +
      "rewrites string-form image_url into dict form, and _handle_pdf_url() fetches a referenced PDF and substitutes " +
      "re-encoded bytes for the reference before the request leaves the machine. It also strips cache_control " +
      "breakpoints when the resolved host is openai.com, and gates parameters on whether the model name appears in " +
      "LiteLLM's hardcoded canonical list — which the self-hosted and OpenAI-compatible endpoints this tool is pitched " +
      "at will not be in. So for a request carrying a file reference, the model reads different content, not merely " +
      "different bytes. The README's \"never rewrites\" is an accurate statement of intent for the code its authors " +
      "wrote and says nothing about the mandatory hop underneath it.",
    savings:
      "None — a diagnostic, not a lever. The claim under adjudication was that observing traffic through it is free of " +
      "side effects, and that is what fails.",
    provenance: "primary-doc (the tool's source, and the pinned dependency's source that actually builds the request)",
    telemetrySignal:
      "Directly observable and nobody did it: capture the bytes leaving the host and diff them against the bytes the " +
      "client handed the proxy. Any diff on a plain-text request refutes the claim without argument.",
    providers: ["karminski/PromptXRay", "BerriAI/litellm"],
    verifiedAgainst:
      "github.com/karminski/PromptXRay at 75ccf503 (repo's only commit, 2026-07-11) — README.md, gateway.py, " +
      "runtime.py, config.py, litellm_callback.py, pyproject.toml; and " +
      "raw.githubusercontent.com/BerriAI/litellm/v1.91.2/litellm/llms/openai/chat/gpt_transformation.py — read 2026-08-17",
    trap:
      "The general shape, and the one this register keeps meeting: verifying the files with the project's name on them " +
      "and treating \"reaches an internal URL unmodified\" as \"reaches the model unmodified\", when a separate " +
      "dependency the project makes mandatory is the thing that builds the outbound request.",
    settlingExperiment:
      "A live capture on the narrow slice — plain text only, canonical model name, non-openai.com host — could support " +
      "a qualified PASS_METADATA. The unqualified claim is already refuted and no experiment is needed for that.",
    crosscheckOverride:
      "The 2026-08-12 brief filed this INSUFFICIENT_EVIDENCE. The first recovery pass promoted it to PASS_METADATA " +
      "after reading four files, all inside the repo under review. Adversarial re-read opened the pinned dependency " +
      "those files hand every request to, and refuted it.",
  },

  // ── carried as the recovery pass returned them ────────────────────────────────
  {
    ...clean(grpc),
    crosscheckOverride:
      "The 2026-08-12 brief filed this PASS_SCHEDULING, reading \"paused\" as a deferral. The recovery pass read gRFC " +
      "A6, which the grpc.io page summarises, and found throttled attempts are cancelled with the failure returned to " +
      "the application immediately — an outcome change, not a timing one. Demoted by the first pass itself, before any " +
      "adversarial review.",
  },
  clean(by("Reservation amortization")),
  clean(by("Azure PTU Reservations")),
  clean(by("Bedrock Provisioned Throughput")),
  clean(by("EC2-RI-Marketplace")),
  clean(by("Automated/non-human access ban")),
  clean(by("Moonshot/Kimi")),
  {
    ...clean(midterm),
    crosscheckOverride:
      "The 2026-08-12 brief filed this INSUFFICIENT_EVIDENCE on the reasoning that \"no doc says X\" is not evidence " +
      "the answer is no. The recovery pass found the doc: Azure's EA pricing-overview page carries a \"Price changes\" " +
      "section answering it for EA committed spend. A provider's sentence caps at CONTRACTUAL_ONLY, and it covers one " +
      "of the two mechanisms named, so the Anthropic half remains open.",
  },
];

const existing = loadRegister();

const collisions = nameCollisions(existing, candidates);
if (collisions.length > 0) {
  console.error("name collisions against the standing register:");
  for (const c of collisions) console.error(`  ${c.candidate} → already id ${c.existingId}`);
  process.exit(1);
}

const { firstId, assigned } = assignIds(existing, candidates);
writeFileSync(
  "/Users/angus/dev/token-spread/docs/research/2026-08-17-sweep-12-recovered.json",
  JSON.stringify(assigned, null, 2) + "\n",
);

const counts: Record<string, number> = {};
for (const e of assigned) counts[e.strictVerdict] = (counts[e.strictVerdict] ?? 0) + 1;
console.log(`${assigned.length} entries written, ids ${firstId}-${firstId + assigned.length - 1}`);
for (const [v, n] of Object.entries(counts).sort()) console.log(`  ${n}  ${v}`);
