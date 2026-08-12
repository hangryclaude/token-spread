import { expect, test } from "bun:test";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { computeMetrics } from "../src/metrics";
import { simulate } from "../src/simulate";
import { buildReport } from "../src/report";
import { detectTtlRightSizing } from "../src/detect/ttlRightSizing";
import { renderAuditHtml } from "../src/render/auditHtml";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";

/**
 * The audit document leads with a figure labelled "Recoverable". It was fed `savings.combined`,
 * which is cache headroom ALONE — so on a machine already at a 100% cache-hit rate the first
 * number a buyer read was "$0.00, 0% of the bill", printed directly above a priced finding worth
 * $374.93 in the very next section of the same page. Found 2026-08-13 by rendering the real
 * document and looking at it, which no test was doing.
 *
 * `savings.allMeasured` is the sum of every priced lever. These two may be ADDED rather than
 * compounded because they act on disjoint token classes — cache headroom re-prices fresh input,
 * TTL right-sizing re-prices cache writes — so no token is discounted twice. That assumption is
 * load-bearing and is pinned below: if a future finding touches fresh input, the last test here
 * fails and the arithmetic must become a compounding one, because the register's own rule is
 * that levers multiply and a sum overstates.
 */

const line = (req: string, over: Record<string, unknown> = {}) => JSON.stringify({
  type: "assistant", timestamp: "2026-08-01T10:00:00Z", requestId: req, sessionId: "s",
  message: {
    model: "claude-opus-5",
    usage: {
      input_tokens: 200_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
      output_tokens: 1_000, service_tier: "standard", ...over,
    },
  },
});

const build = (lines: string[]) => {
  const imported = importClaudeCodeJsonl(lines, { projectId: "p", seen: new Set() });
  const metrics = computeMetrics(imported.events, CARD);
  const A = { targetCacheHitPct: 90 };
  return buildReport({
    metrics, simulation: simulate(metrics, CARD, A), assumptions: A,
    provenance: imported.provenance,
    ttlRightSizing: detectTtlRightSizing(imported.events, CARD),
    card: CARD, generatedAt: new Date("2026-08-13T00:00:00Z"),
  });
};

test("allMeasured is never smaller than any single finding it claims to contain", () => {
  /* The exact defect, stated as a property. Whatever the traffic, the headline figure cannot be
     less than a lever the document prints below it — that is the contradiction a buyer catches. */
  const r = build([line("a"), line("b"), line("c")]);
  for (const f of r.findings) {
    expect(r.savings.allMeasured.cents, `headline (${r.savings.allMeasured.formatted}) is below finding "${f.lever}" (${f.saved.formatted})`)
      .toBeGreaterThanOrEqual(f.saved.cents);
  }
});

test("allMeasured equals cache headroom plus every priced finding, exactly", () => {
  const r = build([line("a"), line("b")]);
  const findings = r.findings.reduce((n, f) => n + f.saved.cents, 0);
  expect(r.savings.allMeasured.cents).toBe(r.savings.combined.cents + findings);
});

test("with no findings at all, the headline is still the cache figure", () => {
  // The control for the test above: adding findings must be what moves it, not a constant.
  const r = build([line("a")]);
  if (r.findings.length === 0) {
    expect(r.savings.allMeasured.cents).toBe(r.savings.combined.cents);
  }
});

test("the rendered document's headline agrees with its own body", () => {
  /* End to end, in the artifact that actually gets sent: the figure in the tile must appear,
     and the old behaviour — "$0.00" beside a non-zero finding — must not. */
  const r = build([line("a"), line("b"), line("c")]);
  const html = renderAuditHtml(r);
  expect(html).toContain(r.savings.allMeasured.formatted);
  if (r.findings.length > 0 && r.savings.allMeasured.cents > 0) {
    const tile = html.slice(html.indexOf("Recoverable"), html.indexOf("Recoverable") + 220);
    expect(tile, "the Recoverable tile still prints $0.00 while findings exist").not.toContain("$0.00");
  }
});

test("the disjointness assumption behind adding rather than compounding still holds", () => {
  /* allMeasured ADDS cache headroom and the findings. That is only exact while the levers act on
     different token classes. Today the only priced finding is cache-write TTL right-sizing, which
     touches cache writes; cache headroom touches fresh input. If a finding appears whose lever is
     anything else, this fails deliberately — go and make the arithmetic compound. */
  const r = build([line("a"), line("b"), line("c")]);
  const levers = r.findings.map((f) => f.lever);
  const unexpected = levers.filter((l) => l !== "cache-write TTL right-sizing");
  expect(unexpected, `new priced lever(s) ${unexpected.join(", ")} — adding may now double-count; compound instead`)
    .toEqual([]);
});
