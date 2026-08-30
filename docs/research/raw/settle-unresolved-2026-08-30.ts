/**
 * Lands the 2026-08-30 unresolved-settlement pass: 60 INSUFFICIENT_EVIDENCE entries each got
 * a settler running its own settlingExperiment desk-checkably; every proposed verdict change
 * faced two hostile skeptics and landed only if both declined to refute. Raw agent output:
 * 2026-08-30-settle-unresolved-raw.json. Result: 6 changes applied, 20 proposals killed by
 * skeptics, 33 settlingExperiments sharpened in place.
 *
 *   bun run docs/research/raw/settle-unresolved-2026-08-30.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "..");
const DATE = "2026-08-30";

const NOTES: Record<number, string> = {
  15: "Settled up from the 2026-08-12 downgrade by reading the actual source, not the README: cachebench/core.py forwards the wrapped call with unmodified args and only reads usage fields off the returned response; the retry that would break identity is opt-in and off by default. The eventual-consistency claim traces to anthropic-sdk-python#1451 — real, reproduced by two independent users, and since fixed server-side. Two hostile skeptics re-fetched every source; both declined to refute. Reach stays null: both cited repos are 0-star.",
  250: "The bot-PR trap resolved the right way this time: stale-bot-closed #36808 was superseded by the human-authored #36762, merged 2026-08-26 as abf6ef96db6 and ancestry-confirmed via gh api compare (behind main, ahead 0). The diff is pure cost accounting — it parses Bedrock's own cacheDetails array into the tiered-price calculator and touches no outbound request. Both skeptics re-verified independently from primary sources.",
  252: "Both candidate fix PRs are dead as of 2026-08-30: #28435 was stale-bot-closed with its CLA never signed, and the kwargs-built cache-affinity key still ignores cache_control TTL in shipped code. What was scored unresolved awaiting a fix is a present-tense defect that re-creates paid caches across deployments — FAIL as a technique; it stands in the register as a documented trap.",
  310: "langchain-ai/langchain#39590 merged 2026-08-11 as a2a9b1bde436, auto-closing issue #39249 one second later; re-verified via gh with merge commit and closing references. Reporting extended-thinking tokens in usage_metadata is a pure client-side accounting fix — the outbound Anthropic request is untouched. Both skeptics re-verified.",
  331: "The cited PR #24803 is a confirmed no-op merge (0 files changed, 0-byte diff); the real fix is #24893, merged nineteen minutes earlier and code-confirmed on current main: Guardian forked reviews now pass the shared reuse key as prompt_cache_key — routing metadata the model never reads. Both skeptics declined to refute.",
  332: "Settled from the actual diff of openai-agents-python#4446 rather than issue prose: the pre-fix compaction path had no usage handling at all, and the fix adds wrapper.usage.add(...) for the already-billed responses.compact call — pure client-side token accounting over byte-identical traffic. Both skeptics re-verified from the diff.",
};

const raw = JSON.parse(readFileSync(join(import.meta.dir, "2026-08-30-settle-unresolved-raw.json"), "utf8"));
const changes = new Map<number, string>(raw.changes.map((c: any) => [c.id, c.toVerdict]));
const sharpened = new Map<number, string>(raw.sharpened.map((s: any) => [s.id, s.sharpenedExperiment]));

for (const id of changes.keys()) {
  if (!NOTES[id]) throw new Error(`no correction note written for id ${id}`);
}

const cohorts: string[] = JSON.parse(readFileSync(join(DIR, "cohorts.json"), "utf8"));
let applied = 0;
let sharpenedCount = 0;
for (const file of cohorts) {
  const path = join(DIR, file);
  const entries = JSON.parse(readFileSync(path, "utf8"));
  let touched = false;
  for (const e of entries) {
    const to = changes.get(e.id);
    if (to) {
      if (e.strictVerdict !== "INSUFFICIENT_EVIDENCE") throw new Error(`id ${e.id} is ${e.strictVerdict}, expected INSUFFICIENT_EVIDENCE`);
      e.corrections = [...(e.corrections ?? []), { date: DATE, kind: "verdict-changed", note: NOTES[e.id] }];
      e.strictVerdict = to;
      applied++;
      touched = true;
    }
    const sharp = sharpened.get(e.id);
    if (sharp && e.strictVerdict === "INSUFFICIENT_EVIDENCE") {
      e.settlingExperiment = sharp;
      sharpenedCount++;
      touched = true;
    }
  }
  if (touched) writeFileSync(path, JSON.stringify(entries, null, 2) + "\n");
}

if (applied !== changes.size) throw new Error(`applied ${applied} of ${changes.size} changes — an id was not found`);
console.log(`applied ${applied} verdict changes, sharpened ${sharpenedCount} settling experiments`);
