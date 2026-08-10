import { expect, test } from "bun:test";
import { costOfEvent } from "../src/pricing";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { computeMetrics } from "../src/metrics";

// §9.2 — no float anywhere in the pricing path
test("costOfEvent returns an integer for every rate-card model", () => {
  for (const model of Object.keys(CARD.rates)) {
    const r = costOfEvent({
      idempotencyKey: "k", accountId: "a", projectId: "p", ts: "2026-08-01T00:00:00Z",
      sessionId: null, source: "claude_code", model,
      inputTokens: 12_345, cacheReadTokens: 6_789, cacheCreationTokens: 101, outputTokens: 2_345,
      cacheCreation5mTokens: 101, cacheCreation1hTokens: 0,
      compactionInputTokens: 0, compactionOutputTokens: 0,
    }, CARD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number.isInteger(r.microCents)).toBe(true);
  }
});

// §9.11 — importer A never opens a socket
test("the local importer completes with the network disabled", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("network access attempted"); }) as unknown as typeof fetch;
  try {
    const text = await Bun.file(`${import.meta.dir}/../fixtures/mixed.jsonl`).text();
    const r = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId: "demo" });
    expect(r.events.length).toBe(2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// §9.7 — attribution is always populated
test("every priced event has a non-empty accountId and projectId", async () => {
  const text = await Bun.file(`${import.meta.dir}/../fixtures/mixed.jsonl`).text();
  const { events } = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId: "demo" });
  for (const e of events) {
    expect(e.accountId.length).toBeGreaterThan(0);
    expect(e.projectId.length).toBeGreaterThan(0);
  }
  const m = computeMetrics(events, CARD);
  expect(Object.values(m.byProject).reduce((a, t) => a + t.microCents, 0)).toBe(m.overall.microCents);
});
