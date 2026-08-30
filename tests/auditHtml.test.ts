import { expect, test } from "bun:test";
import { renderAuditHtml } from "../src/render/auditHtml";
import { buildReport } from "../src/report";
import { computeMetrics } from "../src/metrics";
import { simulate } from "../src/simulate";
import { detectTtlRightSizing } from "../src/detect/ttlRightSizing";
import { detectTtlCrossing } from "../src/detect/ttlCrossing";
import { detectSpendAnomaly } from "../src/detect/spendAnomaly";
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

function report(results: unknown[] = [RESULT], extraAssumptions: Record<string, unknown> = {}) {
  const r = importAdminUsageReport([{
    data: [{ starting_at: "2026-08-01T00:00:00Z", ending_at: "2026-08-02T00:00:00Z", results }],
    has_more: false, next_page: null,
  }]);
  const metrics = computeMetrics(r.events, CARD);
  // Same rule the CLI uses: you cannot target below what the traffic already achieves.
  const observed = Math.round(metrics.cacheHitRate * 100);
  const assumptions = { targetCacheHitPct: Math.max(observed, 90), ...extraAssumptions };
  return buildReport({
    metrics,
    simulation: simulate(metrics, CARD, assumptions),
    assumptions,
    provenance: {
      linesSeen: r.provenance.results, imported: r.provenance.imported,
      malformed: r.provenance.malformed, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0,
      hiddenOutputTokens: 0, unknownTtlWrites: 0, thinkingDetailRecords: 0,
      pages: 0, buckets: 0, unpriceableTier: 0,
    },
    ttlRightSizing: detectTtlRightSizing(r.events, CARD),
    ttlCrossing: detectTtlCrossing(r.events),
    spendAnomaly: detectSpendAnomaly(metrics),
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

test("carries its own type rather than fetching it", () => {
  // A document that fetched its own fonts would render wrong on the air-gapped laptop it
  // is most likely to be opened on, and would break the promise the rest of the tool makes.
  const html = renderAuditHtml(report());
  expect(html).toContain("@font-face");
  expect(html).toContain("rel=\"icon\" href=\"data:image/svg+xml");
  expect(html).toContain("url(data:font/woff2;base64,");
  expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|url\(['"]?https?:/);
});

test("renders the batch-tier lever as opt-in and contractual, apart from the measured levers", () => {
  const html = renderAuditHtml(report([RESULT], { batchShareTargetPct: 40 }));
  expect(html).toContain("Batch tier");
  expect(html).toContain("CONTRACTUAL_ONLY");
  expect(html.toLowerCase()).toContain("opt-in");
  expect(html).toContain("excluded from the Recoverable");
});

test("no batch share requested renders no batch block", () => {
  // The coverage table names the batch FAMILY in every document — that is a statement
  // about what the audit can check, not a simulated figure. What must not render without
  // the flag is the lever block itself.
  expect(renderAuditHtml(report())).not.toContain("Opt-in: Batch tier");
});

test("renders spend by service tier", () => {
  const html = renderAuditHtml(report([
    RESULT,
    { ...RESULT, service_tier: "batch" },
  ]));
  expect(html).toContain("By service tier");
  expect(html).toContain("batch");
});

test("states what it checked against the register, family by family", () => {
  const html = renderAuditHtml(report());
  expect(html).toContain("What this audit checked");
  expect(html).toContain("Cache-hit headroom");
  expect(html).toContain("invisible");
  // The invisible rows are the credibility: a tool that only lists what it can see is advertising.
  expect(html).toContain("Waste: retries, duplicates, zombie loops");
});
