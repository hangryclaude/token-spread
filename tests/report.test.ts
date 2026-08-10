import { expect, test } from "bun:test";
import { detectTtlRightSizing } from "../src/detect/ttlRightSizing";
import { buildReport } from "../src/report";
import { computeMetrics } from "../src/metrics";
import { simulate } from "../src/simulate";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";

const A = { targetCacheHitPct: 90 };

async function build(generatedAt = new Date("2026-08-08T00:00:00Z")) {
  const text = await Bun.file(`${import.meta.dir}/../fixtures/mixed.jsonl`).text();
  const imported = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId: "demo" });
  const metrics = computeMetrics(imported.events, CARD);
  const simulation = simulate(metrics, CARD, A);
  return buildReport({ metrics, simulation, assumptions: A, provenance: imported.provenance,
    ttlRightSizing: detectTtlRightSizing([], CARD), card: CARD, generatedAt });
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
    ttlRightSizing: detectTtlRightSizing([], CARD),
    card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
  });
  expect(agrees.warnings.some((w) => w.includes("write overhead"))).toBe(false);

  const diverges = buildReport({
    metrics, simulation: simulate(metrics, CARD, { ...A, cacheWriteOverheadPct: 40 }),
    assumptions: { ...A, cacheWriteOverheadPct: 40 }, provenance: imported.provenance,
    ttlRightSizing: detectTtlRightSizing([], CARD),
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
    ttlRightSizing: detectTtlRightSizing([], CARD), card: CARD, generatedAt: new Date("2026-08-08T00:00:00Z"),
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
