/**
 * Month-in-a-file rehearsal (design: docs/specs/2026-08-30-pool-ledger-design.md). One
 * story, one dataDir, driven entirely through the real pool modules — pollOnce,
 * ledger.ts, budget.ts, reserve.ts, reconcile.ts, doctor.ts — with nowIso advancing
 * across simulated days. The only stub is fetchFn, in-process, shaped exactly like the
 * Admin usage/cost report pages adminUsageReport.ts and poller.test.ts already expect.
 *
 * Every dollar figure asserted below is hand-computed in the comment right above it.
 * Model: claude-haiku-4-5 (rates.ts): output tokens bill at 500 micro-cents/token.
 * Every simulated usage bucket is exactly 100,000 output tokens (0 input) so each bucket
 * costs a flat 100,000 * 500 = 50,000,000 micro-cents = $0.50 — a constant, known peak
 * per-minute burn, which keeps reserveMicroCents (peak * exposureWindowMinutes) fixed at
 * $0.50 for the whole rehearsal and every other number a simple multiple of it.
 */
import { expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCostReportUrl, fetchAllPages, pollOnce } from "../../src/pool/poller";
import { appendRows, balances, creditRow, parseLedgerJsonl, serializeLedgerRow } from "../../src/pool/ledger";
import { ledgerDailyByWorkspace, parseCostReport, reconcile } from "../../src/pool/reconcile";
import { memberToWorkspace } from "../../src/pool/config";
import { doctorReport } from "../../src/pool/doctor";
import type { LedgerRow, LedgerState, PoolConfig } from "../../src/pool/types";

const ADMIN_KEY = "sk-admin-test";

const CONFIG: PoolConfig = {
  members: [{ id: "member-a", workspaceId: "ws-a", apiKeyId: "apikey_member_a" }],
  alertThresholdPcts: [50, 80],
  exposureWindowMinutes: 1,
  burnLookbackDays: 30,
  toleranceFloorMicroCents: 1_000_000,
  tolerancePpm: 1000,
};

function tmpDataDir(): string {
  return mkdtempSync(join(tmpdir(), "ts-pool-lifecycle-"));
}

function readLedger(dataDir: string): LedgerState {
  const path = join(dataDir, "ledger.jsonl");
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  return parseLedgerJsonl(text.split("\n")).state;
}

function appendToLedgerFile(dataDir: string, rows: readonly LedgerRow[]): void {
  if (rows.length === 0) return;
  const text = rows.map(serializeLedgerRow).join("\n") + "\n";
  appendFileSync(join(dataDir, "ledger.jsonl"), text);
}

/**
 * One usage-report page with `bucketCount` one-minute buckets, all on `day`, each
 * costing a flat $0.50 (see the top-of-file rate note). Distinct minutes -> distinct
 * idempotencyKeys within the day, so re-supplying the same page later is the idempotent
 * re-poll case, not a fresh append.
 */
function usagePage(day: string, bucketCount: number, outputTokensPerBucket: number): any {
  const data = [];
  for (let m = 0; m < bucketCount; m++) {
    const mm = String(m).padStart(2, "0");
    const mm2 = String(m + 1).padStart(2, "0");
    data.push({
      starting_at: `${day}T00:${mm}:00Z`,
      ending_at: `${day}T00:${mm2}:00Z`,
      results: [{
        model: "claude-haiku-4-5",
        service_tier: "standard",
        workspace_id: "ws-a",
        account_id: "acct-1",
        uncached_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: outputTokensPerBucket,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
      }],
    });
  }
  return { data, has_more: false, next_page: null };
}

/** A fetchFn that returns `page` for any usage/cost report call, and separately records
 * (and answers 200 to) any call to the api_keys deactivation endpoint. */
function makeStub(page: any) {
  const calls: string[] = [];
  const apiKeyCalls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/api_keys/")) {
      apiKeyCalls.push(url);
      return new Response("{}", { status: 200 });
    }
    return new Response(JSON.stringify(page), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls, apiKeyCalls };
}

test("month-in-a-file: credit, consume, alert, cap, top-up, reconcile, doctor — end to end", async () => {
  const dataDir = tmpDataDir();

  // ---- Step 1: credit member-a $30 -----------------------------------------------
  // $30.00 = 3000 cents * 1_000_000 micro-cents/cent = 3_000_000_000 micro-cents.
  const seedRow = creditRow("member-a", 3_000_000_000, "credit:seed:member-a", "2026-08-01T00:00:00Z", "seed $30", "2026-08-01T00:00:00Z");
  const seedResult = appendRows(readLedger(dataDir), [seedRow]);
  appendToLedgerFile(dataDir, seedResult.appended);
  expect(balances(readLedger(dataDir)).get("member-a")?.balanceMicroCents).toBe(3_000_000_000);

  // ---- Step 2: Day 1 poll — 30% consumed, below the 50% floor --------------------
  // 18 buckets * $0.50 = $9.00 = 900_000_000 micro-cents. 900_000_000 / 3_000_000_000
  // = 30.00% (shareBps = floor(900_000_000*10_000/3_000_000_000) = 3000) — under the
  // 50% threshold (bps 5000), so no alert and, with balance 2_100_000_000 well above
  // the $0.50 reserve, no cap either.
  const day1Stub = makeStub(usagePage("2026-08-01", 18, 100_000));
  const day1 = await pollOnce({
    fetchFn: day1Stub.fn, adminKey: ADMIN_KEY, config: CONFIG, dataDir,
    nowIso: () => "2026-08-01T00:30:00Z", enforce: false, log: () => {},
  });
  expect(day1.appended).toBe(18);
  expect(day1.unpriced).toBe(0);
  expect(day1.unattributed).toBe(0);
  expect(day1.malformedLedgerLines).toBe(0);
  expect(day1.actions).toEqual([]);

  // ---- Step 3a: Day 2 poll — crosses 50% exactly, alert fires once ---------------
  // +12 buckets * $0.50 = $6.00 -> cumulative $15.00 = 1_500_000_000 micro-cents.
  // shareBps = floor(1_500_000_000*10_000/3_000_000_000) = 5000 = 50.00% exactly ->
  // budgetDecision's `>=` boundary fires the 50% threshold.
  // balance = 3_000_000_000 - 1_500_000_000 = 1_500_000_000; reserve = $0.50 (50_000_000,
  // the constant per-minute peak); spendable = 1_500_000_000 - 50_000_000 = 1_450_000_000.
  const day2Page = usagePage("2026-08-02", 12, 100_000);
  const day2Stub = makeStub(day2Page);
  const day2 = await pollOnce({
    fetchFn: day2Stub.fn, adminKey: ADMIN_KEY, config: CONFIG, dataDir,
    nowIso: () => "2026-08-02T00:30:00Z", enforce: false, log: () => {},
  });
  expect(day2.appended).toBe(12);
  expect(day2.actions).toEqual([
    { type: "alert", memberId: "member-a", pct: 50, spendableMicroCents: 1_450_000_000 },
  ]);

  // ---- Step 3b: overlapping re-poll of the same window ---------------------------
  // Same day-2 page fetched again: every idempotencyKey is already in the ledger's
  // `seen` set, so appended must be 0 (spec §4 dedup) and the 50% alert — already
  // recorded in alerts.json — must NOT fire a second time (spec §5 suppression).
  const day2Repeat = await pollOnce({
    fetchFn: day2Stub.fn, adminKey: ADMIN_KEY, config: CONFIG, dataDir,
    nowIso: () => "2026-08-02T00:35:00Z", enforce: false, log: () => {},
  });
  expect(day2Repeat.appended).toBe(0);
  expect(day2Repeat.actions).toEqual([]);
  expect(balances(readLedger(dataDir)).get("member-a")?.balanceMicroCents).toBe(1_500_000_000);

  // ---- Step 3c: Day 3 poll — crosses 80% exactly, alert fires once ---------------
  // +18 buckets * $0.50 = $9.00 -> cumulative $24.00 = 2_400_000_000 micro-cents.
  // shareBps = floor(2_400_000_000*10_000/3_000_000_000) = 8000 = 80.00% exactly.
  // balance = 3_000_000_000 - 2_400_000_000 = 600_000_000; reserve = 50_000_000;
  // spendable = 550_000_000.
  const day3Page = usagePage("2026-08-03", 18, 100_000);
  const day3Stub = makeStub(day3Page);
  const day3 = await pollOnce({
    fetchFn: day3Stub.fn, adminKey: ADMIN_KEY, config: CONFIG, dataDir,
    nowIso: () => "2026-08-03T00:30:00Z", enforce: false, log: () => {},
  });
  expect(day3.appended).toBe(18);
  expect(day3.actions).toEqual([
    { type: "alert", memberId: "member-a", pct: 80, spendableMicroCents: 550_000_000 },
  ]);

  // Same overlapping-repoll / suppression check for the 80% threshold.
  const day3Repeat = await pollOnce({
    fetchFn: day3Stub.fn, adminKey: ADMIN_KEY, config: CONFIG, dataDir,
    nowIso: () => "2026-08-03T00:35:00Z", enforce: false, log: () => {},
  });
  expect(day3Repeat.appended).toBe(0);
  expect(day3Repeat.actions).toEqual([]);

  // ---- Step 4: Day 4 poll — consumption reaches the cap ---------------------------
  // +12 buckets * $0.50 = $6.00 -> cumulative $30.00 = 3_000_000_000 micro-cents,
  // exactly equal to credited. balance = 0; reserve = 50_000_000; spendable =
  // 0 - 50_000_000 = -50_000_000 <= 0 -> hardCap, deactivate_key for member-a's key.
  const day4Page = usagePage("2026-08-04", 12, 100_000);

  // Dry run first: the action is still reported, but --enforce is off, so the
  // deactivation endpoint must never be called.
  const day4StubDry = makeStub(day4Page);
  const day4Dry = await pollOnce({
    fetchFn: day4StubDry.fn, adminKey: ADMIN_KEY, config: CONFIG, dataDir,
    nowIso: () => "2026-08-04T00:30:00Z", enforce: false, log: () => {},
  });
  expect(day4Dry.appended).toBe(12);
  expect(day4Dry.actions).toEqual([
    { type: "deactivate_key", memberId: "member-a", apiKeyId: "apikey_member_a" },
  ]);
  expect(day4StubDry.calls.some((u) => u.includes("/api_keys/"))).toBe(false);

  // Re-poll the same (now already-ledgered) day-4 window with --enforce: appended
  // stays 0 (idempotent), but the still-hard-capped decision now actually POSTs.
  const day4StubEnforce = makeStub(day4Page);
  const day4Enforce = await pollOnce({
    fetchFn: day4StubEnforce.fn, adminKey: ADMIN_KEY, config: CONFIG, dataDir,
    nowIso: () => "2026-08-04T00:35:00Z", enforce: true, log: () => {},
  });
  expect(day4Enforce.appended).toBe(0);
  expect(day4Enforce.actions).toEqual([
    { type: "deactivate_key", memberId: "member-a", apiKeyId: "apikey_member_a" },
  ]);
  expect(day4StubEnforce.apiKeyCalls).toEqual([
    "https://api.anthropic.com/v1/organizations/api_keys/apikey_member_a",
  ]);

  // ---- Step 5: top-up +$20 — alerts re-arm, spendable positive again -------------
  // $20.00 = 2_000_000_000 micro-cents. New credited = 3_000_000_000 + 2_000_000_000
  // = 5_000_000_000 ($50.00). Consumed is unchanged at 3_000_000_000 ($30.00).
  const topUpRow = creditRow("member-a", 2_000_000_000, "credit:topup:member-a:1", "2026-08-05T00:00:00Z", "top-up $20", "2026-08-05T00:00:00Z");
  const topUpResult = appendRows(readLedger(dataDir), [topUpRow]);
  appendToLedgerFile(dataDir, topUpResult.appended);

  // Poll again (no new usage — an empty page) purely to let the poller recompute
  // alerts.json and the decision against the new, larger credited figure.
  // shareBps = floor(3_000_000_000*10_000/5_000_000_000) = 6000 = 60.00%. Credited grew
  // (5_000_000_000 > the 3_000_000_000 alerts.json had on file), so the already-alerted
  // set resets to [] (spec §5's re-arm rule) and the 50% threshold (bps 5000 <= 6000)
  // fires again; 80% (bps 8000) does not, since 60% < 80%.
  // balance = 5_000_000_000 - 3_000_000_000 = 2_000_000_000; reserve is still 50_000_000
  // (peak per-minute burn is unchanged — no new usage rows); spendable =
  // 2_000_000_000 - 50_000_000 = 1_950_000_000, positive -> no longer capped.
  const topUpStub = makeStub({ data: [], has_more: false, next_page: null });
  const afterTopUp = await pollOnce({
    fetchFn: topUpStub.fn, adminKey: ADMIN_KEY, config: CONFIG, dataDir,
    nowIso: () => "2026-08-05T00:10:00Z", enforce: true, log: () => {},
  });
  expect(afterTopUp.appended).toBe(0);
  expect(afterTopUp.actions).toEqual([
    { type: "alert", memberId: "member-a", pct: 50, spendableMicroCents: 1_950_000_000 },
  ]);
  expect(topUpStub.apiKeyCalls).toEqual([]); // not capped anymore -> no deactivation call

  const alertsAfterTopUp = JSON.parse(readFileSync(join(dataDir, "alerts.json"), "utf8"));
  expect(alertsAfterTopUp["member-a"]).toEqual({ alertedPcts: [50], creditedMicroCents: 5_000_000_000 });

  // Sanity: 4 days * (18+12+18+12) = 60 usage rows, plus the seed and top-up credits.
  const stateFinal = readLedger(dataDir);
  expect(stateFinal.rows.length).toBe(62);

  // ---- Step 6: reconcile — ledger vs a real cost report, hand-computed ----------
  const { sums: ours, unmapped } = ledgerDailyByWorkspace(stateFinal, memberToWorkspace(CONFIG));
  expect(unmapped).toBe(0);
  // Per-day usage totals, independent of the alert math above: day1 $9.00, day2 $6.00,
  // day3 $9.00, day4 $6.00 -> 900_000_000 / 600_000_000 / 900_000_000 / 600_000_000
  // micro-cents. parseCostReport's `amount` is a decimal string of CENTS (rates.ts
  // convention: 1 cent = 1_000_000 micro-cents), so $9.00 is amount "900.000000".
  const costReportUrl = buildCostReportUrl({ startingAt: "2026-08-01T00:00:00Z", endingAt: "2026-08-05T00:00:00Z" });

  const agreeingPage = {
    data: [
      { starting_at: "2026-08-01T00:00:00Z", results: [{ amount: "900.000000", currency: "USD", workspace_id: "ws-a" }] },
      { starting_at: "2026-08-02T00:00:00Z", results: [{ amount: "600.000000", currency: "USD", workspace_id: "ws-a" }] },
      { starting_at: "2026-08-03T00:00:00Z", results: [{ amount: "900.000000", currency: "USD", workspace_id: "ws-a" }] },
      { starting_at: "2026-08-04T00:00:00Z", results: [{ amount: "600.000000", currency: "USD", workspace_id: "ws-a" }] },
    ],
    has_more: false, next_page: null,
  };
  const agreeingStub = makeStub(agreeingPage);
  const agreeingPages = await fetchAllPages(agreeingStub.fn, costReportUrl, ADMIN_KEY);
  const { rows: theirsAgree } = parseCostReport(agreeingPages);
  const verdictsAgree = reconcile(ours, theirsAgree, {
    toleranceFloorMicroCents: CONFIG.toleranceFloorMicroCents, tolerancePpm: CONFIG.tolerancePpm,
  });

  // Hand-computed for day 1: ours = theirs = 900_000_000 micro-cents.
  // tolerance = floor 1_000_000 + floor(900_000_000 * 1000 / 1_000_000)
  //           = 1_000_000 + 900_000 = 1_900_000. delta = 0 <= 1_900_000 -> within tolerance.
  const day1Verdict = verdictsAgree.find((v) => v.day === "2026-08-01" && v.workspaceId === "ws-a")!;
  expect(day1Verdict).toEqual({
    day: "2026-08-01", workspaceId: "ws-a",
    oursMicroCents: 900_000_000, theirsMicroCents: 900_000_000, deltaMicroCents: 0,
    toleranceMicroCents: 1_900_000, withinTolerance: true,
  });
  for (const v of verdictsAgree) expect(v.withinTolerance).toBe(true);

  // Now a drifted cost report: day 2 reports $7.00 instead of the ledger's $6.00.
  // ours = 600_000_000, theirs = 700_000_000 (amount "700.000000"). delta = 100_000_000.
  // tolerance = floor 1_000_000 + floor(max(600_000_000,700_000_000) * 1000 / 1_000_000)
  //           = 1_000_000 + 700_000 = 1_700_000. |100_000_000| > 1_700_000 -> out of
  // tolerance (>1¢ + 0.1%, as the brief asks for) — the other three days are untouched.
  const driftedPage = {
    data: [
      { starting_at: "2026-08-01T00:00:00Z", results: [{ amount: "900.000000", currency: "USD", workspace_id: "ws-a" }] },
      { starting_at: "2026-08-02T00:00:00Z", results: [{ amount: "700.000000", currency: "USD", workspace_id: "ws-a" }] },
      { starting_at: "2026-08-03T00:00:00Z", results: [{ amount: "900.000000", currency: "USD", workspace_id: "ws-a" }] },
      { starting_at: "2026-08-04T00:00:00Z", results: [{ amount: "600.000000", currency: "USD", workspace_id: "ws-a" }] },
    ],
    has_more: false, next_page: null,
  };
  const driftedStub = makeStub(driftedPage);
  const driftedPages = await fetchAllPages(driftedStub.fn, costReportUrl, ADMIN_KEY);
  const { rows: theirsDrift } = parseCostReport(driftedPages);
  const verdictsDrift = reconcile(ours, theirsDrift, {
    toleranceFloorMicroCents: CONFIG.toleranceFloorMicroCents, tolerancePpm: CONFIG.tolerancePpm,
  });
  const day2Verdict = verdictsDrift.find((v) => v.day === "2026-08-02" && v.workspaceId === "ws-a")!;
  expect(day2Verdict.deltaMicroCents).toBe(100_000_000);
  expect(day2Verdict.toleranceMicroCents).toBe(1_700_000);
  expect(day2Verdict.withinTolerance).toBe(false);
  expect(verdictsDrift.find((v) => v.day === "2026-08-01")!.withinTolerance).toBe(true);
  expect(verdictsDrift.find((v) => v.day === "2026-08-03")!.withinTolerance).toBe(true);
  expect(verdictsDrift.find((v) => v.day === "2026-08-04")!.withinTolerance).toBe(true);

  // ---- Step 7: doctor — fresh heartbeat ok, then stale+fatal 11 minutes later ----
  const configText = JSON.stringify(CONFIG);
  const finalLedgerText = readFileSync(join(dataDir, "ledger.jsonl"), "utf8");
  expect(parseLedgerJsonl(finalLedgerText.split("\n")).malformed).toBe(0);
  const finalHealthText = readFileSync(join(dataDir, "health.json"), "utf8");
  const lastPollAt: string = JSON.parse(finalHealthText).lastPollAt;
  expect(lastPollAt).toBe("2026-08-05T00:10:00Z"); // the afterTopUp poll's nowIso

  const freshDoctor = doctorReport({
    configText, dataDirWritable: true, ledgerText: finalLedgerText, healthText: finalHealthText,
    adminKeySet: true, plistsPresent: false, nowIso: lastPollAt,
  });
  expect(freshDoctor.ok).toBe(true);
  const freshHealth = freshDoctor.checks.find((c) => c.name === "health")!;
  expect(freshHealth.ok).toBe(true);
  expect(freshHealth.detail).toContain("0s");

  // 11 minutes past the last poll — one past the runbook's 10-minute dead-man line.
  const staleNow = new Date(Date.parse(lastPollAt) + 11 * 60 * 1000).toISOString();
  const staleDoctor = doctorReport({
    configText, dataDirWritable: true, ledgerText: finalLedgerText, healthText: finalHealthText,
    adminKeySet: true, plistsPresent: false, nowIso: staleNow,
  });
  expect(staleDoctor.ok).toBe(false);
  const staleHealth = staleDoctor.checks.find((c) => c.name === "health")!;
  expect(staleHealth.ok).toBe(false);
  expect(staleHealth.detail).toContain("stale");
});
