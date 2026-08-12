import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { computeMetrics } from "../src/metrics";
import { simulate } from "../src/simulate";
import { buildReport } from "../src/report";
import { detectTtlRightSizing } from "../src/detect/ttlRightSizing";
import { renderAuditHtml } from "../src/render/auditHtml";
import { importAdminUsageReport } from "../src/importers/adminUsageReport";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";

/**
 * An adversarial review found the hole on 2026-08-12, and it was reproduced before being fixed:
 * a transcript directory entirely on the priority tier imported cleanly, priced nothing, and the
 * CLI printed "Current cost: $0.00 across 0 priced events" with exit 0 and an EMPTY warnings
 * array. "Refuse rather than reassure" was enforced at import only — of the three pricing-time
 * skip reasons, only unknown_model had a voice.
 *
 * Three layers now answer for it: the report warns on every skip reason, the CLI refuses when
 * everything imported and nothing priced, and the HTML document states its real data source
 * instead of inferring one from an unrelated field (it stamped every local-transcript audit
 * "admin_usage_report", and the only test on that line used admin fixtures exclusively, so it
 * passed identically whether the label was derived or hardcoded).
 */

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

const LINE = (req: string, tier: string) => JSON.stringify({
  type: "assistant", timestamp: "2026-08-01T10:00:00Z", requestId: req, sessionId: "s",
  message: {
    model: "claude-opus-5",
    usage: {
      input_tokens: 5000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
      output_tokens: 900, service_tier: tier,
    },
  },
}) + "\n";

test("a directory that imports fine but prices nothing exits non-zero and says why", async () => {
  const root = join(tmpdir(), `ts-unpriceable-${Date.now()}`);
  mkdirSync(join(root, "proj"), { recursive: true });
  writeFileSync(join(root, "proj", "a.jsonl"), LINE("r1", "priority") + LINE("r2", "priority"));
  try {
    const proc = Bun.spawn(["bun", "run", CLI, "--dir", root], { stdout: "pipe", stderr: "pipe" });
    const code = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(code).toBe(1);
    expect(stderr).toContain("no priceable events");
    expect(stderr).toContain("unpriceable service tier");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const reportFor = (lines: string[]) => {
  const imported = importClaudeCodeJsonl(lines, { projectId: "p", seen: new Set() });
  const metrics = computeMetrics(imported.events, CARD);
  const A = { targetCacheHitPct: 90 };
  return buildReport({
    metrics, simulation: simulate(metrics, CARD, A), assumptions: A,
    provenance: imported.provenance, ttlRightSizing: detectTtlRightSizing([], CARD),
    card: CARD, generatedAt: new Date("2026-08-12T00:00:00Z"),
  });
};

test("an unpriceable tier is a warning, not a silence", () => {
  const r = reportFor([LINE("r1", "standard"), LINE("r2", "priority")]);
  expect(r.warnings.some((w) => w.includes("service tier"))).toBe(true);
  // And the control: all-standard traffic must NOT carry the warning.
  const clean = reportFor([LINE("r1", "standard"), LINE("r2", "standard")]);
  expect(clean.warnings.some((w) => w.includes("service tier"))).toBe(false);
});

test("the HTML document states the source the events actually came from", () => {
  const html = renderAuditHtml(reportFor([LINE("r1", "standard")]));
  expect(html).toContain("claude_code");
  expect(html).not.toContain("admin_usage_report");
});

test("and an admin-report audit still says admin_usage_report", () => {
  // The other direction, so the fix is proven derived rather than hardcoded the opposite way.
  const page = {
    data: [{
      starting_at: "2026-08-01T00:00:00Z", ending_at: "2026-08-02T00:00:00Z",
      results: [{
        uncached_input_tokens: 5000, output_tokens: 900,
        cache_read_input_tokens: 0,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
        model: "claude-opus-5", service_tier: "standard",
      }],
    }],
  };
  const imported = importAdminUsageReport([page], { seen: new Set() });
  const metrics = computeMetrics(imported.events, CARD);
  const A = { targetCacheHitPct: 90 };
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, A), assumptions: A,
    provenance: {
      linesSeen: 1, imported: 1, malformed: 0, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
      unknownTtlWrites: 0, thinkingDetailRecords: 1,
    },
    ttlRightSizing: detectTtlRightSizing([], CARD), card: CARD,
    generatedAt: new Date("2026-08-12T00:00:00Z"),
  });
  const html = renderAuditHtml(r);
  expect(html).toContain("admin_usage_report");
  expect(html).not.toContain("claude_code");
});

test("a flag missing its value is refused cleanly, not crashed through", async () => {
  const proc = Bun.spawn(["bun", "run", CLI, "--cache-target", "--json"], { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  expect(code).toBe(2);
  expect(stderr).toContain("--cache-target needs a value");
  // The old behaviour was a raw Bun stack trace from simulate() rejecting NaN. A frame line is
  // indented "    at fn (file)" — checking bare "at " matched the word "what" in the help text.
  expect(stderr).not.toMatch(/^\s+at .+\(/m);
  expect(stderr).not.toContain("error: Uncaught");
});
