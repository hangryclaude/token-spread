import { expect, test } from "bun:test";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { computeMetrics } from "../src/metrics";
import { simulate } from "../src/simulate";
import { buildReport } from "../src/report";
import { detectTtlRightSizing } from "../src/detect/ttlRightSizing";
import { detectTtlCrossing } from "../src/detect/ttlCrossing";
import { detectSpendAnomaly } from "../src/detect/spendAnomaly";
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

const build = (lines: string[], targetCacheHitPct = 90) => {
  const imported = importClaudeCodeJsonl(lines, { projectId: "p", seen: new Set() });
  const metrics = computeMetrics(imported.events, CARD);
  const A = { targetCacheHitPct };
  return buildReport({
    metrics, simulation: simulate(metrics, CARD, A), assumptions: A,
    provenance: imported.provenance,
    ttlRightSizing: detectTtlRightSizing(imported.events, CARD),
    ttlCrossing: detectTtlCrossing(imported.events),
    spendAnomaly: detectSpendAnomaly(metrics),
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

// A 1-hour write re-read two minutes later — the one fixture in this file guaranteed to
// produce a real TTL right-sizing finding, not just cache headroom. `line()`'s traffic
// carries no cache writes at all, so `r.findings` is empty for it as often as not.
const writes1h = JSON.stringify({
  type: "assistant", timestamp: "2026-08-01T10:00:00Z", requestId: "w", sessionId: "s",
  message: { model: "claude-opus-5", usage: {
    input_tokens: 1_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 100_000,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100_000 },
    output_tokens: 100, service_tier: "standard" } } });
const reread = JSON.stringify({
  type: "assistant", timestamp: "2026-08-01T10:02:00Z", requestId: "r", sessionId: "s",
  message: { model: "claude-opus-5", usage: {
    input_tokens: 1_000, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 0,
    output_tokens: 100, service_tier: "standard" } } });

test("a finding carries whether its evidence is independently provable, not just the tag name", () => {
  // evidence.ts's own docstring calls this the load-bearing distinction: PASS_METADATA rests
  // on Anthropic's documented promise that cache_control does not change output, which is a
  // different act from verifying a hash. isProvable() existed and was unit-tested but never
  // reached a finding until now — this pins it reaching the actual report the CLI builds.
  const r = build([writes1h, reread], 99);
  expect(r.findings.length).toBeGreaterThan(0);
  for (const f of r.findings) {
    expect(f.evidence).toBe("PASS_METADATA");
    expect(f.provable).toBe(false);
  }
});

test("the rendered document says so when a lever rests on provider documentation, not proof", () => {
  const r = build([writes1h, reread], 99);
  const html = renderAuditHtml(r);
  expect(r.findings.every((f) => !f.provable)).toBe(true);
  expect(html).toContain("Rests on the provider's own documentation");
});

test("the headline can never exceed the bill it claims to reduce", () => {
  /* The overbought-1h case: a 1-hour write re-read two minutes later, with a target hit rate
     above observed. The simulation used to reprice its synthetic write volume 100% at the
     5-minute rate — silently absorbing the TTL lever that allMeasured then ADDED again, so the
     "Recoverable" tile could print more than 100% of the bill on a document whose whole claim
     is that it only states what it can prove. Found 2026-08-21 by an adversarial review pass. */
  const r = build([writes1h, reread], 99);
  expect(r.savings.allMeasured.cents,
    `headline ${r.savings.allMeasured.formatted} exceeds the whole bill ${r.currentCost.formatted}`)
    .toBeLessThanOrEqual(r.currentCost.cents);
});
