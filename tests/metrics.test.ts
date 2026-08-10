import { expect, test } from "bun:test";
import { computeMetrics } from "../src/metrics";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import { microCentsToCents, formatCents } from "../src/pricing";
import type { UsageEvent } from "../src/types";

async function fixture(name: string, projectId = "demo") {
  const text = await Bun.file(`${import.meta.dir}/../fixtures/${name}`).text();
  return importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId }).events;
}

let evCounter = 0;
function ev(over: Partial<UsageEvent>): UsageEvent {
  return {
    idempotencyKey: `k${evCounter++}`, accountId: "local", projectId: "p",
    ts: "2026-08-01T00:00:00Z", sessionId: null, source: "claude_code", model: "claude-opus-5",
    inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0,
    cacheCreation5mTokens: 0, cacheCreation1hTokens: 0,
    compactionInputTokens: 0, compactionOutputTokens: 0,
    ...over,
    // A caller that sets only the total means "whatever TTL"; bill it at the cheaper
    // 5m rate so the fixture balances, exactly as the importer does for such sources.
    ...(over.cacheCreationTokens !== undefined
        && over.cacheCreation5mTokens === undefined
        && over.cacheCreation1hTokens === undefined
        ? { cacheCreation5mTokens: over.cacheCreationTokens }
        : {}),
  };
}

test("current cost matches the hand-computed total exactly", async () => {
  const m = computeMetrics(await fixture("mixed.jsonl"), CARD);
  // $279.75 opus + $37.30 haiku, computed by hand in the spec
  expect(formatCents(microCentsToCents(m.overall.microCents))).toBe("$317.05");
});

test("splits by model", async () => {
  const m = computeMetrics(await fixture("mixed.jsonl"), CARD);
  expect(formatCents(microCentsToCents(m.byModel["claude-opus-5"].microCents))).toBe("$279.75");
  expect(formatCents(microCentsToCents(m.byModel["claude-haiku-4-5"].microCents))).toBe("$37.30");
});

test("by-project totals sum to the overall total", async () => {
  const events = [...(await fixture("mixed.jsonl", "alpha")), ...(await fixture("dupes.jsonl", "beta"))];
  const m = computeMetrics(events, CARD);
  const summed = Object.values(m.byProject).reduce((a, t) => a + t.microCents, 0);
  expect(summed).toBe(m.overall.microCents);
  expect(Object.keys(m.byProject).sort()).toEqual(["alpha", "beta"]);
});

test("cache-hit rate is read / (read + fresh input)", () => {
  const m = computeMetrics([ev({ inputTokens: 30, cacheReadTokens: 70, cacheCreationTokens: 999 })], CARD);
  expect(m.cacheHitRate).toBeCloseTo(0.7, 10); // cacheCreation excluded from the denominator
});

test("cache-hit rate is 0 with no cache reads and 1 with only cache reads", () => {
  expect(computeMetrics([ev({ inputTokens: 100 })], CARD).cacheHitRate).toBe(0);
  expect(computeMetrics([ev({ cacheReadTokens: 100 })], CARD).cacheHitRate).toBe(1);
});

test("cache-hit rate is 0, not NaN, when there is no eligible input", () => {
  expect(computeMetrics([ev({ outputTokens: 5 })], CARD).cacheHitRate).toBe(0);
});

test("unpriceable events are bucketed and excluded from cost", async () => {
  const m = computeMetrics(await fixture("malformed.jsonl"), CARD);
  expect(m.skipped.unknown_model).toBe(1);
  expect(m.overall.microCents).toBe(0);
});

test("names the unknown models rather than only counting them", () => {
  const m = computeMetrics([
    ev({ model: "some-other-model" }),
    ev({ model: "<synthetic>" }),
    ev({ model: "some-other-model" }),
  ], CARD);
  expect(m.skipped.unknown_model).toBe(3);
  expect(m.unknownModels).toEqual(["<synthetic>", "some-other-model"]); // deduped, sorted
});

test("aggregates by account, and account totals sum to the overall total", async () => {
  const events = [
    ...(await fixture("mixed.jsonl", "alpha")).map((e) => ({ ...e, accountId: "acct_a" })),
    ...(await fixture("dupes.jsonl", "beta")).map((e) => ({ ...e, accountId: "acct_b" })),
  ];
  const m = computeMetrics(events, CARD);
  expect(Object.keys(m.byAccount).sort()).toEqual(["acct_a", "acct_b"]);
  expect(Object.values(m.byAccount).reduce((a, t) => a + t.microCents, 0)).toBe(m.overall.microCents);
});
