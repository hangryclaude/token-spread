import { expect, test } from "bun:test";
import { renderAuditHtml } from "../src/render/auditHtml";
import { buildReport } from "../src/report";
import { computeMetrics } from "../src/metrics";
import { simulate } from "../src/simulate";
import { detectTtlRightSizing } from "../src/detect/ttlRightSizing";
import { importAdminUsageReport } from "../src/importers/adminUsageReport";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";

const RESULT = {
  model: "claude-opus-5",
  workspace_id: "wrkspc_eng",
  account_id: null,
  service_tier: "standard",
  uncached_input_tokens: 4_000_000,
  cache_read_input_tokens: 180_000_000,
  cache_creation: { ephemeral_1h_input_tokens: 26_000_000, ephemeral_5m_input_tokens: 0 },
  output_tokens: 9_000_000,
};

function report(results: unknown[] = [RESULT]) {
  const r = importAdminUsageReport([{
    data: [{ starting_at: "2026-08-01T00:00:00Z", ending_at: "2026-08-02T00:00:00Z", results }],
    has_more: false, next_page: null,
  }]);
  const metrics = computeMetrics(r.events, CARD);
  // Same rule the CLI uses: you cannot target below what the traffic already achieves.
  const observed = Math.round(metrics.cacheHitRate * 100);
  const assumptions = { targetCacheHitPct: Math.max(observed, 90) };
  return buildReport({
    metrics,
    simulation: simulate(metrics, CARD, assumptions),
    assumptions,
    provenance: {
      linesSeen: r.provenance.results, imported: r.provenance.imported,
      malformed: r.provenance.malformed, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0,
      hiddenOutputTokens: 0, unknownTtlWrites: 0,
    },
    ttlRightSizing: detectTtlRightSizing(r.events, CARD),
    card: CARD,
    generatedAt: new Date("2026-08-11T12:00:00Z"),
  });
}

test("is a complete standalone document with no external requests", () => {
  const html = renderAuditHtml(report());
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html.trimEnd().endsWith("</html>")).toBe(true);
  // A document a CFO opens offline must not fetch anything.
  expect(html).not.toMatch(/<script\s+src=|<link[^>]+href="http|@import|url\(http/);
});

test("leads with the cost and the cache-hit rate", () => {
  const html = renderAuditHtml(report());
  expect(html).toContain("$595.00");   // 4M@$5 + 180M@$0.5 + 26M@$10 (1h write) + 9M@$25
  expect(html).toContain("98%");       // 180M reads / 184M eligible
});

test("every figure carries the evidence behind it", () => {
  // The number alone is a claim. The report has to say which events produced it and
  // under which rate card, or a finance team is right not to believe it.
  const html = renderAuditHtml(report());
  expect(html).toContain("2026-08-08");        // rate card capture date
  expect(html).toContain("admin_usage_report"); // where the events came from
  expect(html).toMatch(/1 (event|priced event)/);
});

test("states what could not be measured instead of omitting it", () => {
  const html = renderAuditHtml(report());
  expect(html.toLowerCase()).toContain("exposure");
  expect(html).toContain("26,000,000");
});

test("escapes customer-supplied strings", () => {
  // Model names and workspace ids come from the customer's own report. An audit
  // document that executes them is a vulnerability we handed to a prospect.
  const html = renderAuditHtml(report([
    { ...RESULT, workspace_id: "<img src=x onerror=alert(1)>" },
  ]));
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("&lt;img src=x");
});

test("is deterministic for the same report", () => {
  expect(renderAuditHtml(report())).toBe(renderAuditHtml(report()));
});

test("carries no prompt content, because the report never had any", () => {
  const html = renderAuditHtml(report());
  for (const banned of ["content", "messages", "prompt_text", "completion"]) {
    // the word may appear in prose; what must never appear is a field carrying text
    expect(html).not.toContain(`"${banned}":`);
  }
});
