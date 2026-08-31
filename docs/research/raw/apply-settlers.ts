import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cohortFiles, RESEARCH_DIR, type Entry } from "/Users/angus/dev/token-spread/src/register/load";

/**
 * The 2026-08-20 advocate/settler pass: 76 findings across every sweep-14 FAIL and
 * INSUFFICIENT_EVIDENCE (the advocate pass sweep 13 got and sweep 14 was owed) plus the 49
 * older unresolved entries. 29 verdict changes were proposed; each faced two independent
 * skeptics re-fetching every source; 5 survived both. This script applies only those 5,
 * plus settlingExperiment for still-unresolved entries that lacked one. Everything else —
 * the 24 killed proposals and their refutations — lives in the raw file and the brief.
 */

const D = "2026-08-20";
const RAW = JSON.parse(
  readFileSync(join(RESEARCH_DIR, "raw", "2026-08-20-advocate-settler-raw.json"), "utf8"),
);

interface Finding {
  id: number;
  currentVerdict: string;
  recommendedVerdict: string;
  correctionNote: string | null;
  settlingExperiment: string | null;
}

const survivors: Finding[] = RAW.survivors;
const SURVIVOR_IDS = new Set(survivors.map((f) => f.id));

// settlingExperiment fills: entries that REMAIN unresolved, currently lack one, and whose
// finding (confirmation or killed proposal — the experiment is useful either way) wrote one.
const fillCandidates: Finding[] = [
  ...RAW.confirmations,
  ...RAW.rejected.map((x: { finding: Finding }) => x.finding),
].filter((f: Finding) => !SURVIVOR_IDS.has(f.id) && f.settlingExperiment);
const fillById = new Map(fillCandidates.map((f) => [f.id, f]));

const applied = { verdicts: 0, fills: 0 };
const seen = new Set<number>();

for (const f of cohortFiles()) {
  const path = join(RESEARCH_DIR, f);
  const src = readFileSync(path, "utf8");
  const entries = JSON.parse(src) as Entry[];
  // Preserve each file's serialization exactly — indent width and trailing newline both
  // vary across cohorts, and a formatting-only diff would bury the real one.
  const indent = /^\[\n {2}\{/.test(src) ? 2 : 1;
  const trailingNl = src.endsWith("\n");
  let touched = false;

  for (const e of entries) {
    const s = survivors.find((x) => x.id === e.id);
    if (s) {
      seen.add(e.id);
      if (e.strictVerdict !== s.currentVerdict) {
        throw new Error(`id ${e.id}: register says ${e.strictVerdict}, finding assumed ${s.currentVerdict}`);
      }
      if (!s.correctionNote) throw new Error(`id ${e.id}: surviving change has no correctionNote`);
      e.strictVerdict = s.recommendedVerdict as Entry["strictVerdict"];
      e.corrections = [
        ...(e.corrections ?? []),
        { date: D, kind: "verdict-changed", note: s.correctionNote },
      ];
      if (s.settlingExperiment === null || s.recommendedVerdict !== "INSUFFICIENT_EVIDENCE") {
        // A settled entry's settlingExperiment is history, not a to-do; leave whatever is there.
      }
      applied.verdicts++;
      touched = true;
      continue;
    }
    const fill = fillById.get(e.id);
    if (fill && e.strictVerdict === "INSUFFICIENT_EVIDENCE" && !e.settlingExperiment) {
      e.settlingExperiment = fill.settlingExperiment!;
      applied.fills++;
      touched = true;
    }
  }

  if (touched) {
    writeFileSync(path, JSON.stringify(entries, null, indent) + (trailingNl ? "\n" : ""));
  }
}

const missing = survivors.filter((s) => !seen.has(s.id)).map((s) => s.id);
if (missing.length) {
  console.error(`survivor ids not found in any cohort: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`applied ${applied.verdicts} verdict changes, ${applied.fills} settlingExperiment fills`);
