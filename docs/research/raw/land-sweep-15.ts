import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRegister, cohortFiles, RESEARCH_DIR, type Entry, type StrictVerdict } from "/Users/angus/dev/token-spread/src/register/load";
import { assignIds, nameCollisions, type Candidate } from "/Users/angus/dev/token-spread/src/register/merge";

/**
 * Lands sweep 15. The mining/adjudication/refutation ran as a 44-agent workflow on
 * 2026-08-20 (raw: 2026-08-20-sweep-15-raw.json); this script applies the maintainer
 * decisions its completeness critic forced:
 *   - refuter overrides resolve mechanically to the LOWEST class any non-upholding
 *     refuter supports (the register's verdicts-lowered-under-challenge rule);
 *   - five entries are dropped as duplicates or corroboration of existing rows
 *     (critic items 22, 23, 26, 29, 30);
 *   - three savings fields are scrubbed of figures their sources never state
 *     (critic items 13-15 — 13 moot, its entry is dropped).
 */

const RAW = JSON.parse(readFileSync(join(RESEARCH_DIR, "raw", "2026-08-20-sweep-15-raw.json"), "utf8"));

const RANK: Record<string, number> = {
  FAIL: 0, INSUFFICIENT_EVIDENCE: 1, CONTRACTUAL_ONLY: 2,
  PASS_ABSOLUTE: 3, PASS_METADATA: 3, PASS_SCHEDULING: 3, PASS_REPLAY: 3,
};

/** Entries the critic showed to duplicate existing rows or sibling entries. */
const DROP: Record<string, string> = {
  "anthropic-sdk-python #1451": "corroborates register id 255 (same server-side fix, same close date) rather than standing alone",
  "Cross-Region Inference for OpenAI models": "its own reasoning concedes the mechanism is register id 101's, extended to another model family",
  "service_tier request field": "its own reasoning concedes it sharpens register id 123 rather than standing alone",
  "processing_status is a closed 3-value enum": "its own text: corroborating evidence for the three batch-tool entries, not a technique",
  "OpenClaw": "the class of single-source, unverifiable spend-spiral anecdote that register id 161 exists to foreclose",
};

const dropReason = (name: string) => Object.entries(DROP).find(([k]) => name.includes(k))?.[1];

interface Result { entry: Record<string, unknown>; refutations: { upheld: boolean; revisedVerdict: string; note: string }[] }

const landed: Candidate[] = [];
const dropped: { name: string; reason: string }[] = [];
const overridden: { name: string; from: string; to: string }[] = [];

for (const x of RAW.results as Result[]) {
  const e = { ...x.entry } as Record<string, unknown>;
  const name = String(e.name);

  const drop = dropReason(name);
  if (drop) { dropped.push({ name, reason: drop }); continue; }

  // resolve refuter overrides to the lowest supported class
  const original = String(e.strictVerdict);
  let final = original;
  let why: string | null = null;
  for (const r of x.refutations) {
    if (r.upheld) continue;
    if (RANK[r.revisedVerdict] < RANK[final]) { final = r.revisedVerdict; why = r.note; }
    else if (RANK[r.revisedVerdict] === RANK[final] && final !== original && why !== null) {
      why += " A second refuter reached the same class independently.";
    }
  }
  if (final !== original) {
    e.strictVerdict = final;
    e.crosscheckOverride = { from: original, to: final, why };
    overridden.push({ name, from: original, to: final });
  }

  // scrubs: figures the sources never state (critic 14, 15), and the settling
  // experiment the GPT-5.6 downgrade to INSUFFICIENT_EVIDENCE now requires (critic 17)
  if (name.includes("Fast mode")) {
    e.savings = String(e.savings).replace(" (up to 2.5x output tokens/sec)", "");
  }
  if (name.includes("unbounded subagent recursion")) {
    e.savings =
      "None — documents a waste vector (an unbounded multiplier on tokens and cost), not a savings " +
      "technique. Issue #68619 is the verified source; the incident figures circulating in linked " +
      "issues were not independently fetched by this sweep and are deliberately not repeated here.";
  }
  if (name.includes("GPT-5.6 caching")) {
    e.settlingExperiment =
      "Run identical multi-turn traffic against GPT-5.6 on Bedrock twice — once with explicit " +
      "cache_control breakpoints, once implicit-only — and diff the billed cache-write line items " +
      "against the same traffic on GPT-5.4/5.5 automatic caching. A 1.25x write charge appearing " +
      "only on GPT-5.6 settles the pricing claim; equal charges on the implicit-only run settle the " +
      "'applies to implicit and explicit writes alike' clause.";
  }

  // null-valued optionals are absences, not values — the cohort files never carry them
  for (const k of Object.keys(e)) if (e[k] === null) delete e[k];
  landed.push(e as unknown as Candidate);
}

const existing = loadRegister();
const collisions = nameCollisions(existing, landed);
if (collisions.length) {
  console.error("name collisions with the register:", JSON.stringify(collisions, null, 1));
  process.exit(1);
}

const { firstId, assigned } = assignIds(existing, landed);
const file = "2026-08-20-sweep-15.json";
writeFileSync(join(RESEARCH_DIR, file), JSON.stringify(assigned, null, 2) + "\n");

const cohortsPath = join(RESEARCH_DIR, "cohorts.json");
const cohorts = JSON.parse(readFileSync(cohortsPath, "utf8")) as string[];
if (!cohorts.includes(file)) cohorts.push(file);
writeFileSync(cohortsPath, JSON.stringify(cohorts, null, 1) + "\n");

console.log(`landed ${assigned.length} entries (ids ${firstId}-${firstId + assigned.length - 1}), dropped ${dropped.length}, overridden ${overridden.length}`);
for (const o of overridden) console.log(`  ↻ ${o.from} -> ${o.to} | ${o.name.slice(0, 70)}`);
for (const d of dropped) console.log(`  ✗ dropped | ${d.name.slice(0, 70)}`);
