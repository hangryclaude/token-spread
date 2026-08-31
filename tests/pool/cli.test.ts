import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "..", "src", "pool", "cli.ts");

async function run(args: string[], env: Record<string, string | undefined> = {}) {
  const p = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe", stderr: "pipe",
    env: { ...process.env, ...env },
  });
  const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { stdout, stderr, code: await p.exited };
}

function tmpDataDir(): string {
  return mkdtempSync(join(tmpdir(), "ts-pool-cli-"));
}

function writeConfig(dir: string, config: unknown): string {
  const path = join(dir, "pool-config.json");
  writeFileSync(path, JSON.stringify(config));
  return path;
}

test("with no command, prints help and exits 0", async () => {
  const r = await run([]);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("pool");
});

test("status prints a hand-computed spendable figure from a pre-built ledger", async () => {
  const dir = tmpDataDir();
  const configPath = writeConfig(dir, {
    members: [{ id: "solo", workspaceId: "ws-solo", apiKeyId: "apikey_solo" }],
    exposureWindowMinutes: 1,
  });
  const now = new Date().toISOString();
  // credited $1.00 (100_000_000 microCents), consumed $0.40 (40_000_000) in one minute:
  //   balance   = 100_000_000 - 40_000_000 = 60_000_000  ($0.60)
  //   peak burn = 40_000_000/min (the only usage row)
  //   reserve   = peak * exposureWindowMinutes(1) = 40_000_000  ($0.40)
  //   spendable = balance - reserve = 20_000_000  ($0.20), positive -> not capped
  const lines = [
    { seq: 1, kind: "credit", memberId: "solo", deltaMicroCents: 100_000_000, idempotencyKey: "c1", ts: now, detail: {}, appendedAt: now },
    { seq: 2, kind: "usage", memberId: "solo", deltaMicroCents: -40_000_000, idempotencyKey: "u1", ts: now, detail: {}, appendedAt: now },
  ];
  writeFileSync(join(dir, "ledger.jsonl"), lines.map((l) => JSON.stringify(l) + "\n").join(""));

  const r = await run(["status", "--config", configPath, "--data", dir]);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("$1.00");
  expect(r.stdout).toContain("$0.40");
  expect(r.stdout).toContain("$0.60");
  expect(r.stdout).toContain("$0.20");
  expect(r.stdout).toMatch(/solo\s+\$1\.00\s+\$0\.40\s+\$0\.60\s+\$0\.40\s+\$0\.20\s+no/);
});

test("status folds an adjustment row into balance and spendable, not just credited-consumed", async () => {
  const dir = tmpDataDir();
  const configPath = writeConfig(dir, {
    members: [{ id: "solo", workspaceId: "ws-solo", apiKeyId: "apikey_solo" }],
    exposureWindowMinutes: 1,
  });
  const now = new Date().toISOString();
  // credited $2.00 (200_000_000), no usage, adjustment -$1.90 (-190_000_000, a chargeback):
  //   balance = 200_000_000 - 0 + (-190_000_000) = 10_000_000  ($0.10)
  //   no usage rows -> peak burn 0 -> reserve 0 -> spendable = balance = 10_000_000  ($0.10)
  // Recomputing balance from credited-consumed alone (the bug) would report $2.00
  // spendable instead of $0.10, and never cap even though the money was clawed back.
  const lines = [
    { seq: 1, kind: "credit", memberId: "solo", deltaMicroCents: 200_000_000, idempotencyKey: "c1", ts: now, detail: {}, appendedAt: now },
    { seq: 2, kind: "adjustment", memberId: "solo", deltaMicroCents: -190_000_000, idempotencyKey: "a1", ts: now, detail: {}, appendedAt: now },
  ];
  writeFileSync(join(dir, "ledger.jsonl"), lines.map((l) => JSON.stringify(l) + "\n").join(""));

  const r = await run(["status", "--config", configPath, "--data", dir]);
  expect(r.code).toBe(0);
  expect(r.stdout).toMatch(/solo\s+\$2\.00\s+\$0\.00\s+\$0\.10\s+\$0\.00\s+\$0\.10\s+no/);
});

test("poll without the admin key env var set exits 1 with a usable message", async () => {
  const dir = tmpDataDir();
  const configPath = writeConfig(dir, {
    members: [{ id: "solo", workspaceId: "ws-solo", apiKeyId: "apikey_solo" }],
  });
  const { ANTHROPIC_ADMIN_KEY, ...envWithoutKey } = process.env;
  const p = Bun.spawn(["bun", "run", CLI, "poll", "--config", configPath, "--data", dir], {
    stdout: "pipe", stderr: "pipe", env: envWithoutKey,
  });
  const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  expect(code).toBe(1);
  expect(stderr).toContain("ANTHROPIC_ADMIN_KEY");
});

test("credit posts once, then dedups a same-day re-run of the same member/cents/note", async () => {
  const dir = tmpDataDir();
  const configPath = writeConfig(dir, {
    members: [{ id: "solo", workspaceId: "ws-solo", apiKeyId: "apikey_solo" }],
  });
  const creditArgs = ["credit", "--config", configPath, "--data", dir, "--member", "solo", "--cents", "2000", "--note", "topup"];

  const first = await run(creditArgs);
  expect(first.code).toBe(0);
  expect(first.stdout).toContain("posted");
  expect(first.stdout).toContain("$20.00");

  const second = await run(creditArgs);
  expect(second.code).toBe(0);
  expect(second.stdout).toContain("deduped");

  const ledgerLines = readFileSync(join(dir, "ledger.jsonl"), "utf8").trim().split("\n");
  expect(ledgerLines.length).toBe(1);
  const row = JSON.parse(ledgerLines[0]);
  expect(row.deltaMicroCents).toBe(2000 * 1_000_000);
});

test("credit rejects an unknown member with exit 1", async () => {
  const dir = tmpDataDir();
  const configPath = writeConfig(dir, {
    members: [{ id: "solo", workspaceId: "ws-solo", apiKeyId: "apikey_solo" }],
  });
  const r = await run(["credit", "--config", configPath, "--data", dir, "--member", "ghost", "--cents", "500", "--note", "x"]);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("ghost");
});

const COST_PAGE = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "fixtures", "pool", "cost-page.json"), "utf8"));

test("reconcile exits 2 when the cost report disagrees with the ledger past tolerance", async () => {
  const dir = tmpDataDir();
  const configPath = writeConfig(dir, {
    members: [{ id: "member-a", workspaceId: "ws-a", apiKeyId: "apikey_member_a" }],
  });
  // Ours: 350_000 microCents of usage on 2026-08-30 for ws-a. Theirs (cost-page.json):
  // "500.0000" parsed by parseCostReport -> 500*10_000 = 5_000_000. |delta| = 4_650_000,
  // far past the default tolerance (10_000 floor + 0.1% of 5_000_000 = 15_000) -> exit 2.
  const usageLine = {
    seq: 1, kind: "usage", memberId: "member-a", deltaMicroCents: -350_000,
    idempotencyKey: "u1", ts: "2026-08-30T10:00:00Z", detail: {}, appendedAt: "2026-08-30T10:00:00Z",
  };
  writeFileSync(join(dir, "ledger.jsonl"), JSON.stringify(usageLine) + "\n");

  const server = Bun.serve({
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === "/v1/organizations/cost_report") {
        return new Response(JSON.stringify(COST_PAGE), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const r = await run(
      ["reconcile", "--config", configPath, "--data", dir, "--day", "2026-08-30"],
      { ANTHROPIC_ADMIN_KEY: "sk-admin-test", TOKEN_SPREAD_TEST_BASE_URL: `http://localhost:${server.port}` },
    );
    expect(r.code).toBe(2);
    expect(r.stdout).toContain("OUT OF TOLERANCE");
    expect(r.stderr).toContain("out of tolerance");

    const ledgerLines = readFileSync(join(dir, "ledger.jsonl"), "utf8").trim().split("\n");
    expect(ledgerLines.length).toBe(2);
    const verdictRow = JSON.parse(ledgerLines[1]);
    expect(verdictRow.kind).toBe("reconciliation");
    expect(verdictRow.detail.withinTolerance).toBe(false);
  } finally {
    server.stop(true);
  }
});

test("reconcile surfaces unmapped ledger rows and exits 2 even when compared workspaces are within tolerance", async () => {
  const dir = tmpDataDir();
  const configPath = writeConfig(dir, {
    members: [{ id: "member-a", workspaceId: "ws-a", apiKeyId: "apikey_member_a" }],
  });
  // member-a's usage exactly matches the cost report for ws-a (delta 0, well within
  // tolerance). The only problem is a second usage row for a memberId entirely absent
  // from config, which ledgerDailyByWorkspace cannot attribute to any workspace — the
  // "final reconciliation after a departing member is removed from config" scenario
  // the finding describes.
  const lines = [
    { seq: 1, kind: "usage", memberId: "member-a", deltaMicroCents: -1_000_000, idempotencyKey: "u1", ts: "2026-08-30T10:00:00Z", detail: {}, appendedAt: "2026-08-30T10:00:00Z" },
    { seq: 2, kind: "usage", memberId: "ghost", deltaMicroCents: -500_000, idempotencyKey: "u2", ts: "2026-08-30T10:00:00Z", detail: {}, appendedAt: "2026-08-30T10:00:00Z" },
  ];
  writeFileSync(join(dir, "ledger.jsonl"), lines.map((l) => JSON.stringify(l) + "\n").join(""));

  const costPage = {
    data: [{ starting_at: "2026-08-30T00:00:00Z", results: [
      { amount: "1.000000", currency: "USD", workspace_id: "ws-a" },
    ] }],
    has_more: false, next_page: null,
  };
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === "/v1/organizations/cost_report") {
        return new Response(JSON.stringify(costPage), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const r = await run(
      ["reconcile", "--config", configPath, "--data", dir, "--day", "2026-08-30"],
      { ANTHROPIC_ADMIN_KEY: "sk-admin-test", TOKEN_SPREAD_TEST_BASE_URL: `http://localhost:${server.port}` },
    );
    expect(r.stdout).not.toContain("OUT OF TOLERANCE");
    expect(r.stderr).toContain("unmapped");
    expect(r.code).toBe(2);
  } finally {
    server.stop(true);
  }
});

test("poll runs end to end through the CLI process boundary against a stub Admin API", async () => {
  const dir = tmpDataDir();
  const configPath = writeConfig(dir, {
    members: [{ id: "member-b", workspaceId: "ws-b", apiKeyId: "apikey_member_b" }],
  });
  // usage-page2.json has has_more:false, so this fixture alone terminates the poller's
  // pagination loop in one round trip — pagination itself is covered in poller.test.ts.
  const usagePage = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "fixtures", "pool", "usage-page2.json"), "utf8"));

  const server = Bun.serve({
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === "/v1/organizations/usage_report/messages") {
        return new Response(JSON.stringify(usagePage), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const r = await run(
      ["poll", "--config", configPath, "--data", dir],
      { ANTHROPIC_ADMIN_KEY: "sk-admin-test", TOKEN_SPREAD_TEST_BASE_URL: `http://localhost:${server.port}` },
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("appended 1");
    expect(existsSync(join(dir, "health.json"))).toBe(true);
    expect(existsSync(join(dir, "ledger.jsonl"))).toBe(true);
  } finally {
    server.stop(true);
  }
});

test("status --html writes a standalone member page: balances in, key ids out", async () => {
  const dataDir = tmpDataDir();
  const configPath = writeConfig(dataDir, {
    members: [{ id: "member-b", workspaceId: "wrkspc_b", apiKeyId: "apikey_b" }],
  });
  // $20.00 credit = 2000 cents; no usage yet, so balance = spendable = $20.00
  // and the page must say so.
  await run(["credit", "--config", configPath, "--data", dataDir,
    "--member", "member-b", "--cents", "2000", "--note", "seed"]);
  const out = join(dataDir, "seats.html");
  const r = await run(["status", "--config", configPath, "--data", dataDir, "--html", out]);
  expect(r.code).toBe(0);
  const html = readFileSync(out, "utf8");
  expect(html).toContain("member-b");
  expect(html).toContain("$20.00");
  // Members see money, never plumbing: no key ids, no workspace ids on the page.
  expect(html).not.toContain("apikey_");
  expect(html).not.toContain("wrkspc");
  // Standalone: no external stylesheet, script, or font — it opens from an attachment.
  expect(html).not.toMatch(/<link[^>]+(href=")?http/);
  expect(html).not.toContain("<script src=");
});

test("qualify exits 0 in, 3 out, 1 on a nonsense report — all three doors", async () => {
  const dir = tmpDataDir();
  const good = join(dir, "light.json"), heavy = join(dir, "heavy.json"), junk = join(dir, "junk.json");
  // $5.20 over 26 days -> 600/30d < 1500 (half of $30): in. $515.10 -> way out.
  writeFileSync(good, JSON.stringify({ currentCost: { cents: 520 } }));
  writeFileSync(heavy, JSON.stringify({ currentCost: { cents: 51510 } }));
  writeFileSync(junk, JSON.stringify({ hello: "world" }));
  const base = ["qualify", "--days", "26", "--seat-cents", "3000", "--report"];
  const rIn = await run([...base, good]);
  expect(rIn.code).toBe(0);
  expect(rIn.stdout).toContain("QUALIFIED");
  const rOut = await run([...base, heavy]);
  expect(rOut.code).toBe(3);
  expect(rOut.stdout).toContain("NOT QUALIFIED");
  const rJunk = await run([...base, junk]);
  expect(rJunk.code).toBe(1);
});

test("doctor exits 0 on a healthy dir and 1 with a FAIL line on a poisoned ledger", async () => {
  const dir = tmpDataDir();
  const configPath = writeConfig(dir, {
    members: [{ id: "solo", workspaceId: "ws-solo", apiKeyId: "apikey_solo" }],
  });
  const ok = await run(["doctor", "--config", configPath, "--data", dir]);
  expect(ok.code).toBe(0);
  expect(ok.stdout).toContain("doctor: ready");
  writeFileSync(join(dir, "ledger.jsonl"), '{"seq":1,broken\n');
  const bad = await run(["doctor", "--config", configPath, "--data", dir]);
  expect(bad.code).toBe(1);
  expect(bad.stdout).toContain("FAIL");
  expect(bad.stdout).toContain("malformed");
});
