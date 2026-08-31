/**
 * The I/O shell (spec §4, §5, §7) — the only place in src/pool that touches fs, fetch, or
 * a clock. Every pure decision (pricing, budgets, reserve, reconciliation) lives in the
 * sibling modules; this file's job is to fetch honestly, write raw-first, and never lose
 * a row to a crash mid-cycle.
 */
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendRows, balances, parseLedgerJsonl, serializeLedgerRow, usageRowsFromEvents } from "./ledger";
import { actionsFromDecision, budgetDecision } from "./budget";
import { peakBurnPerMinuteMicroCents, reserveMicroCents } from "./reserve";
import { workspaceToMember } from "./config";
import type { PoolAction, PoolConfig } from "./types";
import { importAdminUsageReport } from "../importers/adminUsageReport";
import { RATE_CARD_2026_08_08 as CARD } from "../rates";
import { formatCents, microCentsToCents } from "../pricing";

const API_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * bucket_width=1m matches the poller's own per-minute burn-rate math (reserve.ts);
 * group_by covers every dimension the ledger needs (workspace for attribution, model and
 * service_tier for costOfEvent). Limit is set high because the poller's own window is
 * already narrow — whatever elapsed since the last successful poll, plus 15 minutes of
 * overlap — so a handful of pages, not thousands, is the expected case.
 */
const USAGE_REPORT_LIMIT = 1000;

export function buildUsageReportUrl(opts: { startingAt: string; endingAt?: string; page?: string }): string {
  const params = new URLSearchParams();
  params.set("starting_at", opts.startingAt);
  if (opts.endingAt !== undefined) params.set("ending_at", opts.endingAt);
  params.set("bucket_width", "1m");
  params.append("group_by[]", "workspace_id");
  params.append("group_by[]", "model");
  params.append("group_by[]", "service_tier");
  params.set("limit", String(USAGE_REPORT_LIMIT));
  if (opts.page !== undefined) params.set("page", opts.page);
  return `${API_BASE}/v1/organizations/usage_report/messages?${params.toString()}`;
}

/** cost_report's only granularity is daily (spec §6) — there is no bucket_width to set. */
export function buildCostReportUrl(opts: { startingAt: string; endingAt?: string; page?: string }): string {
  const params = new URLSearchParams();
  params.set("starting_at", opts.startingAt);
  if (opts.endingAt !== undefined) params.set("ending_at", opts.endingAt);
  params.append("group_by[]", "workspace_id");
  if (opts.page !== undefined) params.set("page", opts.page);
  return `${API_BASE}/v1/organizations/cost_report?${params.toString()}`;
}

export async function fetchAllPages(
  fetchFn: typeof fetch,
  url: string,
  adminKey: string,
  opts: { maxPages?: number } = {},
): Promise<any[]> {
  const maxPages = opts.maxPages ?? 50;
  const pages: any[] = [];
  let nextUrl: string | null = url;

  while (nextUrl !== null) {
    if (pages.length >= maxPages) {
      throw new Error(`fetchAllPages: exceeded maxPages (${maxPages}) fetching ${url}`);
    }
    const res = await fetchFn(nextUrl, {
      headers: { "x-api-key": adminKey, "anthropic-version": ANTHROPIC_VERSION },
    });
    if (!res.ok) {
      const body = await res.text();
      // Fail loudly — a poller that silently ingests half a window is worse than one that
      // stops, because the gap is invisible until reconciliation catches it hours later.
      throw new Error(`fetchAllPages: ${res.status} fetching ${nextUrl} — ${body.slice(0, 500)}`);
    }
    // `Response.json()` return type: `unknown` (Node's undici types) merged with `any`
    // (Bun's), and TS resolves the merge to a bare `{}`. This module's whole job is to
    // shuttle the provider's response through untouched (spec §4's raw-first rule means
    // pollOnce never trusts its shape either) — an explicit `any` here matches how the
    // frozen importers already treat these pages (adminUsageReport.ts's `page?.data ?? []`).
    const page: any = await res.json();
    pages.push(page);

    if (page?.has_more === true && typeof page?.next_page === "string") {
      const next = new URL(nextUrl);
      next.searchParams.set("page", page.next_page);
      nextUrl = next.toString();
    } else {
      nextUrl = null;
    }
  }

  return pages;
}

export async function deactivateKey(fetchFn: typeof fetch, adminKey: string, apiKeyId: string): Promise<void> {
  const url = `${API_BASE}/v1/organizations/api_keys/${apiKeyId}`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "x-api-key": adminKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "inactive" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`deactivateKey: ${res.status} deactivating ${apiKeyId} — ${body.slice(0, 500)}`);
  }
}

export interface PollSummary {
  appended: number;
  deduped: number;
  unpriced: number;
  unattributed: number;
  actions: PoolAction[];
  malformedLedgerLines: number;
}

const LOCK_RETRY_MS = 25;
const LOCK_MAX_WAIT_MS = 30_000;

/**
 * Serializes pollOnce against every other pollOnce on the same dataDir. Without this, a
 * slow fetch causing the next cron tick to start before the previous exits — an expected
 * op condition, not exotic — lets two invocations read the same LedgerState and append
 * colliding seq numbers; parseLedgerJsonl's seq-must-increase check then treats the
 * second physically-written row as corruption and drops it forever (spec §4). `wx`
 * (exclusive create) is atomic at the filesystem level, so this holds even across
 * separate processes, not just concurrent calls in one.
 */
async function acquireLock(path: string): Promise<() => void> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  for (;;) {
    try {
      closeSync(openSync(path, "wx"));
      return () => unlinkSync(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      // A lock older than any legitimate poll could run means its holder died mid-cycle.
      // Honoring it forever keeps the poller down until a human notices — the exact
      // failure the heartbeat exists to catch — so a stale lock is broken, not obeyed.
      // The removal races benignly: whoever wins the subsequent "wx" holds the lock.
      try {
        if (Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS) {
          unlinkSync(path);
          continue;
        }
      } catch { /* lock vanished between checks — loop and retake */ }
      if (Date.now() >= deadline) {
        throw new Error(`acquireLock: timed out after ${LOCK_MAX_WAIT_MS}ms waiting for ${path}`);
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
}

/** Longer than any legitimate poll cycle; past this the lock's holder is presumed dead. */
const LOCK_STALE_MS = 10 * 60_000;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const OVERLAP_MINUTES = 15;
const DEFAULT_LOOKBACK_HOURS = 24;

export async function pollOnce(deps: {
  fetchFn: typeof fetch;
  adminKey: string;
  config: PoolConfig;
  dataDir: string;
  nowIso: () => string;
  enforce: boolean;
  log: (line: string) => void;
}): Promise<PollSummary> {
  const { fetchFn, adminKey, config, dataDir, enforce, log } = deps;
  const now = deps.nowIso();

  mkdirSync(dataDir, { recursive: true });
  const release = await acquireLock(join(dataDir, "poll.lock"));
  try {
    return await pollOnceLocked({ fetchFn, adminKey, config, dataDir, now, enforce, log });
  } finally {
    release();
  }
}

async function pollOnceLocked(deps: {
  fetchFn: typeof fetch;
  adminKey: string;
  config: PoolConfig;
  dataDir: string;
  now: string;
  enforce: boolean;
  log: (line: string) => void;
}): Promise<PollSummary> {
  const { fetchFn, adminKey, config, dataDir, now, enforce, log } = deps;
  const ledgerPath = join(dataDir, "ledger.jsonl");
  const ledgerText = existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : "";
  const parsedLedger = parseLedgerJsonl(ledgerText.split("\n"));
  const state = parsedLedger.state;

  const latestUsageTs = state.rows
    .filter((r) => r.kind === "usage")
    .reduce<string | null>((max, r) => (max === null || r.ts > max ? r.ts : max), null);

  // Overlap is free — appendRows dedups on idempotencyKey — so re-covering the last 15
  // minutes costs nothing and closes any gap a slow or failed prior poll left behind.
  const from = latestUsageTs !== null
    ? new Date(Date.parse(latestUsageTs) - OVERLAP_MINUTES * MS_PER_MINUTE).toISOString()
    : new Date(Date.parse(now) - DEFAULT_LOOKBACK_HOURS * MS_PER_HOUR).toISOString();

  const usageUrl = buildUsageReportUrl({ startingAt: from, endingAt: now });
  const pages = await fetchAllPages(fetchFn, usageUrl, adminKey);

  // Raw-first (spec §4): the provider's own response is the audit trail. It lands on disk
  // before a single byte of it is priced or attributed, so a crash mid-import never loses
  // what was actually fetched.
  const rawDir = join(dataDir, "raw");
  mkdirSync(rawDir, { recursive: true });
  const rawPath = join(rawDir, `usage-${now.replace(/:/g, "-")}.json`);
  writeFileSync(rawPath, JSON.stringify(pages));

  const imported = importAdminUsageReport(pages, { seen: new Set(state.seen) });
  const { rows: candidates, unpriced, unattributed } = usageRowsFromEvents(
    imported.events, CARD, workspaceToMember(config), now,
  );

  const appendResult = appendRows(state, candidates);
  const newState = appendResult.state;

  if (appendResult.appended.length > 0) {
    const text = appendResult.appended.map(serializeLedgerRow).join("\n") + "\n";
    appendFileSync(ledgerPath, text);
  }

  const alertsPath = join(dataDir, "alerts.json");
  // A crash mid-write can leave this file torn. Throwing here would brick every future
  // poll — no alert and no deactivation would ever fire again, which is the one failure
  // the poller exists to prevent. Treat unreadable state as empty: a re-fired alert is
  // noise; a cap that never fires is debt (spec §5, §7).
  let alerts: Record<string, { alertedPcts: number[]; creditedMicroCents: number }> = {};
  if (existsSync(alertsPath)) {
    try { alerts = JSON.parse(readFileSync(alertsPath, "utf8")); } catch { alerts = {}; }
  }

  const balancesByMember = balances(newState);
  const allActions: PoolAction[] = [];

  for (const member of config.members) {
    const bal = balancesByMember.get(member.id)
      ?? { creditedMicroCents: 0, consumedMicroCents: 0, balanceMicroCents: 0 };

    // A top-up growing lifetime credits re-arms every threshold (spec §5) — stale alert
    // history from before the top-up would otherwise suppress a real re-crossing.
    const priorEntry = alerts[member.id];
    const alreadyAlertedPcts = priorEntry !== undefined && bal.creditedMicroCents <= priorEntry.creditedMicroCents
      ? priorEntry.alertedPcts
      : [];

    const memberRows = newState.rows.filter((r) => r.memberId === member.id);
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
      alreadyAlertedPcts,
      thresholds: config.alertThresholdPcts,
    });

    alerts[member.id] = {
      alertedPcts: [...new Set([...alreadyAlertedPcts, ...decision.newAlertPcts])].sort((a, b) => a - b),
      creditedMicroCents: bal.creditedMicroCents,
    };

    allActions.push(...actionsFromDecision(decision, member));
  }

  // Atomic replace: write beside, then rename. rename(2) is atomic on the same volume,
  // so a crash leaves either the old whole file or the new whole file — never a torn one.
  const alertsTmp = alertsPath + ".tmp";
  writeFileSync(alertsTmp, JSON.stringify(alerts));
  renameSync(alertsTmp, alertsPath);

  for (const action of allActions) {
    if (action.type === "alert") {
      const dollars = formatCents(microCentsToCents(action.spendableMicroCents));
      // Alerts have no delivery mechanism (spec §10) — printing is the whole of what
      // happens to one, dry run or not, so only the dry-run framing changes with --enforce.
      const prefix = enforce ? "" : "DRY-RUN would ";
      log(`${prefix}alert ${action.memberId} at ${action.pct}% (spendable ${dollars})`);
      continue;
    }
    if (enforce) {
      await deactivateKey(fetchFn, adminKey, action.apiKeyId);
      log(`deactivated key ${action.apiKeyId} for ${action.memberId} (hard cap reached)`);
    } else {
      log(`DRY-RUN would deactivate key ${action.apiKeyId} for ${action.memberId} (hard cap reached)`);
    }
  }

  // Two sources of dedup: events the importer never turned into candidates because their
  // key was already in the ledger (an overlapping poll window, the common case), and
  // candidates appendRows itself rejected as already-seen. Both are real dedups.
  const dedupedTotal = imported.provenance.deduped + appendResult.deduped;

  const healthPath = join(dataDir, "health.json");
  writeFileSync(healthPath, JSON.stringify({
    lastPollAt: now,
    appended: appendResult.appended.length,
    deduped: dedupedTotal,
    unattributed: unattributed.length,
    unpriced: unpriced.length,
  }));

  return {
    appended: appendResult.appended.length,
    deduped: dedupedTotal,
    unpriced: unpriced.length,
    unattributed: unattributed.length,
    actions: allActions,
    malformedLedgerLines: parsedLedger.malformed,
  };
}
