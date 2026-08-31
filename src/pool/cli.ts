#!/usr/bin/env bun
/**
 * The pool ledger CLI (spec §5, §6, §10). Every command is a single read-eval-print pass —
 * nothing here loops or schedules itself; that is cron/launchd's job, not this process's.
 * This is the one file in src/pool allowed to read the real clock (`new Date()`), because
 * it is the outermost shell: something has to supply the real "now" the rest of the
 * system only ever receives as an injected string.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCostReportUrl, buildUsageReportUrl, fetchAllPages, pollOnce,
} from "./poller";
import { appendRows, balances, creditRow, parseLedgerJsonl, serializeLedgerRow } from "./ledger";
import { peakBurnPerMinuteMicroCents, reserveMicroCents } from "./reserve";
import { budgetDecision } from "./budget";
import { ledgerDailyByWorkspace, parseCostReport, reconcile, reconciliationRows } from "./reconcile";
import { memberById, memberToWorkspace, parsePoolConfig } from "./config";
import { formatCents, microCentsToCents } from "../pricing";
import type { LedgerState, PoolConfig } from "./types";

export const VERSION = "0.1.0";

const HELP = `token-spread-pool ${VERSION} — the pool ledger (design: docs/specs/2026-08-30-pool-ledger-design.md).

usage:
  bun run src/pool/cli.ts <command> [flags]

commands:
  status      per-member credited/consumed/balance/reserve/spendable/capped table
  poll        one usage-report poll cycle: fetch, price, append, alert/enforce
  reconcile   compare the ledger against Anthropic's cost report for one day
  credit      record a top-up that happened outside this system (no payment processing)

common flags (status, poll, reconcile, credit):
  --config <path>   pool config JSON (see src/pool/config.ts, EXAMPLE_POOL_CONFIG)
  --data <dir>      the directory ledger.jsonl, raw/, alerts.json and health.json live under

poll flags:
  --enforce                actually deactivate a hard-capped key (default: dry run, prints
                            "DRY-RUN would ..." for every action instead of performing it)
  --admin-key-env <name>   env var holding the Admin API key (default ANTHROPIC_ADMIN_KEY)

  poll never loops. It fetches once, prices, appends, and exits. Run it from cron or
  launchd on the cadence you want (spec §4 says once a minute for the sustained rate).

reconcile flags:
  --day <YYYY-MM-DD>       UTC day to reconcile (default: yesterday, UTC — a day is only
                            worth reconciling once it has fully elapsed)
  --admin-key-env <name>   env var holding the Admin API key (default ANTHROPIC_ADMIN_KEY)

  Exits 2 if any workspace-day is outside tolerance (spec §6) — a cron job turns that
  into an alarm. 0 means every compared day matched within tolerance.

credit flags:
  --member <id>     member id from the config
  --cents <n>       amount in US cents, a positive integer (e.g. 2000 = $20.00)
  --note <text>     what this credit is for

  This is bookkeeping for money that moved outside the system — there is no payment
  processing here (spec §10). Running the same member/cents/note on the same UTC day
  twice posts once and dedups the second time.

exit codes: 0 ok, 1 usage or config error, 2 reconciliation out of tolerance.

It reads. The only files it writes live under --data.`;

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    console.error(`--${name} needs a value\nrun with --help to see what is accepted`);
    process.exit(1);
  }
  return v;
}

const flag = (argv: string[], name: string) => argv.includes(`--${name}`);

function loadConfig(argv: string[]): PoolConfig {
  const path = arg(argv, "config");
  if (path === undefined) {
    console.error("--config is required\nrun with --help to see what is accepted");
    process.exit(1);
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`cannot read pool config: ${path} — ${(err as Error).message}`);
    process.exit(1);
  }
  const { config, problems } = parsePoolConfig(json);
  if (config === null) {
    console.error(`invalid pool config: ${path}`);
    for (const p of problems) console.error(`  ! ${p}`);
    process.exit(1);
  }
  return config;
}

function loadDataDir(argv: string[]): string {
  const dir = arg(argv, "data");
  if (dir === undefined) {
    console.error("--data is required\nrun with --help to see what is accepted");
    process.exit(1);
  }
  return dir;
}

function readLedgerState(dataDir: string): LedgerState {
  const path = join(dataDir, "ledger.jsonl");
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  return parseLedgerJsonl(text.split("\n")).state;
}

function appendToLedgerFile(dataDir: string, rows: readonly { seq: number }[]): void {
  if (rows.length === 0) return;
  mkdirSync(dataDir, { recursive: true });
  const text = rows.map((r) => serializeLedgerRow(r as Parameters<typeof serializeLedgerRow>[0])).join("\n") + "\n";
  appendFileSync(join(dataDir, "ledger.jsonl"), text);
}

function requireAdminKey(envName: string): string {
  const key = process.env[envName];
  if (key === undefined || key === "") {
    console.error(
      `missing admin key: environment variable ${envName} is not set\n` +
      `run with --help to see what is accepted`,
    );
    process.exit(1);
  }
  return key;
}

/** The real wall clock, read exactly once per invocation and threaded down as a string. */
const nowIso = () => new Date().toISOString();

/**
 * Test-only network seam: when set, requests to the real Admin API are rewritten to this
 * base instead. Unset (the only way this ships), every request goes to api.anthropic.com
 * unchanged — this exists purely so a spawned CLI process can be pointed at a local stub
 * server in tests, since there is no other way to fake `fetch` across a process boundary.
 */
const TEST_BASE_URL = process.env.TOKEN_SPREAD_TEST_BASE_URL;
const fetchFn: typeof fetch = TEST_BASE_URL === undefined
  ? fetch
  : (((input: string | URL | Request, init?: RequestInit) =>
      fetch(String(input).replace("https://api.anthropic.com", TEST_BASE_URL), init)) as typeof fetch);

interface SeatRow {
  memberId: string;
  creditedMicroCents: number;
  consumedMicroCents: number;
  balanceMicroCents: number;
  reserveMicroCents: number;
  spendableMicroCents: number;
  hardCap: boolean;
}

function computeSeatRows(config: PoolConfig, state: LedgerState, now: string): SeatRow[] {
  const bals = balances(state);
  return config.members.map((member) => {
    const bal = bals.get(member.id) ?? { creditedMicroCents: 0, consumedMicroCents: 0, balanceMicroCents: 0 };
    const memberRows = state.rows.filter((r) => r.memberId === member.id);
    const peak = peakBurnPerMinuteMicroCents(memberRows, { nowIso: now, lookbackDays: config.burnLookbackDays });
    const reserve = reserveMicroCents(peak, config.exposureWindowMinutes);
    const decision = budgetDecision({
      memberId: member.id,
      creditedMicroCents: bal.creditedMicroCents,
      consumedMicroCents: bal.consumedMicroCents,
      // balances() already folds adjustment rows into balanceMicroCents; recomputing
      // from credited-consumed alone here would silently drop them (spec §4).
      adjustmentMicroCents: bal.balanceMicroCents - (bal.creditedMicroCents - bal.consumedMicroCents),
      reserveMicroCents: reserve,
      alreadyAlertedPcts: [],
      thresholds: config.alertThresholdPcts,
    });
    return {
      memberId: member.id,
      creditedMicroCents: bal.creditedMicroCents,
      consumedMicroCents: bal.consumedMicroCents,
      balanceMicroCents: bal.balanceMicroCents,
      reserveMicroCents: reserve,
      spendableMicroCents: decision.spendableMicroCents,
      hardCap: decision.hardCap,
    };
  });
}

/**
 * The member-facing page: money only, no plumbing. Deliberately carries no key or
 * workspace ids — a member reads their balance, not the infrastructure. Standalone
 * like slice 1's audit document: no remote stylesheet, font, or script; it opens
 * offline, from an attachment, on a machine that has never heard of this tool.
 */
function renderSeatsHtml(rows: readonly SeatRow[], now: string): string {
  const fmt = (mc: number) => formatCents(microCentsToCents(mc));
  const tr = rows.map((r) => `
    <tr${r.hardCap ? ' class="capped"' : ""}>
      <td>${r.memberId}</td>
      <td class="n">${fmt(r.creditedMicroCents)}</td>
      <td class="n">${fmt(r.consumedMicroCents)}</td>
      <td class="n">${fmt(r.reserveMicroCents)}</td>
      <td class="n big">${fmt(r.spendableMicroCents)}</td>
      <td>${r.hardCap ? "⛔ paused — top up to resume" : "✓ active"}</td>
    </tr>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pool seats</title>
<style>
  body{font:16px/1.6 -apple-system,Helvetica,sans-serif;color:#121917;background:#fff;
    max-width:760px;margin:0 auto;padding:48px 20px}
  h1{font-size:26px;letter-spacing:-.02em}
  p.sub{color:#5c6f66;margin-top:6px;font-size:14px}
  table{width:100%;border-collapse:collapse;margin-top:28px;font-size:15px}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #e3e9e5}
  th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#5c6f66}
  td.n{font-variant-numeric:tabular-nums;text-align:right}
  td.big{font-weight:700}
  tr.capped td{color:#8c3a2e}
  p.note{color:#5c6f66;font-size:13px;margin-top:26px;line-height:1.7}
</style>
</head>
<body>
<h1>Pool seats</h1>
<p class="sub">Prepaid, metered at Anthropic's list rates, zero markup. Generated ${now}.</p>
<table>
  <tr><th>member</th><th>paid in</th><th>used</th><th>held back</th><th>spendable</th><th>status</th></tr>${tr}
</table>
<p class="note">"Held back" covers the meter's ~7-minute blind window at your own peak burn rate —
it is still your money, it just can't be promised twice. A paused seat resumes when a top-up is
recorded; nobody can ever owe anything. Unused credit is refundable when you leave.</p>
</body>
</html>
`;
}

async function cmdStatus(argv: string[]): Promise<void> {
  const config = loadConfig(argv);
  const dataDir = loadDataDir(argv);
  const state = readLedgerState(dataDir);
  const now = nowIso();
  const fmt = (mc: number) => formatCents(microCentsToCents(mc));
  const rows = computeSeatRows(config, state, now);

  const htmlIdx = argv.indexOf("--html");
  if (htmlIdx !== -1) {
    const outPath = argv[htmlIdx + 1];
    if (!outPath) {
      console.error("--html needs a path\nrun with --help to see what is accepted");
      process.exit(1);
    }
    writeFileSync(outPath, renderSeatsHtml(rows, now));
    console.log(`wrote ${outPath} — ${rows.length} seats, no ids, safe to send to members`);
  }

  console.log("member          credited     consumed      balance      reserve    spendable  capped?");
  for (const r of rows) {
    console.log(
      `${r.memberId.padEnd(15)} ${fmt(r.creditedMicroCents).padStart(11)} ${fmt(r.consumedMicroCents).padStart(12)} ` +
      `${fmt(r.balanceMicroCents).padStart(12)} ${fmt(r.reserveMicroCents).padStart(11)} ${fmt(r.spendableMicroCents).padStart(12)}  ` +
      `${r.hardCap ? "yes" : "no"}`,
    );
  }

  const healthPath = join(dataDir, "health.json");
  if (existsSync(healthPath)) {
    const health = JSON.parse(readFileSync(healthPath, "utf8"));
    const ageSeconds = Math.round((Date.parse(now) - Date.parse(health.lastPollAt)) / 1000);
    console.log(
      `\nlast poll: ${ageSeconds}s ago (appended ${health.appended}, deduped ${health.deduped}, ` +
      `unattributed ${health.unattributed}, unpriced ${health.unpriced})`,
    );
  } else {
    console.log("\nno health.json yet — poll has never run against this --data directory");
  }
}

async function cmdPoll(argv: string[]): Promise<void> {
  const config = loadConfig(argv);
  const dataDir = loadDataDir(argv);
  const envName = arg(argv, "admin-key-env") ?? "ANTHROPIC_ADMIN_KEY";
  const adminKey = requireAdminKey(envName);
  const enforce = flag(argv, "enforce");

  const summary = await pollOnce({
    fetchFn, adminKey, config, dataDir, nowIso, enforce, log: (line) => console.log(line),
  });

  console.log(
    `appended ${summary.appended}, deduped ${summary.deduped}, unattributed ${summary.unattributed}, ` +
    `unpriced ${summary.unpriced}, malformed ledger lines ${summary.malformedLedgerLines}`,
  );
}

async function cmdReconcile(argv: string[]): Promise<void> {
  const config = loadConfig(argv);
  const dataDir = loadDataDir(argv);
  const envName = arg(argv, "admin-key-env") ?? "ANTHROPIC_ADMIN_KEY";
  const adminKey = requireAdminKey(envName);

  const now = nowIso();
  // Default to yesterday, UTC: a day is only complete, and worth reconciling, once it has
  // fully elapsed in both instruments.
  const day = arg(argv, "day") ?? new Date(Date.parse(now) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const url = buildCostReportUrl({ startingAt: `${day}T00:00:00Z`, endingAt: `${day}T23:59:59Z` });
  const pages = await fetchAllPages(fetchFn, url, adminKey);
  const { rows: theirs } = parseCostReport(pages);

  const state = readLedgerState(dataDir);
  const { sums: ours, unmapped } = ledgerDailyByWorkspace(state, memberToWorkspace(config));

  const verdicts = reconcile(ours, theirs, {
    toleranceFloorMicroCents: config.toleranceFloorMicroCents,
    tolerancePpm: config.tolerancePpm,
  }).filter((v) => v.day === day);

  const fmt = (mc: number) => formatCents(microCentsToCents(mc));
  console.log("day          workspace        ours        theirs         delta     tolerance  verdict");
  for (const v of verdicts) {
    console.log(
      `${v.day} ${v.workspaceId.padEnd(15)} ${fmt(v.oursMicroCents).padStart(11)} ${fmt(v.theirsMicroCents).padStart(12)} ` +
      `${fmt(v.deltaMicroCents).padStart(12)} ${fmt(v.toleranceMicroCents).padStart(12)}  ` +
      `${v.withinTolerance ? "ok" : "OUT OF TOLERANCE"}`,
    );
  }
  if (verdicts.length === 0) {
    console.log(`(no ledger or cost-report data for ${day})`);
  }

  const rows = reconciliationRows(verdicts, now);
  const result = appendRows(state, rows);
  appendToLedgerFile(dataDir, result.appended);

  // A usage row whose memberId has no current workspace mapping is excluded from `ours`
  // (reconcile.ts's own doc comment: silently dropping it would understate our total and
  // manufacture a fake reconciliation gap) — surface it distinctly rather than let a
  // clean-looking tolerance match hide usage the comparison never actually saw.
  if (unmapped > 0) {
    console.error(
      `${unmapped} unmapped ledger row(s) — no current workspace mapping, excluded from "ours" — ` +
      `reconciliation cannot be trusted until they are explained (departing member removed from config?)`,
    );
  }

  if (verdicts.some((v) => !v.withinTolerance) || unmapped > 0) {
    if (verdicts.some((v) => !v.withinTolerance)) {
      console.error("reconciliation out of tolerance — admissions and top-ups should freeze until explained (spec §6)");
    }
    process.exit(2);
  }
}

async function cmdCredit(argv: string[]): Promise<void> {
  const config = loadConfig(argv);
  const dataDir = loadDataDir(argv);
  const memberId = arg(argv, "member");
  const centsRaw = arg(argv, "cents");
  const note = arg(argv, "note");

  if (memberId === undefined || centsRaw === undefined || note === undefined) {
    console.error("credit requires --member, --cents and --note\nrun with --help to see what is accepted");
    process.exit(1);
  }
  if (memberById(config, memberId) === null) {
    console.error(`unknown member: ${memberId}`);
    process.exit(1);
  }
  const cents = Number(centsRaw);
  if (!Number.isInteger(cents) || cents <= 0) {
    console.error(`--cents must be a positive integer, got ${centsRaw}`);
    process.exit(1);
  }

  const now = nowIso();
  const day = now.slice(0, 10);
  // Same member, amount, note and UTC day -> same key, so a re-run (a retried script, a
  // fat-fingered double-submit) dedups instead of double-crediting.
  const idempotencyKey = `credit:${memberId}:${cents}:${note}:${day}`;
  const candidate = creditRow(memberId, cents * 1_000_000, idempotencyKey, now, note, now);

  const state = readLedgerState(dataDir);
  const result = appendRows(state, [candidate]);
  appendToLedgerFile(dataDir, result.appended);

  if (result.appended.length > 0) {
    console.log(`posted: ${memberId} credited ${formatCents(cents)} (${idempotencyKey})`);
  } else {
    console.log(`deduped: ${memberId}'s ${formatCents(cents)} credit for ${day} was already recorded (${idempotencyKey})`);
  }
}

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
  console.log(HELP);
  process.exit(0);
}
if (argv.includes("--version")) {
  console.log(VERSION);
  process.exit(0);
}

const [command, ...rest] = argv;

switch (command) {
  case "status": await cmdStatus(rest); break;
  case "poll": await cmdPoll(rest); break;
  case "reconcile": await cmdReconcile(rest); break;
  case "credit": await cmdCredit(rest); break;
  default:
    console.error(`unknown command: ${command}\nrun with --help to see what is accepted`);
    process.exit(1);
}
