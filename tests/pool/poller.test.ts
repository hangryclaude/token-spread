import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCostReportUrl, buildUsageReportUrl, deactivateKey, fetchAllPages, pollOnce } from "../../src/pool/poller";
import { balances, parseLedgerJsonl } from "../../src/pool/ledger";
import type { PoolConfig } from "../../src/pool/types";

const FIX = join(import.meta.dir, "..", "..", "fixtures", "pool");
const PAGE1 = JSON.parse(readFileSync(join(FIX, "usage-page1.json"), "utf8"));
const PAGE2 = JSON.parse(readFileSync(join(FIX, "usage-page2.json"), "utf8"));

// member-a's workspace (ws-a) gets no seed credit, so its usage hard-caps it immediately.
// member-b's workspace (ws-b) gets seeded with plenty of credit, so it stays comfortably
// spendable — the two fixtures exercise both branches of the budget gate in one poll.
const CONFIG: PoolConfig = {
  members: [
    { id: "member-a", workspaceId: "ws-a", apiKeyId: "apikey_member_a" },
    { id: "member-b", workspaceId: "ws-b", apiKeyId: "apikey_member_b" },
  ],
  alertThresholdPcts: [50, 80, 95],
  exposureWindowMinutes: 1,
  burnLookbackDays: 7,
  toleranceFloorMicroCents: 10_000,
  tolerancePpm: 1000,
};

/** A fetchFn that pages through PAGE1 -> PAGE2 by cursor, and records every call. */
function usageFetchStub(calls: string[] = []) {
  const fn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const page = new URL(url).searchParams.get("page");
    if (page === null) return new Response(JSON.stringify(PAGE1), { status: 200 });
    return new Response(JSON.stringify(PAGE2), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function tmpDataDir(): string {
  return mkdtempSync(join(tmpdir(), "ts-pool-poller-"));
}

function seedLedger(dataDir: string, lines: string[]) {
  writeFileSync(join(dataDir, "ledger.jsonl"), lines.map((l) => l + "\n").join(""));
}

const SEED_CREDIT_B =
  '{"seq":1,"kind":"credit","memberId":"member-b","deltaMicroCents":10000000,"idempotencyKey":"credit:seed:member-b","ts":"2026-08-30T09:00:00Z","detail":{"note":"seed"},"appendedAt":"2026-08-30T09:00:00Z"}';

test("buildUsageReportUrl targets the messages usage report with the spec'd dimensions", () => {
  const url = buildUsageReportUrl({ startingAt: "2026-08-30T10:00:00Z", endingAt: "2026-08-30T11:00:00Z" });
  const u = new URL(url);
  expect(u.origin + u.pathname).toBe("https://api.anthropic.com/v1/organizations/usage_report/messages");
  expect(u.searchParams.get("starting_at")).toBe("2026-08-30T10:00:00Z");
  expect(u.searchParams.get("ending_at")).toBe("2026-08-30T11:00:00Z");
  expect(u.searchParams.get("bucket_width")).toBe("1m");
  expect(u.searchParams.getAll("group_by[]")).toEqual(["workspace_id", "model", "service_tier"]);
  expect(u.searchParams.has("page")).toBe(false);
});

test("buildUsageReportUrl carries a page cursor when given", () => {
  const url = buildUsageReportUrl({ startingAt: "2026-08-30T10:00:00Z", page: "cursor-123" });
  expect(new URL(url).searchParams.get("page")).toBe("cursor-123");
});

test("buildCostReportUrl targets the cost report, grouped by workspace, no bucket_width", () => {
  const url = buildCostReportUrl({ startingAt: "2026-08-01T00:00:00Z", endingAt: "2026-08-02T00:00:00Z" });
  const u = new URL(url);
  expect(u.origin + u.pathname).toBe("https://api.anthropic.com/v1/organizations/cost_report");
  expect(u.searchParams.getAll("group_by[]")).toEqual(["workspace_id"]);
  expect(u.searchParams.has("bucket_width")).toBe(false);
});

test("fetchAllPages follows has_more/next_page and sends the required headers", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const page = new URL(url).searchParams.get("page");
    if (page === null) {
      return new Response(JSON.stringify({ data: ["p1"], has_more: true, next_page: "cursor-2" }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: ["p2"], has_more: false, next_page: null }), { status: 200 });
  }) as unknown as typeof fetch;

  const pages = await fetchAllPages(fetchFn, "https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=x", "sk-admin-test");

  expect(pages).toEqual([
    { data: ["p1"], has_more: true, next_page: "cursor-2" },
    { data: ["p2"], has_more: false, next_page: null },
  ]);
  expect(calls.length).toBe(2);
  expect(new URL(calls[1].url).searchParams.get("page")).toBe("cursor-2");
  for (const c of calls) {
    expect(c.headers["x-api-key"]).toBe("sk-admin-test");
    expect(c.headers["anthropic-version"]).toBe("2023-06-01");
  }
});

test("fetchAllPages throws on a non-2xx response, with status and body in the message", async () => {
  const fetchFn = (async () => new Response("bad admin key", { status: 401 })) as unknown as typeof fetch;
  await expect(fetchAllPages(fetchFn, "https://api.anthropic.com/x", "bad-key")).rejects.toThrow(/401/);
});

test("fetchAllPages stops at maxPages rather than looping forever on a buggy has_more", async () => {
  const fetchFn = (async () =>
    new Response(JSON.stringify({ data: [], has_more: true, next_page: "again" }), { status: 200 })) as unknown as typeof fetch;
  await expect(fetchAllPages(fetchFn, "https://api.anthropic.com/x", "k", { maxPages: 3 })).rejects.toThrow(/maxPages/);
});

test("deactivateKey POSTs status:inactive to the api_keys endpoint", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init! });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  await deactivateKey(fetchFn, "sk-admin-test", "apikey_123");

  expect(calls.length).toBe(1);
  expect(calls[0].url).toBe("https://api.anthropic.com/v1/organizations/api_keys/apikey_123");
  expect(calls[0].init.method).toBe("POST");
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ status: "inactive" });
  expect((calls[0].init.headers as Record<string, string>)["x-api-key"]).toBe("sk-admin-test");
});

test("deactivateKey throws on a non-2xx response", async () => {
  const fetchFn = (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
  await expect(deactivateKey(fetchFn, "k", "apikey_x")).rejects.toThrow(/403/);
});

test("pollOnce prices and appends both pages, with a hand-computed value for one row", async () => {
  const dataDir = tmpDataDir();
  const { fn } = usageFetchStub();
  const logs: string[] = [];

  const summary = await pollOnce({
    fetchFn: fn, adminKey: "sk-admin-test", config: CONFIG, dataDir,
    nowIso: () => "2026-08-30T10:05:00Z", enforce: false, log: (l) => logs.push(l),
  });

  // ws-a (page1): 1000 uncached input + 500 output on claude-haiku-4-5.
  //   1000*100 (input) + 500*500 (output) = 100_000 + 250_000 = 350_000 micro-cents.
  // ws-b (page2): 100 uncached input + 50 output on claude-haiku-4-5.
  //   100*100 + 50*500 = 10_000 + 25_000 = 35_000 micro-cents.
  expect(summary.appended).toBe(2);
  expect(summary.unpriced).toBe(0);
  expect(summary.unattributed).toBe(0);
  expect(summary.malformedLedgerLines).toBe(0);

  const ledgerLines = readFileSync(join(dataDir, "ledger.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const rowA = ledgerLines.find((r) => r.memberId === "member-a");
  const rowB = ledgerLines.find((r) => r.memberId === "member-b");
  expect(rowA.deltaMicroCents).toBe(-350_000);
  expect(rowB.deltaMicroCents).toBe(-35_000);
});

test("raw usage pages are stored verbatim under <dataDir>/raw", async () => {
  const dataDir = tmpDataDir();
  const { fn } = usageFetchStub();

  await pollOnce({
    fetchFn: fn, adminKey: "k", config: CONFIG, dataDir,
    nowIso: () => "2026-08-30T10:05:00Z", enforce: false, log: () => {},
  });

  const rawFiles = readdirSync(join(dataDir, "raw"));
  expect(rawFiles.length).toBe(1);
  expect(rawFiles[0]).toBe("usage-2026-08-30T10-05-00Z.json");
  const raw = JSON.parse(readFileSync(join(dataDir, "raw", rawFiles[0]), "utf8"));
  expect(raw).toEqual([PAGE1, PAGE2]);
});

test("raw pages survive a failure between the raw write and the ledger append (crash-safety ordering)", async () => {
  // The design doc's whole crash-safety argument rests on raw landing on disk before the
  // ledger append (poller.ts's own comment: "a crash mid-import never loses what was
  // actually fetched"). A read-only ledger.jsonl makes appendFileSync throw *after* the
  // raw write has already happened, without touching production code to inject the
  // failure — proving the ordering, not just that both files exist when nothing goes wrong.
  const dataDir = tmpDataDir();
  writeFileSync(join(dataDir, "ledger.jsonl"), "");
  chmodSync(join(dataDir, "ledger.jsonl"), 0o444);
  const { fn } = usageFetchStub();

  try {
    await expect(pollOnce({
      fetchFn: fn, adminKey: "k", config: CONFIG, dataDir,
      nowIso: () => "2026-08-30T10:05:00Z", enforce: false, log: () => {},
    })).rejects.toThrow();

    const rawFiles = readdirSync(join(dataDir, "raw"));
    expect(rawFiles.length).toBe(1);
    expect(JSON.parse(readFileSync(join(dataDir, "raw", rawFiles[0]), "utf8"))).toEqual([PAGE1, PAGE2]);
    expect(readFileSync(join(dataDir, "ledger.jsonl"), "utf8")).toBe("");
  } finally {
    chmodSync(join(dataDir, "ledger.jsonl"), 0o644);
  }
});

test("raw pages are written even when nothing is attributable to a member (raw-first)", async () => {
  // A workspace absent from the pool config must not prevent the raw response from being
  // saved — if it did, an attribution gap would also be a data-loss gap.
  const dataDir = tmpDataDir();
  const emptyConfig: PoolConfig = { ...CONFIG, members: [] };
  const { fn } = usageFetchStub();

  const summary = await pollOnce({
    fetchFn: fn, adminKey: "k", config: emptyConfig, dataDir,
    nowIso: () => "2026-08-30T10:05:00Z", enforce: false, log: () => {},
  });

  expect(summary.appended).toBe(0);
  expect(summary.unattributed).toBe(2);
  expect(existsSync(join(dataDir, "ledger.jsonl"))).toBe(false);

  const rawFiles = readdirSync(join(dataDir, "raw"));
  expect(rawFiles.length).toBe(1);
  expect(JSON.parse(readFileSync(join(dataDir, "raw", rawFiles[0]), "utf8"))).toEqual([PAGE1, PAGE2]);
});

test("health.json records the outcome of the poll", async () => {
  const dataDir = tmpDataDir();
  const { fn } = usageFetchStub();

  await pollOnce({
    fetchFn: fn, adminKey: "k", config: CONFIG, dataDir,
    nowIso: () => "2026-08-30T10:05:00Z", enforce: false, log: () => {},
  });

  const health = JSON.parse(readFileSync(join(dataDir, "health.json"), "utf8"));
  expect(health).toEqual({ lastPollAt: "2026-08-30T10:05:00Z", appended: 2, deduped: 0, unattributed: 0, unpriced: 0 });
});

test("re-polling the same window is idempotent: zero rows appended the second time", async () => {
  const dataDir = tmpDataDir();
  const { fn } = usageFetchStub();

  const first = await pollOnce({
    fetchFn: fn, adminKey: "k", config: CONFIG, dataDir,
    nowIso: () => "2026-08-30T10:05:00Z", enforce: false, log: () => {},
  });
  expect(first.appended).toBe(2);

  const second = await pollOnce({
    fetchFn: fn, adminKey: "k", config: CONFIG, dataDir,
    nowIso: () => "2026-08-30T10:20:00Z", enforce: false, log: () => {},
  });
  expect(second.appended).toBe(0);

  const ledgerLines = readFileSync(join(dataDir, "ledger.jsonl"), "utf8").trim().split("\n");
  expect(ledgerLines.length).toBe(2);
});

test("two overlapping pollOnce calls against the same dataDir do not collide on ledger seq numbers", async () => {
  // A slow fetch causing the next cron tick to start before the previous pollOnce exits is
  // an expected op condition, not exotic. Both calls read ledger state (nextSeq=1, on an
  // empty ledger) before either one's fetch resolves — with no lock, both then append a
  // legitimate, distinct usage row at seq=1, and parseLedgerJsonl's seq-must-increase check
  // (spec §4) treats the second physically-written row as corruption and drops it forever.
  const dataDir = tmpDataDir();
  const page1Only = { ...PAGE1, has_more: false, next_page: null };

  const delayedFetch = (page: unknown, ms: number) => (async () => {
    await new Promise((r) => setTimeout(r, ms));
    return new Response(JSON.stringify(page), { status: 200 });
  }) as unknown as typeof fetch;

  const [a, b] = await Promise.all([
    pollOnce({
      fetchFn: delayedFetch(page1Only, 20), adminKey: "k", config: CONFIG, dataDir,
      nowIso: () => "2026-08-30T10:05:00Z", enforce: false, log: () => {},
    }),
    pollOnce({
      fetchFn: delayedFetch(PAGE2, 5), adminKey: "k", config: CONFIG, dataDir,
      nowIso: () => "2026-08-30T10:05:01Z", enforce: false, log: () => {},
    }),
  ]);

  expect(a.appended).toBe(1);
  expect(b.appended).toBe(1);

  // The real assertion: re-parsing the file *after both writers are done* must find no
  // seq collision and no dropped row, whichever order the two actually interleaved in.
  const ledgerText = readFileSync(join(dataDir, "ledger.jsonl"), "utf8");
  const { state, malformed } = parseLedgerJsonl(ledgerText.split("\n"));
  expect(malformed).toBe(0);
  const bals = balances(state);
  expect(bals.get("member-a")?.consumedMicroCents).toBe(350_000);
  expect(bals.get("member-b")?.consumedMicroCents).toBe(35_000);
});

test("dry run (default) never calls the deactivation endpoint, even for a hard-capped member", async () => {
  const dataDir = tmpDataDir();
  seedLedger(dataDir, [SEED_CREDIT_B]);
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/api_keys/")) return new Response("{}", { status: 200 });
    const page = new URL(url).searchParams.get("page");
    return new Response(JSON.stringify(page === null ? PAGE1 : PAGE2), { status: 200 });
  }) as unknown as typeof fetch;
  const logs: string[] = [];

  const summary = await pollOnce({
    fetchFn: fn, adminKey: "k", config: CONFIG, dataDir,
    nowIso: () => "2026-08-30T10:05:00Z", enforce: false, log: (l) => logs.push(l),
  });

  // member-a has zero credit and consumed 350_000 -> hard-capped.
  const deactivations = summary.actions.filter((a) => a.type === "deactivate_key");
  expect(deactivations).toEqual([{ type: "deactivate_key", memberId: "member-a", apiKeyId: "apikey_member_a" }]);
  expect(calls.some((u) => u.includes("/api_keys/"))).toBe(false);
  expect(logs.some((l) => l.includes("DRY-RUN would deactivate key apikey_member_a"))).toBe(true);
});

test("--enforce actually POSTs the deactivation for the hard-capped member", async () => {
  const dataDir = tmpDataDir();
  seedLedger(dataDir, [SEED_CREDIT_B]);
  const deactivateCalls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api_keys/")) {
      deactivateCalls.push(url);
      return new Response("{}", { status: 200 });
    }
    const page = new URL(url).searchParams.get("page");
    return new Response(JSON.stringify(page === null ? PAGE1 : PAGE2), { status: 200 });
  }) as unknown as typeof fetch;

  const summary = await pollOnce({
    fetchFn: fn, adminKey: "k", config: CONFIG, dataDir,
    nowIso: () => "2026-08-30T10:05:00Z", enforce: true, log: () => {},
  });

  expect(deactivateCalls).toEqual(["https://api.anthropic.com/v1/organizations/api_keys/apikey_member_a"]);
  expect(summary.actions.some((a) => a.type === "deactivate_key" && a.memberId === "member-a")).toBe(true);
});

test("a torn alerts.json neither bricks the poll nor kills cap enforcement", async () => {
  // A crash mid-write leaves invalid JSON on disk. If the next poll throws on parse,
  // the poller is bricked exactly when it matters: no alert and no deactivation would
  // ever fire again. The honest recovery is to treat the file as empty — re-firing an
  // alert is noise; never firing the cap is debt (spec §5, §7).
  const dataDir = tmpDataDir();
  writeFileSync(join(dataDir, "alerts.json"), '{"member-a":{"alertedPcts":[50,'); // torn
  const { fn } = usageFetchStub();
  const summary = await pollOnce({
    fetchFn: fn, adminKey: "sk-ant-admin-test", config: CONFIG, dataDir,
    nowIso: () => "2026-08-30T10:05:00Z", enforce: false, log: () => {},
  });
  // ws-a has zero credit, so its usage still hard-caps it on this very poll.
  expect(summary.actions.some((a) => a.type === "deactivate_key" && a.memberId === "member-a")).toBe(true);
  // And the rewritten alerts.json is whole again.
  expect(() => JSON.parse(readFileSync(join(dataDir, "alerts.json"), "utf8"))).not.toThrow();
});

test("a stale poll.lock from a killed process is broken, not honored forever", async () => {
  // A poll killed mid-cycle leaves its lock behind. Honoring it forever means the
  // poller is down until a human notices — the exact failure the heartbeat exists to
  // catch, so the lock self-heals: older than the staleness line, it gets broken.
  const dataDir = tmpDataDir();
  const lockPath = join(dataDir, "poll.lock");
  writeFileSync(lockPath, "");
  const past = new Date(Date.now() - 15 * 60_000); // 15 minutes ago
  const { utimesSync } = await import("node:fs");
  utimesSync(lockPath, past, past);
  const { fn } = usageFetchStub();
  const summary = await pollOnce({
    fetchFn: fn, adminKey: "sk-ant-admin-test", config: CONFIG, dataDir,
    nowIso: () => "2026-08-30T10:05:00Z", enforce: false, log: () => {},
  });
  // The poll ran (rows appended from the fixture pages) instead of timing out.
  expect(summary.appended).toBeGreaterThan(0);
});
