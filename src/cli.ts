import { basename, join } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { importClaudeCodeJsonl, type ImportProvenance } from "./importers/claudeCode";
import { importAdminUsageReport } from "./importers/adminUsageReport";
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
/**
 * `--admin <file.json>` audits an organisation from Anthropic's usage report instead of
 * local transcripts — the path for a company that does not run Claude Code.
 *
 * The file is produced on the customer's own machine and never leaves it:
 *
 *   curl https://api.anthropic.com/v1/organizations/usage_report/messages \
 *     -H "anthropic-version: 2023-06-01" \
 *     -H "x-api-key: $ANTHROPIC_ADMIN_KEY" \
 *     -G --data-urlencode "starting_at=2026-07-01T00:00:00Z" \
 *        --data-urlencode "bucket_width=1d" \
 *        --data-urlencode "group_by[]=model" \
 *        --data-urlencode "group_by[]=workspace_id" \
 *        --data-urlencode "group_by[]=service_tier" > usage.json
 *
 * One file per page; pass a comma-separated list to cover a paginated pull. No admin key
 * is read here, and nothing is sent anywhere: the report is counts and dimensions only.
 */
const adminFiles = arg("admin");
const cacheTargetRaw = arg("cache-target");
const writeOverheadRaw = arg("write-overhead");

if (adminFiles === undefined) {
  try {
    statSync(dir);
  } catch {
    console.error(`cannot read transcript directory: ${dir}`);
    process.exit(1);
  }
}

/** Walk one level of project directories, or a flat directory of .jsonl files. */

const events: UsageEvent[] = [];
const provenance: ImportProvenance = {
  linesSeen: 0, imported: 0, malformed: 0, deduped: 0, synthesizedKeys: 0, skippedNonAssistant: 0,
  compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0, unknownTtlWrites: 0,
};

// One dedup set for the whole run: the same requestId can appear in two files, and the
// same admin bucket can appear in two exports of overlapping windows.
const seen = new Set<string>();

if (adminFiles !== undefined) {
  const pages = [];
  for (const f of adminFiles.split(",").map((s) => s.trim()).filter(Boolean)) {
    try {
      pages.push(JSON.parse(await Bun.file(f).text()));
    } catch (err) {
      console.error(`cannot read admin usage report: ${f} — ${(err as Error).message}`);
      process.exit(1);
    }
  }
  const r = importAdminUsageReport(pages, { seen });
  events.push(...r.events);
  provenance.linesSeen += r.provenance.results;
  provenance.imported += r.provenance.imported;
  provenance.malformed += r.provenance.malformed;
  provenance.deduped += r.provenance.deduped;
}

for (const { path, projectId } of adminFiles === undefined ? findTranscripts(dir) : []) {
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
