#!/usr/bin/env bun
import { basename, join } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { importClaudeCodeJsonl, type ImportProvenance } from "./importers/claudeCode";
import { importAdminUsageReport, type AdminImportProvenance } from "./importers/adminUsageReport";
import { findTranscripts } from "./walk";
import { computeMetrics, measuredCacheWriteOverheadPct } from "./metrics";
import { buildReport } from "./report";
import { RATE_CARD_2026_08_08 as CARD } from "./rates";
import { detectTtlRightSizing } from "./detect/ttlRightSizing";
import { detectTtlCrossing } from "./detect/ttlCrossing";
import { detectSpendAnomaly } from "./detect/spendAnomaly";
import { renderAuditHtml } from "./render/auditHtml";
import { simulate } from "./simulate";
import type { UsageEvent } from "./types";

export const VERSION = "0.1.0";

/** Every flag the program accepts. One list, so --help and validation cannot disagree. */
const FLAGS = [
  { name: "dir", arg: "<path>", desc: "where to look for transcripts (default ~/.claude/projects)" },
  { name: "admin", arg: "<files>", desc: "comma-separated Admin usage-report JSON; skips transcripts" },
  { name: "html", arg: "<path>", desc: "write the audit as a standalone document" },
  { name: "json", arg: "", desc: "emit the full report object" },
  { name: "cache-target", arg: "<n>", desc: "simulated cache-hit target, integer percent" },
  { name: "write-overhead", arg: "<n>", desc: "cache-write overhead assumption, integer percent" },
  { name: "batch-share", arg: "<n>", desc: "standard-tier share priced via Message Batches, integer percent (opt-in, contractual)" },
  { name: "only", arg: "<file>", desc: "restrict to one transcript file" },
  { name: "help", arg: "", desc: "this" },
  { name: "version", arg: "", desc: "print the version" },
] as const;

const KNOWN = new Set(FLAGS.map((f) => f.name));

// A silently ignored --htlm is how someone concludes the tool cannot write documents.
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--") && !KNOWN.has(a.slice(2) as never)) {
    console.error(`unknown flag: ${a}\nrun with --help to see what is accepted`);
    process.exit(2);
  }
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  // `--cache-target --json` used to hand "--json" to Number() and die with a raw stack trace —
  // the one validation path in the file that didn't produce a clean one-line refusal.
  if (v === undefined || v.startsWith("--")) {
    console.error(`--${name} needs a value\nrun with --help to see what is accepted`);
    process.exit(2);
  }
  return v;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

if (flag("version")) {
  console.log(VERSION);
  process.exit(0);
}

if (flag("help")) {
  const width = Math.max(...FLAGS.map((f) => `--${f.name} ${f.arg}`.length));
  console.log(`token-spread ${VERSION} — a read-only audit of what Claude usage costs.

usage:
  bun run src/cli.ts [flags]

flags:
${FLAGS.map((f) => `  ${`--${f.name} ${f.arg}`.padEnd(width)}  ${f.desc}`).join("\n")}

examples:
  bun run src/cli.ts                             audit this machine
  bun run src/cli.ts --html audit.html           write the document
  bun run src/cli.ts --admin usage.json --json   audit an org, machine-readable

It reads. The only file it writes is the one named by --html.`);
  process.exit(0);
}

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
/**
 * A percent-valued flag: integer 0-100, or a clean one-line refusal. Number("abc") is NaN
 * and used to ride straight into simulate(), which threw a raw stack trace — the same
 * class of crash the missing-value guard in arg() already prevents.
 */
function intPct(name: string): number | undefined {
  const raw = arg(name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    console.error(`--${name} must be an integer percent 0-100, got ${raw}\nrun with --help to see what is accepted`);
    process.exit(2);
  }
  return n;
}

const cacheTarget = intPct("cache-target");
const writeOverhead = intPct("write-overhead");
/** Opt-in by construction: absent flag means the batch lever never appears in any output. */
const batchShare = intPct("batch-share");
/** `--html <path>` writes the audit as a standalone document — the thing a buyer forwards. */
const htmlOut = arg("html");

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
  // Every field must be listed here: both merges below iterate Object.keys(provenance) or a
  // typed key map derived from it, so a counter missing from this literal is silently never
  // accumulated and reads as undefined downstream. thinkingDetailRecords did exactly that
  // until 2026-08-12, and pages/buckets/unpriceableTier did it again until 2026-08-21 — the
  // tests passed and the real run stayed quiet, which is the worst combination available.
  thinkingDetailRecords: 0, pages: 0, buckets: 0, unpriceableTier: 0,
};

// One dedup set for the whole run: the same requestId can appear in two files, and the
// same admin bucket can appear in two exports of overlapping windows.
const seen = new Set<string>();

/**
 * Where every `AdminImportProvenance` counter lands on the merged `ImportProvenance` shape.
 * A `Record` keyed by `keyof AdminImportProvenance` — so adding a field to that interface
 * without adding it here is a compile error, not a silent drop.
 */
const ADMIN_PROVENANCE_KEYS: Record<keyof AdminImportProvenance, keyof ImportProvenance> = {
  pages: "pages", buckets: "buckets", results: "linesSeen",
  imported: "imported", malformed: "malformed", deduped: "deduped",
  unpriceableTier: "unpriceableTier",
};

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
  // Object.keys(r.provenance) as (keyof AdminImportProvenance)[], so ADMIN_PROVENANCE_KEYS
  // must cover every one of them — TypeScript, not an adversarial review, catches the next
  // field AdminImportProvenance gains and this loop would otherwise drop on the floor. The
  // same discipline as the transcript merge's exhaustive Object.keys loop below, adapted for
  // the one field that changes name at this boundary: `results` (the admin report's own term
  // for a row inside a bucket) becomes `linesSeen` (the transcript-shaped term everything
  // downstream reads).
  for (const k of Object.keys(r.provenance) as (keyof AdminImportProvenance)[]) {
    provenance[ADMIN_PROVENANCE_KEYS[k]] += r.provenance[k];
  }
}

for (const { path, projectId } of adminFiles === undefined ? findTranscripts(dir) : []) {
  if (only && basename(path) !== only) continue;
  const text = await Bun.file(path).text();
  const r = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId, seen });
  events.push(...r.events);
  for (const k of Object.keys(provenance) as (keyof ImportProvenance)[]) provenance[k] += r.provenance[k];
}

if (events.length === 0) {
  // A clean $0.00 report here is indistinguishable from a real audit of a quiet month,
  // and the most likely cause is a wrong path. Refuse rather than reassure.
  if (adminFiles !== undefined) {
    console.error(
      `no priced events in the admin usage report — the file parsed but produced no usage.\n` +
      `check that it is the response body from /v1/organizations/usage_report/messages.`);
  } else if (provenance.linesSeen === 0) {
    console.error(
      `no transcripts found under ${dir}\n` +
      `expected .jsonl files at any depth. finding nothing is not the same as finding no spend.`);
  } else {
    console.error(
      `no priced events: read ${provenance.linesSeen.toLocaleString()} records but none carried usage.\n` +
      `${provenance.malformed.toLocaleString()} were malformed. this points at a parsing problem, not a quiet month.`);
  }
  process.exit(1);
}

const metrics = computeMetrics(events, CARD);

if (metrics.overall.events === 0) {
  // The guard above catches "found nothing to import". This catches the hole an adversarial
  // review found on 2026-08-12: everything imported and NOTHING priced — a directory entirely on
  // the priority tier sailed past the import guard and printed "$0.00 across 0 priced events"
  // with exit 0. Refuse rather than reassure applies to every layer that can empty the report,
  // not just the first one.
  const s = metrics.skipped;
  console.error(
    `no priceable events: ${events.length.toLocaleString()} imported, every one excluded ` +
    `(${s.unknown_model} unknown model, ${s.unknown_tier} unpriceable service tier, ${s.malformed} failed pricing).\n` +
    `a $0.00 report over zero priced events is not an audit — fix the exclusions and rerun.`);
  process.exit(1);
}

const observedPct = Math.round(metrics.cacheHitRate * 100);

// Prefer the measured write overhead over the spec's 5% default — deleting operator-set
// assumptions in favour of real numbers is the whole point of this slice. The pure
// simulate() keeps the 5% fallback so the spec's worked example still reproduces.
const measuredOverhead = measuredCacheWriteOverheadPct(metrics);
const writeOverheadPct = writeOverhead ?? measuredOverhead;

const assumptions = {
  targetCacheHitPct: cacheTarget ?? Math.max(observedPct, 90),
  ...(writeOverheadPct === null ? {} : { cacheWriteOverheadPct: writeOverheadPct }),
  ...(batchShare === undefined ? {} : { batchShareTargetPct: batchShare }),
};

const report = buildReport({
  metrics,
  simulation: simulate(metrics, CARD, assumptions),
  ttlRightSizing: detectTtlRightSizing(events, CARD),
  ttlCrossing: detectTtlCrossing(events),
  spendAnomaly: detectSpendAnomaly(metrics),
  assumptions,
  provenance,
  card: CARD,
  generatedAt: new Date(),
});

if (htmlOut !== undefined) {
  await Bun.write(htmlOut, renderAuditHtml(report));
  console.error(`wrote ${htmlOut}`);
}

if (flag("json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(report.humanSummary);
  if (report.warnings.length) {
    console.log("\nWarnings:");
    for (const w of report.warnings) console.log(`  ! ${w}`);
  }
}
