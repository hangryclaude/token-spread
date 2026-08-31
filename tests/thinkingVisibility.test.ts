import { expect, test } from "bun:test";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { computeMetrics } from "../src/metrics";
import { simulate } from "../src/simulate";
import { buildReport } from "../src/report";
import { detectTtlRightSizing } from "../src/detect/ttlRightSizing";
import { detectTtlCrossing } from "../src/detect/ttlCrossing";
import { detectSpendAnomaly } from "../src/detect/spendAnomaly";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";

/**
 * Extended thinking bills as output, so the totals are right either way. What a Claude Code
 * transcript cannot answer is how much of that output WAS thinking — the split lives in
 * `usage.output_tokens_details`, and measured on this machine on 2026-08-12, 0 of 108,042 usage
 * records across 1,661 transcripts carried it.
 *
 * That absence is worth stating rather than leaving for the reader to notice, and stating it
 * honestly means counting rather than assuming: "we did not look" and "we looked and it is never
 * there" are different claims, and only the second belongs in a report that sells traceability.
 * So the importer counts the field and the report speaks only when the count is zero.
 */

const line = (req: string, details?: object) => JSON.stringify({
  type: "assistant", timestamp: "2026-08-01T10:00:00Z", requestId: req, sessionId: "s",
  message: {
    model: "claude-opus-5",
    usage: {
      input_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
      output_tokens: 500, service_tier: "standard",
      ...(details ? { output_tokens_details: details } : {}),
    },
  },
});

const report = (lines: string[]) => {
  const imported = importClaudeCodeJsonl(lines, { projectId: "p", seen: new Set() });
  const metrics = computeMetrics(imported.events, CARD);
  const A = { targetCacheHitPct: 90 };
  return {
    provenance: imported.provenance,
    report: buildReport({
      metrics, simulation: simulate(metrics, CARD, A), assumptions: A,
      provenance: imported.provenance, ttlRightSizing: detectTtlRightSizing([], CARD),
      ttlCrossing: detectTtlCrossing([]), spendAnomaly: detectSpendAnomaly(computeMetrics([], CARD)),
      card: CARD, generatedAt: new Date("2026-08-12T00:00:00Z"),
    }),
  };
};

const SAYS_SO = (w: string) => w.includes("output_tokens_details");

test("counts zero when no record reports the thinking split", () => {
  const { provenance } = report([line("a"), line("b")]);
  expect(provenance.imported).toBe(2);
  expect(provenance.thinkingDetailRecords).toBe(0);
});

test("counts the records that do report it", () => {
  // The control for the test above: if the counter were hard-wired to zero, or the field were
  // never read, this fails — and the warning below would then fire on data that can answer the
  // question, which is a worse failure than staying silent.
  const { provenance } = report([line("a"), line("b", { thinking_tokens: 120 })]);
  expect(provenance.thinkingDetailRecords).toBe(1);
});

test("the report says the split is unavailable, rather than leaving it absent", () => {
  const { report: r } = report([line("a"), line("b")]);
  expect(r.warnings.some(SAYS_SO), `warnings were: ${JSON.stringify(r.warnings)}`).toBe(true);
});

test("and says nothing once even one record carries the split", () => {
  const { report: r } = report([line("a"), line("b", { thinking_tokens: 120 })]);
  expect(r.warnings.some(SAYS_SO)).toBe(false);
});

test("an empty import does not claim the field is missing", () => {
  // Zero records carrying it and zero records at all are the same number and different facts.
  // Warning on an empty run would report a data limitation where there is simply no data.
  const { report: r } = report([]);
  expect(r.warnings.some(SAYS_SO)).toBe(false);
});
