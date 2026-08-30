import { expect, test } from "bun:test";
import { detectTtlRightSizing } from "../src/detect/ttlRightSizing";
import { detectTtlCrossing } from "../src/detect/ttlCrossing";
import { detectSpendAnomaly } from "../src/detect/spendAnomaly";
import { buildReport } from "../src/report";
import { computeMetrics } from "../src/metrics";
import { simulate } from "../src/simulate";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { importAdminUsageReport } from "../src/importers/adminUsageReport";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";

const A = { targetCacheHitPct: 90 };

async function build(generatedAt = new Date("2026-08-08T00:00:00Z")) {
  const text = await Bun.file(`${import.meta.dir}/../fixtures/mixed.jsonl`).text();
  const imported = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId: "demo" });
  const metrics = computeMetrics(imported.events, CARD);
  const simulation = simulate(metrics, CARD, A);
  return buildReport({ metrics, simulation, assumptions: A, provenance: imported.provenance,
    ttlRightSizing: detectTtlRightSizing([], CARD), ttlCrossing: detectTtlCrossing([]), spendAnomaly: detectSpendAnomaly(computeMetrics([], CARD)), card: CARD, generatedAt });
}

test("states the current cost in dollars", async () => {
  expect((await build()).currentCost.formatted).toBe("$317.05");
});

test("tags every assumption as measured or operator-set", async () => {
  const r = await build();
  const tags = Object.fromEntries(r.assumptions.map((a) => [a.name, a.kind]));
  expect(tags["cacheHitRate"]).toBe("measured");
});

test("carries the rate card it actually used", async () => {
  const r = await build();
  expect(r.rateCard.capturedAt).toBe("2026-08-08");
  expect(r.rateCard.rates["claude-opus-5"].input).toBe(500);
});

test("carries full provenance", async () => {
  const r = await build();
  expect(r.provenance.imported).toBe(2);
  expect(r.provenance.skippedNonAssistant).toBe(1);
});

test("warns when the rate card is stale", async () => {
  const fresh = await build(new Date("2026-08-08T00:00:00Z"));
  const stale = await build(new Date("2026-10-01T00:00:00Z"));
  expect(fresh.warnings.some((w) => w.includes("rate card"))).toBe(false);
  expect(stale.warnings.some((w) => w.includes("rate card"))).toBe(true);
});

test("the human summary states the cache-hit definition and the compounding caveat", async () => {
  const s = (await build()).humanSummary;
  expect(s).toContain("cache writes are excluded");
  expect(s).toContain("do not add");
});

test("is byte-identical across runs", async () => {
  const a = JSON.stringify(await build());
  const b = JSON.stringify(await build());
  expect(a).toBe(b);
});

test("warns when the assumed write overhead diverges from the measured one", async () => {
  const text = await Bun.file(`${import.meta.dir}/../fixtures/mixed.jsonl`).text();
  const imported = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId: "demo" });
  const metrics = computeMetrics(imported.events, CARD);

  // mixed.jsonl carries 5 MTok of writes against 100 MTok eligible — exactly 5%.
  const agrees = buildReport({
    metrics, simulation: simulate(metrics, CARD, { ...A, cacheWriteOverheadPct: 5 }),
    assumptions: { ...A, cacheWriteOverheadPct: 5 }, provenance: imported.provenance,
    ttlRightSizing: detectTtlRightSizing([], CARD), ttlCrossing: detectTtlCrossing([]), spendAnomaly: detectSpendAnomaly(computeMetrics([], CARD)),
    card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
  expect(agrees.warnings.some((w) => w.includes("write overhead"))).toBe(false);

  const diverges = buildReport({
    metrics, simulation: simulate(metrics, CARD, { ...A, cacheWriteOverheadPct: 40 }),
    assumptions: { ...A, cacheWriteOverheadPct: 40 }, provenance: imported.provenance,
    ttlRightSizing: detectTtlRightSizing([], CARD), ttlCrossing: detectTtlCrossing([]), spendAnomaly: detectSpendAnomaly(computeMetrics([], CARD)),
    card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
  expect(diverges.warnings.some((w) => w.includes("assumed at 40% but measures 5%"))).toBe(true);
});

test("warns rather than reporting a silent negative when there is no cache headroom", async () => {
  const text = await Bun.file(`${import.meta.dir}/../fixtures/mixed.jsonl`).text();
  const imported = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId: "demo" });
  const metrics = computeMetrics(imported.events, CARD);

  // A punitive write assumption drives the simulated cache cost above the baseline.
  const a = { ...A, targetCacheHitPct: 90, cacheWriteOverheadPct: 90 };
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: imported.provenance,
    ttlRightSizing: detectTtlRightSizing([], CARD), ttlCrossing: detectTtlCrossing([]), spendAnomaly: detectSpendAnomaly(computeMetrics([], CARD)), card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
  expect(r.cacheHeadroom!.saved.microCents).toBeLessThan(0);
  expect(r.warnings.some((w) => w.includes("no cache lever left"))).toBe(true);
});

test("reports the measured write overhead beside the assumed one", async () => {
  const r = await build();
  const measured = r.assumptions.find((a) => a.name === "measuredCacheWriteOverhead")!;
  expect(measured.kind).toBe("measured");
  expect(measured.value).toBe("5%");
});

test("reports the simulated cache-write overhead as operator-set", async () => {
  const r = await build();
  const note = r.assumptions.find((a) => a.name === "cacheWriteOverhead")!;
  expect(note.kind).toBe("operator_set");
  expect(note.value).toBe("5%");
});

// ── batch-tier lever (opt-in, contractual) ───────────────────────────────────────────────

async function buildWithBatch(sharePct: number | null) {
  const text = await Bun.file(`${import.meta.dir}/../fixtures/mixed.jsonl`).text();
  const imported = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId: "demo" });
  const metrics = computeMetrics(imported.events, CARD);
  const a = sharePct === null ? A : { ...A, batchShareTargetPct: sharePct };
  return buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: imported.provenance,
    ttlRightSizing: detectTtlRightSizing([], CARD), ttlCrossing: detectTtlCrossing([]), spendAnomaly: detectSpendAnomaly(computeMetrics([], CARD)), card: CARD,
    generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
}

test("batch-tier lever rides the report apart from every measured figure", async () => {
  const withBatch = await buildWithBatch(50);
  const without = await buildWithBatch(null);

  expect(withBatch.batchTier).not.toBeNull();
  expect(withBatch.batchTier!.targetSharePct).toBe(50);
  expect(withBatch.batchTier!.saved.microCents).toBeGreaterThan(0);

  // Contractual and opt-in: the measured headline must be byte-identical with or without it.
  expect(withBatch.savings.allMeasured.microCents).toBe(without.savings.allMeasured.microCents);
  expect(withBatch.savings.combined.microCents).toBe(without.savings.combined.microCents);

  const note = withBatch.assumptions.find((x) => x.name === "batchShareTarget");
  expect(note?.kind).toBe("operator_set");
  expect(note?.value).toBe("50%");

  expect(withBatch.humanSummary).toContain("Batch tier");
  expect(withBatch.humanSummary.toLowerCase()).toContain("contractual");
});

test("no batch share requested leaves no batch trace anywhere in the report", async () => {
  const r = await buildWithBatch(null);
  expect(r.batchTier).toBeNull();
  expect(r.assumptions.some((x) => x.name === "batchShareTarget")).toBe(false);
  expect(r.humanSummary).not.toContain("Batch tier");
});

test("warns when a batch share is set but nothing is on the standard tier to move", () => {
  const r0 = importAdminUsageReport([{
    data: [{ starting_at: "2026-08-01T00:00:00Z", ending_at: "2026-08-02T00:00:00Z", results: [{
      model: "claude-opus-5", workspace_id: "w", account_id: null, service_tier: "batch",
      uncached_input_tokens: 1_000_000, cache_read_input_tokens: 0,
      cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
      output_tokens: 0,
    }] }], has_more: false, next_page: null,
  }]);
  const metrics = computeMetrics(r0.events, CARD);
  const a = { targetCacheHitPct: null, batchShareTargetPct: 50 };
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: { linesSeen: 1, imported: 1, malformed: 0, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
      unknownTtlWrites: 0, thinkingDetailRecords: 0, pages: 0, buckets: 0, unpriceableTier: 0 },
    ttlRightSizing: detectTtlRightSizing([], CARD), ttlCrossing: detectTtlCrossing([]), spendAnomaly: detectSpendAnomaly(computeMetrics([], CARD)), card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
  expect(r.warnings.some((w) => w.includes("no standard-tier traffic"))).toBe(true);
});

test("a batch share with standard traffic to move does not raise the no-traffic warning", async () => {
  const r = await buildWithBatch(50);
  expect(r.warnings.some((w) => w.includes("no standard-tier traffic"))).toBe(false);
});

// ── spend by service tier (register exposure ids 76, 86, 123) ────────────────────────────

// One MTok of fresh Opus input on each tier: standard bills $5.00, batch the contractual
// half at $2.50. Hand-computed from the 2026-08-08 card ($5/MTok input).
test("splits spend by service tier so batch exposure is visible", () => {
  const r0 = importAdminUsageReport([{
    data: [{ starting_at: "2026-08-01T00:00:00Z", ending_at: "2026-08-02T00:00:00Z", results: [
      { model: "claude-opus-5", workspace_id: "w", account_id: null, service_tier: "standard",
        uncached_input_tokens: 1_000_000, cache_read_input_tokens: 0,
        cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 }, output_tokens: 0 },
      { model: "claude-opus-5", workspace_id: "w", account_id: null, service_tier: "batch",
        uncached_input_tokens: 1_000_000, cache_read_input_tokens: 0,
        cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 }, output_tokens: 0 },
    ] }], has_more: false, next_page: null,
  }]);
  const metrics = computeMetrics(r0.events, CARD);
  const a = { targetCacheHitPct: null };
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: { linesSeen: 2, imported: 2, malformed: 0, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
      unknownTtlWrites: 0, thinkingDetailRecords: 0, pages: 0, buckets: 0, unpriceableTier: 0 },
    ttlRightSizing: detectTtlRightSizing([], CARD), ttlCrossing: detectTtlCrossing([]), spendAnomaly: detectSpendAnomaly(computeMetrics([], CARD)), card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
  expect(r.byTier["standard"].formatted).toBe("$5.00");
  expect(r.byTier["batch"].formatted).toBe("$2.50");
});

// Claude Code transcripts rarely stamp a tier; null must surface as its own labelled row,
// not vanish or masquerade as standard.
test("events with no service tier land in an 'unspecified' row", async () => {
  const r = await buildWithBatch(null);
  expect(Object.keys(r.byTier)).toEqual(["unspecified"]);
  expect(r.byTier["unspecified"].microCents).toBe(r.currentCost.microCents);
});

test("warns when sessions flipped from 1h to 5m cache writes, naming the env var", () => {
  // One session, a 1-hour write then 5-minute-only writes: register id 184's signature.
  const base = {
    accountId: "local", projectId: "p", sessionId: "s-flip", source: "claude_code" as const,
    serviceTier: null, model: "claude-opus-5",
    inputTokens: 1000, cacheReadTokens: 0, outputTokens: 100,
    compactionInputTokens: 0, compactionOutputTokens: 0,
  };
  const events = [
    { ...base, idempotencyKey: "f1", ts: "2026-08-01T00:00:00Z",
      cacheCreationTokens: 1000, cacheCreation1hTokens: 1000, cacheCreation5mTokens: 0 },
    { ...base, idempotencyKey: "f2", ts: "2026-08-01T00:10:00Z",
      cacheCreationTokens: 800, cacheCreation1hTokens: 0, cacheCreation5mTokens: 800 },
  ];
  const metrics = computeMetrics(events, CARD);
  const a = { targetCacheHitPct: null };
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: { linesSeen: 2, imported: 2, malformed: 0, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
      unknownTtlWrites: 0, thinkingDetailRecords: 2, pages: 0, buckets: 0, unpriceableTier: 0 },
    ttlRightSizing: detectTtlRightSizing(events, CARD),
    ttlCrossing: detectTtlCrossing(events),
    spendAnomaly: detectSpendAnomaly(metrics),
    card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
  expect(r.warnings.some((w) => w.includes("ENABLE_PROMPT_CACHING_1H"))).toBe(true);
  expect(r.warnings.some((w) => w.includes("1 session"))).toBe(true);
});

test("no flipped session, no crossing warning", async () => {
  const r = await build();
  expect(r.warnings.some((w) => w.includes("ENABLE_PROMPT_CACHING_1H"))).toBe(false);
});

test("an anomalous day becomes a dated, dollared warning", () => {
  const base = {
    accountId: "local", projectId: "p", sessionId: null, source: "claude_code" as const,
    serviceTier: null, model: "claude-opus-5",
    cacheReadTokens: 0, cacheCreationTokens: 0, cacheCreation5mTokens: 0, cacheCreation1hTokens: 0,
    outputTokens: 0, compactionInputTokens: 0, compactionOutputTokens: 0,
  };
  // Eight quiet $10.00 days, then a $100.00 day: the runaway shape, in integer micro-cents.
  const events = [
    ...Array.from({ length: 8 }, (_, i) => ({
      ...base, idempotencyKey: `q${i}`, ts: `2026-08-0${i + 1}T12:00:00Z`, inputTokens: 2_000_000,
    })),
    { ...base, idempotencyKey: "spike", ts: "2026-08-09T12:00:00Z", inputTokens: 20_000_000 },
  ];
  const metrics = computeMetrics(events, CARD);
  const a = { targetCacheHitPct: null };
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: { linesSeen: 9, imported: 9, malformed: 0, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
      unknownTtlWrites: 0, thinkingDetailRecords: 9, pages: 0, buckets: 0, unpriceableTier: 0 },
    ttlRightSizing: detectTtlRightSizing(events, CARD),
    ttlCrossing: detectTtlCrossing(events),
    spendAnomaly: detectSpendAnomaly(metrics),
    card: CARD, generatedAt: new Date("2026-08-10T00:00:00Z"),
  });
  const w = r.warnings.find((x) => x.includes("anomal"));
  expect(w).toBeDefined();
  expect(w).toContain("2026-08-09");
  expect(w).toContain("$100.00");
});

test("flat spend raises no anomaly warning", async () => {
  const r = await build();
  expect(r.warnings.some((w) => w.includes("anomal"))).toBe(false);
});

test("TTL right-sizing events skipped for an unknown model are narrated, not just dropped", () => {
  const base = {
    accountId: "local", projectId: "p", sessionId: "s1", source: "claude_code" as const,
    serviceTier: null, model: "not-a-real-model",
    inputTokens: 0, cacheReadTokens: 0, outputTokens: 0,
    compactionInputTokens: 0, compactionOutputTokens: 0,
  };
  const events = [
    { ...base, idempotencyKey: "u1", ts: "2026-08-01T00:00:00Z",
      cacheCreationTokens: 1000, cacheCreation1hTokens: 1000, cacheCreation5mTokens: 0 },
    { ...base, idempotencyKey: "u2", ts: "2026-08-01T00:02:00Z",
      cacheCreationTokens: 0, cacheCreation1hTokens: 0, cacheCreation5mTokens: 0 },
  ];
  const metrics = computeMetrics(events, CARD); // the model prices nowhere — both events skip
  const a = { targetCacheHitPct: null };
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: { linesSeen: 2, imported: 2, malformed: 0, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
      unknownTtlWrites: 0, thinkingDetailRecords: 2, pages: 0, buckets: 0, unpriceableTier: 0 },
    ttlRightSizing: detectTtlRightSizing(events, CARD),
    ttlCrossing: detectTtlCrossing(events),
    spendAnomaly: detectSpendAnomaly(metrics),
    card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
  expect(r.warnings.some((w) => w.includes("eligible for TTL right-sizing"))).toBe(true);
});

test("events unpriceable for spend-anomaly screening are narrated, not just dropped", () => {
  const events = [{
    idempotencyKey: "z1", accountId: "local", projectId: "p", sessionId: null,
    ts: "2026-08-01T00:00:00Z", source: "claude_code" as const, serviceTier: null,
    model: "not-a-real-model",
    inputTokens: 100, cacheReadTokens: 0, cacheCreationTokens: 0,
    cacheCreation5mTokens: 0, cacheCreation1hTokens: 0, outputTokens: 0,
    compactionInputTokens: 0, compactionOutputTokens: 0,
  }];
  const metrics = computeMetrics(events, CARD);
  const a = { targetCacheHitPct: null };
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: { linesSeen: 1, imported: 1, malformed: 0, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
      unknownTtlWrites: 0, thinkingDetailRecords: 1, pages: 0, buckets: 0, unpriceableTier: 0 },
    ttlRightSizing: detectTtlRightSizing([], CARD), ttlCrossing: detectTtlCrossing([]),
    spendAnomaly: detectSpendAnomaly(metrics),
    card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
  expect(r.warnings.some((w) => w.includes("spend-anomaly check reads"))).toBe(true);
});

test("more than three anomalous days are capped in the warnings, with a count of the rest", () => {
  // Synthesized directly on the finding rather than through real event math: report.ts's
  // cap is a property of the warnings loop (slice(0, 3) plus a summary line), independent
  // of how the anomalies themselves were computed.
  const metrics = computeMetrics([], CARD);
  const a = { targetCacheHitPct: null };
  const anomalies = Array.from({ length: 5 }, (_, i) => ({
    day: `2026-08-0${i + 1}`, microCents: 5_000_000_000, trailingMedianMicroCents: 100_000_000,
  }));
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: { linesSeen: 0, imported: 0, malformed: 0, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
      unknownTtlWrites: 0, thinkingDetailRecords: 0, pages: 0, buckets: 0, unpriceableTier: 0 },
    ttlRightSizing: detectTtlRightSizing([], CARD), ttlCrossing: detectTtlCrossing([]),
    spendAnomaly: { evidence: "PASS_ABSOLUTE", computable: true, days: 12, anomalies, skippedUnpriceable: 0 },
    card: CARD, generatedAt: new Date("2026-08-10T00:00:00Z"),
  });
  expect(r.warnings.filter((w) => w.includes("spend anomaly:")).length).toBe(3);
  expect(r.warnings.some((w) => w.includes("…and 2 more anomalous days"))).toBe(true);
});

test("carries the register coverage table, invisible rows included", async () => {
  const r = await build();
  expect(r.coverage.length).toBeGreaterThanOrEqual(8);
  expect(r.coverage.some((c) => c.status === "invisible")).toBe(true);
});

test("an aggregate source that cannot answer the crossing question says so", () => {
  const r0 = importAdminUsageReport([{
    data: [{ starting_at: "2026-08-01T00:00:00Z", ending_at: "2026-08-02T00:00:00Z", results: [{
      model: "claude-opus-5", workspace_id: "w", account_id: null, service_tier: "standard",
      uncached_input_tokens: 1_000_000, cache_read_input_tokens: 0,
      cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 }, output_tokens: 0,
    }] }], has_more: false, next_page: null,
  }]);
  const metrics = computeMetrics(r0.events, CARD);
  const a = { targetCacheHitPct: null };
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: { linesSeen: 1, imported: 1, malformed: 0, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
      unknownTtlWrites: 0, thinkingDetailRecords: 1, pages: 0, buckets: 0, unpriceableTier: 0 },
    ttlRightSizing: detectTtlRightSizing(r0.events, CARD),
    ttlCrossing: detectTtlCrossing(r0.events),
    spendAnomaly: detectSpendAnomaly(metrics),
    card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
  // One day of history and no sessions: BOTH unanswerable checks must say so out loud.
  expect(r.warnings.some((w) => w.includes("billing-crossing check"))).toBe(true);
  expect(r.warnings.some((w) => w.includes("day-spike screening"))).toBe(true);
});

test("sessioned sources with enough history carry neither cannot-check warning", () => {
  // Control: nine days of sessioned traffic answers both questions, so neither warning fires.
  const base = {
    accountId: "local", projectId: "p", source: "claude_code" as const,
    serviceTier: null, model: "claude-opus-5",
    inputTokens: 2_000_000, cacheReadTokens: 0, cacheCreationTokens: 0,
    cacheCreation5mTokens: 0, cacheCreation1hTokens: 0, outputTokens: 0,
    compactionInputTokens: 0, compactionOutputTokens: 0,
  };
  const events = Array.from({ length: 9 }, (_, i) => ({
    ...base, idempotencyKey: `d${i}`, sessionId: `s${i}`, ts: `2026-08-0${i + 1}T12:00:00Z`,
  }));
  const metrics = computeMetrics(events, CARD);
  const a = { targetCacheHitPct: null };
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: { linesSeen: 9, imported: 9, malformed: 0, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
      unknownTtlWrites: 0, thinkingDetailRecords: 9, pages: 0, buckets: 0, unpriceableTier: 0 },
    ttlRightSizing: detectTtlRightSizing(events, CARD),
    ttlCrossing: detectTtlCrossing(events),
    spendAnomaly: detectSpendAnomaly(metrics),
    card: CARD, generatedAt: new Date("2026-08-10T00:00:00Z"),
  });
  expect(r.warnings.some((w) => w.includes("billing-crossing check"))).toBe(false);
  expect(r.warnings.some((w) => w.includes("day-spike screening"))).toBe(false);
});

test("a tiny standard spend that rounds to a $0 batch saving is not 'no standard traffic'", () => {
  // A 5% share of one fresh input token rounds to zero tokens moved, so the saving is $0 —
  // but standard traffic exists, and the no-traffic warning must not lie about why the
  // number is small.
  const events = [{
    idempotencyKey: "k1", accountId: "local", projectId: "p", sessionId: null,
    ts: "2026-08-01T00:00:00Z",
    source: "claude_code" as const, serviceTier: null, model: "claude-opus-5",
    inputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0,
    cacheCreation5mTokens: 0, cacheCreation1hTokens: 0, outputTokens: 0,
    compactionInputTokens: 0, compactionOutputTokens: 0,
  }];
  const metrics = computeMetrics(events, CARD);
  const a = { targetCacheHitPct: null, batchShareTargetPct: 5 };
  const r = buildReport({
    metrics, simulation: simulate(metrics, CARD, a), assumptions: a,
    provenance: { linesSeen: 1, imported: 1, malformed: 0, deduped: 0, synthesizedKeys: 0,
      skippedNonAssistant: 0, compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
      unknownTtlWrites: 0, thinkingDetailRecords: 1, pages: 0, buckets: 0, unpriceableTier: 0 },
    ttlRightSizing: detectTtlRightSizing([], CARD), ttlCrossing: detectTtlCrossing([]),
    spendAnomaly: detectSpendAnomaly(computeMetrics([], CARD)),
    card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
  expect(r.batchTier!.saved.microCents).toBe(0);
  expect(r.warnings.some((w) => w.includes("no standard-tier traffic"))).toBe(false);
});
