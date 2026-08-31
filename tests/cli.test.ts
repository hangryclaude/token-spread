import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = `${import.meta.dir}/../src/cli.ts`;
const FIX = `${import.meta.dir}/../fixtures`;

async function run(args: string[]) {
  const p = Bun.spawn(["bun", "run", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { stdout, stderr, code: await p.exited };
}

test("prints a human summary containing the current cost", async () => {
  const r = await run(["--dir", FIX, "--only", "mixed.jsonl"]);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("$317.05");
});

test("--json emits parseable JSON with no prompt content", async () => {
  const r = await run(["--dir", FIX, "--only", "mixed.jsonl", "--json"]);
  expect(r.code).toBe(0);
  const parsed = JSON.parse(r.stdout);
  expect(parsed.currentCost.formatted).toBe("$317.05");
  for (const canary of ["SECRET_CANARY_ALPHA", "SECRET_CANARY_BETA", "SECRET_CANARY_GAMMA"]) {
    expect(r.stdout).not.toContain(canary);
  }
});

test("exits non-zero with a usable message when the directory is missing", async () => {
  const r = await run(["--dir", "/nope/does/not/exist"]);
  expect(r.code).not.toBe(0);
  expect(r.stderr).toContain("/nope/does/not/exist");
});

test("admin usage-report provenance keeps pages, buckets and unpriceableTier through the CLI merge", async () => {
  // cli.ts's admin-path merge used to hand-pick four ImportProvenance fields (linesSeen,
  // imported, malformed, deduped) off AdminImportProvenance and drop the rest on the
  // floor — the exact class of silent field-drop the transcript merge's exhaustive
  // Object.keys loop exists to prevent (see the thinkingDetailRecords comment in cli.ts).
  const dir = join(tmpdir(), `ts-admin-provenance-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const page = (results: unknown[]) => ({
    data: [{ starting_at: "2026-08-01T00:00:00Z", ending_at: "2026-08-02T00:00:00Z", results }],
    has_more: false, next_page: null,
  });
  const result = (tier: string) => ({
    model: "claude-opus-5", service_tier: tier, workspace_id: "w1", account_id: "a1",
    uncached_input_tokens: 1000, cache_read_input_tokens: 0, output_tokens: 500,
  });
  const f1 = join(dir, "page1.json");
  const f2 = join(dir, "page2.json");
  writeFileSync(f1, JSON.stringify(page([result("standard"), result("priority")])));
  writeFileSync(f2, JSON.stringify(page([result("standard")])));
  try {
    const r = await run(["--admin", `${f1},${f2}`, "--json"]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.provenance.pages).toBe(2);
    expect(parsed.provenance.buckets).toBe(2);
    expect(parsed.provenance.unpriceableTier).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runs the three detectors and --batch-share through the real CLI process boundary", async () => {
  // Every prior test of ttlRightSizing/ttlCrossing/spendAnomaly calls the detector
  // functions directly on in-memory events. None of them proves the wiring through
  // cli.ts, importClaudeCodeJsonl and buildReport survives a real spawn — the process
  // boundary is exactly where a forgotten import or a field left off the merged report
  // would show up as an absence, not a crash.
  const r = await run([
    "--dir", FIX, "--only", "e2e-detectors.jsonl", "--batch-share", "50", "--json",
  ]);
  expect(r.code).toBe(0);
  const parsed = JSON.parse(r.stdout);

  // TTL right-sizing: the one-hour write on day 1 is re-read two minutes later.
  expect(parsed.ttlRightSizing.overBoughtTokens).toBe(1_000_000);
  expect(parsed.ttlRightSizing.recoverableMicroCents).toBe(375_000_000);
  expect(r.stdout).toContain("$3.75");

  // TTL crossing: that same session writes 1h then, on its next request, 5m-only.
  expect(parsed.ttlCrossing.flippedSessions).toBe(1);
  expect(parsed.ttlCrossing.affectedWriteTokens).toBe(200_000);
  expect(r.stdout).toContain("flipped from 1-hour to 5-minute");

  // Spend anomaly: 7 quiet $10 days then a $100 spike, 10x the trailing median.
  expect(parsed.spendAnomaly.anomalies.length).toBe(1);
  expect(parsed.spendAnomaly.anomalies[0].day).toBe("2026-08-09");
  expect(r.stdout).toContain("spend anomaly");
  expect(r.stdout).toContain("2026-08-09");

  // --batch-share: opt-in only, and only present because the flag was passed.
  expect(parsed.batchTier).not.toBeNull();
  expect(parsed.batchTier.saved.microCents).toBeGreaterThan(0);

  // Content never reaches the report, on the detector-heavy path same as any other.
  expect(r.stdout).not.toContain("SECRET_CANARY_DETECTORS");
});
