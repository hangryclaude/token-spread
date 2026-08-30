import { readFileSync, writeFileSync } from "node:fs";
import { loadRegister } from "/Users/angus/dev/token-spread/src/register/load";
import { assignIds, nameCollisions, type Candidate } from "/Users/angus/dev/token-spread/src/register/merge";

const wf = JSON.parse(
  readFileSync("/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/tasks/wjn53mqbm.output", "utf8"),
);
const E: any[] = wf.result.entries;

/** index → [final verdict, what to append to reasoning, crosscheckOverride]. Absent = as adjudicated. */
const RULING: Record<number, [string, string, string]> = {
  0: [
    "INSUFFICIENT_EVIDENCE",
    "On challenge: both refuters overturned this. The verifiable facts — the env var, the changelog line — hold, but the mechanism narrative doing the argumentative work was uncited and, checked against the primary source, wrong in its specifics. The category is plausibly right; the submission is not sound as sourced, and this register does not publish a verdict on a narrative nobody could quote.",
    "Submitted and adjudicated PASS_SCHEDULING. Two independent refuters overturned it — one on sourcing, one proposing CONTRACTUAL_ONLY. Filed unresolved rather than at either, because what failed was the evidence, not the technique.",
  ],
  2: [
    "CONTRACTUAL_ONLY",
    "On challenge: the advocate overturned a FAIL, and was right to. The bar is a three-part disjunction — different tokens read, different model answering, different amount of thinking — and a keyed-PRF replacing an RNG at the sampling step trips none of them: same input, same weights, same thinking budget. The FAIL had substituted a broader self-authored test (\"a different mechanism decides what gets produced\") for the bar's actual text, which is the same paraphrase-as-standard failure the register polices in sources. It rests here rather than higher because the equivalence claim — no quality impact, indistinguishable to a reader — is an assertion this project did not verify, and its supporting measurement is Google DeepMind's on Gemini traffic (SynthID-Text, Nature 2024), not anyone's on Anthropic's deployment.",
    "Adjudicated FAIL. Overturned by the advocate pass, which showed the FAIL applied a broadened restatement of the bar rather than the bar. This is the first entry in the register moved by an advocate rather than a refuter.",
  ],
  9: [
    "INSUFFICIENT_EVIDENCE",
    "On challenge: both refuters overturned. The peak/off-peak multipliers are quoted correctly from raw source, but what a credit multiplier does to a bill under a prepaid coding-plan quota — as against a metered per-token price — was not established, and neither refuter could establish it either.",
    "Adjudicated PASS_SCHEDULING. Two independent refuters both landed on INSUFFICIENT_EVIDENCE, agreeing the quotes are real and the consequence is not shown.",
  ],
  11: [
    "CONTRACTUAL_ONLY",
    "On challenge: both refuters overturned. The quotes are verbatim and re-fetched, but an expiry rule is the provider's statement of its own future conduct, and the register's rule caps a provider's word here regardless of how clearly it reads.",
    "Adjudicated PASS_ABSOLUTE. Two independent refuters both proposed CONTRACTUAL_ONLY on the same ground.",
  ],
  13: [
    "FAIL",
    "On challenge: one of two refuters overturned, and its argument is structural rather than evidential. Both branches of the guard key on `max_tokens` — the caller's declared ceiling — not on actual output length or latency. The token-cap branch fires unconditionally for any request declaring more than the per-model non-streaming limit, so it refuses calls that would have completed normally. A refused call is not a cheaper call; it is zero thinking where some was intended, which is the bar's own FAIL condition, on the same reading that scoped the K8s Forbid entry (id 187). The second refuter upheld the pass and its sourcing was never in doubt — the source citations reproduce exactly at the pinned commit.",
    "Adjudicated PASS_ABSOLUTE. One of two refuters overturned it on mechanism and the other upheld it. Failed rather than demoted a single step, because the surviving objection is that the guard's trigger is the declared ceiling rather than anything about the request that would actually be sent.",
  ],
  15: [
    "FAIL",
    "On challenge: both refuters overturned. The default lock key (class, args, queue) is content-derived only if the args ARE the model request, and Sidekiq's own guidance is the opposite — keep args small, pass identifiers, resolve the real request at execution time, because args are serialised into Redis. Under the documented pattern the key is an enqueue-time label, and two enqueues sharing it can resolve to different model requests if the conversation, document or retrieved context moved between pushes. That is the same content-blindness that failed BullMQ at id 189, arrived at from the opposite direction: not a caller-supplied string, but a content-derived key over the wrong content.",
    "Adjudicated PASS_ABSOLUTE on the premise that the lock key covers the request payload. Two independent refuters overturned it; sourcing was confirmed verbatim by both, including a \"10 minutes... best effort\" sentence the first pass's fetch had dropped.",
  ],
  19: [
    "PASS_ABSOLUTE",
    "On challenge: the advocate overturned a FAIL and the scope now sits in the title. Where the task ID is bound 1:1 to identical request content — a hash of the request body, functioning as a true idempotency key rather than an unrelated business ID — the duplicate task is never created, so no request is ever sent and the structural argument holds. Where the ID is an arbitrary business identifier it does not, and this entry does not cover that case. Same shape, and the same explicit scoping, as the K8s CronJob Forbid entry at id 187.",
    "Adjudicated FAIL on the blanket claim. The advocate pass showed the source supports a narrower one and quoted it; the scope was moved into the name so the claim cannot be read wider than it is.",
  ],
  23: [
    "CONTRACTUAL_ONLY",
    "On challenge: the advocate overturned an unresolved. It upheld the framing — the behaviour is unconfirmed and three explanations were live — but found a documentation page the first pass never cited that rules out one of the three, which is enough to move this off the fence and onto the provider's word.",
    "Adjudicated INSUFFICIENT_EVIDENCE. The advocate found a source the adjudication had not read.",
  ],
};

const SCOPED_NAME: Record<number, string> = {
  19: "Google Cloud Tasks task-ID deduplication — valid only where the task ID is a hash of the request content",
};

const candidates: Candidate[] = E.map((e, i) => {
  const r = RULING[i];
  const name = SCOPED_NAME[i] ?? e.name;
  if (!r) return { ...e, name } as Candidate;
  const [verdict, appended, override] = r;
  return {
    ...e,
    name,
    strictVerdict: verdict,
    reasoning: `${e.reasoning}\n\n${appended}`,
    crosscheckOverride: override,
  } as Candidate;
});

const missingDate = candidates.filter((c) => !/\b20\d{2}-\d{2}-\d{2}\b/.test(String(c.verifiedAgainst)));
if (missingDate.length > 0) {
  console.error(`${missingDate.length} entries carry no dated source:`);
  for (const c of missingDate) console.error(`  ${c.name.slice(0, 60)} — ${c.verifiedAgainst}`);
  process.exit(1);
}

const existing = loadRegister();
const collisions = nameCollisions(existing, candidates);
if (collisions.length > 0) {
  for (const c of collisions) console.error(`collision: ${c.candidate} → id ${c.existingId}`);
  process.exit(1);
}

const { firstId, assigned } = assignIds(existing, candidates);
writeFileSync(
  "/Users/angus/dev/token-spread/docs/research/2026-08-17-sweep-13.json",
  JSON.stringify(assigned, null, 2) + "\n",
);

const counts: Record<string, number> = {};
for (const e of assigned) counts[e.strictVerdict] = (counts[e.strictVerdict] ?? 0) + 1;
console.log(`${assigned.length} entries, ids ${firstId}-${firstId + assigned.length - 1}`);
for (const [v, n] of Object.entries(counts).sort()) console.log(`  ${String(n).padStart(2)}  ${v}`);
console.log(`\nchanged on challenge: ${Object.keys(RULING).length}`);
