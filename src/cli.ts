import { basename, join } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { importClaudeCodeJsonl, type ImportProvenance } from "./importers/claudeCode";
import { findTranscripts } from "./walk";
import { computeMetrics, measuredCacheWriteOverheadPct } from "./metrics";
import { buildReport } from "./report";
import { RATE_CARD_2026_08_08 as CARD } from "./rates";
import { detectTtlRightSizing } from "./detect/ttlRightSizing";
import { simulate } from "./simulate";
import type { UsageEvent } from "./types";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const dir = arg("dir", join(process.env.HOME ?? "", ".claude", "projects"))!;
const only = arg("only");
const cacheTargetRaw = arg("cache-target");
const writeOverheadRaw = arg("write-overhead");

try {
  statSync(dir);
} catch {
  console.error(`cannot read transcript directory: ${dir}`);
  process.exit(1);
}

/** Walk one level of project directories, or a flat directory of .jsonl files. */

const events: UsageEvent[] = [];
const provenance: ImportProvenance = {
  linesSeen: 0, imported: 0, malformed: 0, deduped: 0, synthesizedKeys: 0, skippedNonAssistant: 0,
  compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0, unknownTtlWrites: 0,
};

// One dedup set for the whole run: the same requestId can appear in two files.
const seen = new Set<string>();

for (const { path, projectId } of findTranscripts(dir)) {
  if (only && basename(path) !== only) continue;
  const text = await Bun.file(path).text();
  const r = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId, seen });
  events.push(...r.events);
  for (const k of Object.keys(provenance) as (keyof ImportProvenance)[]) provenance[k] += r.provenance[k];
}

const metrics = computeMetrics(events, CARD);
const observedPct = Math.round(metrics.cacheHitRate * 100);

// Prefer the measured write overhead over the spec's 5% default — deleting operator-set
// assumptions in favour of real numbers is the whole point of this slice. The pure
// simulate() keeps the 5% fallback so the spec's worked example still reproduces.
const measuredOverhead = measuredCacheWriteOverheadPct(metrics);
const writeOverheadPct = writeOverheadRaw !== undefined ? Number(writeOverheadRaw) : measuredOverhead;

const assumptions = {
  targetCacheHitPct: cacheTargetRaw === undefined ? Math.max(observedPct, 90) : Number(cacheTargetRaw),
  ...(writeOverheadPct === null ? {} : { cacheWriteOverheadPct: writeOverheadPct }),
};

const report = buildReport({
  metrics,
  simulation: simulate(metrics, CARD, assumptions),
  ttlRightSizing: detectTtlRightSizing(events, CARD),
  assumptions,
  provenance,
  card: CARD,
  generatedAt: new Date(),
});

if (flag("json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(report.humanSummary);
  if (report.warnings.length) {
    console.log("\nWarnings:");
    for (const w of report.warnings) console.log(`  ! ${w}`);
  }
}
