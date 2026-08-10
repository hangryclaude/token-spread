import { expect, test } from "bun:test";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { USAGE_EVENT_KEYS } from "../src/types";
import { costOfEvent } from "../src/pricing";
import { RATE_CARD_2026_08_08 } from "../src/rates";

const read = (name: string) =>
  Bun.file(`${import.meta.dir}/../fixtures/${name}`).text();

async function lines(name: string) {
  return (await read(name)).split("\n").filter((l) => l.trim() !== "");
}

test("imports only assistant records that carry usage", async () => {
  const r = importClaudeCodeJsonl(await lines("mixed.jsonl"), { projectId: "demo" });
  expect(r.events.length).toBe(2);
  expect(r.provenance.skippedNonAssistant).toBe(1);
});

test("attributes every event to a project and an account", async () => {
  const r = importClaudeCodeJsonl(await lines("mixed.jsonl"), { projectId: "demo" });
  for (const e of r.events) {
    expect(e.projectId).toBe("demo");
    expect(e.accountId).toBe("local");
  }
});

test("namespaces the idempotency key by source", async () => {
  const r = importClaudeCodeJsonl(await lines("mixed.jsonl"), { projectId: "demo" });
  expect(r.events[0].idempotencyKey).toBe("claude_code:req_a");
});

test("carries no key beyond the UsageEvent schema", async () => {
  const r = importClaudeCodeJsonl(await lines("mixed.jsonl"), { projectId: "demo" });
  for (const e of r.events) {
    expect(Object.keys(e).sort()).toEqual([...USAGE_EVENT_KEYS].sort());
  }
});

test("no prompt content survives the import", async () => {
  const r = importClaudeCodeJsonl(await lines("mixed.jsonl"), { projectId: "demo" });
  const dump = JSON.stringify(r);
  for (const canary of ["SECRET_CANARY_ALPHA", "SECRET_CANARY_BETA", "SECRET_CANARY_GAMMA"]) {
    expect(dump).not.toContain(canary);
  }
});

test("drops duplicate idempotency keys and counts them", async () => {
  const r = importClaudeCodeJsonl(await lines("dupes.jsonl"), { projectId: "demo" });
  expect(r.events.length).toBe(1);
  expect(r.provenance.deduped).toBe(1);
});

test("buckets malformed input instead of swallowing it", async () => {
  const r = importClaudeCodeJsonl(await lines("malformed.jsonl"), { projectId: "demo" });
  // negative tokens and the unparseable line and the usage-less record are malformed;
  // the unknown model imports fine here and is rejected later, at pricing.
  expect(r.provenance.malformed).toBe(3);
  expect(r.events.map((e) => e.model)).toEqual(["some-other-model"]);
});

test("synthesizes a key when requestId is absent, and counts it", async () => {
  const r = importClaudeCodeJsonl(await lines("nokey.jsonl"), { projectId: "demo" });
  expect(r.events.length).toBe(1);          // the two identical lines collide, as documented
  expect(r.provenance.deduped).toBe(1);
  expect(r.provenance.synthesizedKeys).toBe(1);
  expect(r.events[0].idempotencyKey.startsWith("syn:")).toBe(true);
});

test("is deterministic", async () => {
  const ls = await lines("mixed.jsonl");
  expect(JSON.stringify(importClaudeCodeJsonl(ls, { projectId: "demo" })))
    .toBe(JSON.stringify(importClaudeCodeJsonl(ls, { projectId: "demo" })));
});

// ── compaction accounting ──────────────────────────────────────────────────────
// Anthropic's documented example: a request whose top-level usage reports 23,000
// input and 1,000 output, while 203,000 input and 4,500 output are actually billed.
// Reading the top level alone under-reports that request by 8.6x.

test("bills the sum of usage.iterations, not the top-level fields", async () => {
  const r = importClaudeCodeJsonl(await lines("compaction.jsonl"), { projectId: "demo" });
  const e = r.events.find((x) => x.idempotencyKey === "claude_code:req_compact_doc")!;
  expect(e.inputTokens).toBe(203_000);          // 180,000 compaction + 23,000 message
  expect(e.outputTokens).toBe(4_500);           //   3,500 compaction +  1,000 message
  expect(e.compactionInputTokens).toBe(180_000);
  expect(e.compactionOutputTokens).toBe(3_500);
});

test("sums cache fields across iterations too", async () => {
  const r = importClaudeCodeJsonl(await lines("compaction.jsonl"), { projectId: "demo" });
  const e = r.events.find((x) => x.idempotencyKey === "claude_code:req_compact_cached")!;
  expect(e.inputTokens).toBe(40_500);
  expect(e.cacheReadTokens).toBe(10_000);
  expect(e.cacheCreationTokens).toBe(300);
  expect(e.outputTokens).toBe(1_100);
  expect(e.compactionInputTokens).toBe(40_000);
});

test("leaves non-compacting requests exactly as they were", async () => {
  const r = importClaudeCodeJsonl(await lines("compaction.jsonl"), { projectId: "demo" });
  for (const key of ["req_no_compact", "req_empty_iterations"]) {
    const e = r.events.find((x) => x.idempotencyKey === `claude_code:${key}`)!;
    expect(e.compactionInputTokens).toBe(0);
    expect(e.compactionOutputTokens).toBe(0);
  }
  const plain = r.events.find((x) => x.idempotencyKey === "claude_code:req_no_compact")!;
  expect(plain.inputTokens).toBe(1_200);
  expect(plain.cacheReadTokens).toBe(4_000);
  // An empty iterations array must fall back to the top level, not to zero.
  const empty = r.events.find((x) => x.idempotencyKey === "claude_code:req_empty_iterations")!;
  expect(empty.inputTokens).toBe(700);
  expect(empty.outputTokens).toBe(150);
});

test("reports the tokens a top-level reader would have missed", async () => {
  const r = importClaudeCodeJsonl(await lines("compaction.jsonl"), { projectId: "demo" });
  expect(r.provenance.compactionEvents).toBe(2);
  expect(r.provenance.hiddenInputTokens).toBe(220_000);   // 180,000 + 40,000
  expect(r.provenance.hiddenOutputTokens).toBe(4_400);    //   3,500 +    900
});

test("buckets a malformed iteration instead of billing a negative", async () => {
  const r = importClaudeCodeJsonl(await lines("compaction.jsonl"), { projectId: "demo" });
  expect(r.events.some((x) => x.idempotencyKey === "claude_code:req_bad_iteration")).toBe(false);
  expect(r.provenance.malformed).toBe(1);
});

test("prices the compaction step as billed, not as reported", async () => {
  // The whole point of the fix: cost must follow the invoice. Opus 5 at $5/MTok in,
  // $25/MTok out => 203,000 * 5 + 4,500 * 25 per million.
  const r = importClaudeCodeJsonl(await lines("compaction.jsonl"), { projectId: "demo" });
  const e = r.events.find((x) => x.idempotencyKey === "claude_code:req_compact_doc")!;
  const priced = costOfEvent(e, RATE_CARD_2026_08_08);
  expect(priced.ok).toBe(true);
  const topLevelOnly = costOfEvent(
    { ...e, inputTokens: 23_000, outputTokens: 1_000, compactionInputTokens: 0, compactionOutputTokens: 0 },
    RATE_CARD_2026_08_08,
  );
  expect(topLevelOnly.ok).toBe(true);
  if (priced.ok && topLevelOnly.ok) {
    expect(priced.microCents).toBeGreaterThan(topLevelOnly.microCents * 5);
  }
});

test("no prompt content survives an import that compacted", async () => {
  const r = importClaudeCodeJsonl(await lines("compaction.jsonl"), { projectId: "demo" });
  const dump = JSON.stringify(r);
  for (const canary of ["DELTA", "EPSILON", "ZETA", "ETA", "THETA"]) {
    expect(dump).not.toContain(`SECRET_CANARY_${canary}`);
  }
});

test("dedups across files when the caller threads a shared seen set", async () => {
  // The CLI calls the importer once per transcript file. Without a shared set, the
  // same requestId in two files is counted twice and inflates the bill.
  const ls = await lines("dupes.jsonl");
  const seen = new Set<string>();
  const a = importClaudeCodeJsonl(ls, { projectId: "demo", seen });
  const b = importClaudeCodeJsonl(ls, { projectId: "demo", seen });
  expect(a.events.length).toBe(1);
  expect(b.events.length).toBe(0);   // every key already seen in file a
  expect(b.provenance.deduped).toBe(2);
});

// ── cache-write TTL ────────────────────────────────────────────────────────────
// usage.cache_creation carries the split, and it is worth 1.25x vs 2x base input on
// every written token. Measured 2026-08-11: 100% of real writes were 1h.

test("reads the TTL split out of usage.cache_creation", async () => {
  const r = importClaudeCodeJsonl(await lines("cache-ttl.jsonl"), { projectId: "demo" });
  const byKey = Object.fromEntries(r.events.map((e) => [e.idempotencyKey, e]));
  const oneHour = byKey["claude_code:req_1h"];
  expect(oneHour.cacheCreation1hTokens).toBe(10_142);
  expect(oneHour.cacheCreation5mTokens).toBe(0);

  const fiveMin = byKey["claude_code:req_5m"];
  expect(fiveMin.cacheCreation5mTokens).toBe(4_000);
  expect(fiveMin.cacheCreation1hTokens).toBe(0);

  const mixed = byKey["claude_code:req_mixed"];
  expect(mixed.cacheCreation5mTokens).toBe(300);
  expect(mixed.cacheCreation1hTokens).toBe(600);
});

test("the split always sums to the reported total", async () => {
  const r = importClaudeCodeJsonl(await lines("cache-ttl.jsonl"), { projectId: "demo" });
  for (const e of r.events) {
    expect(e.cacheCreation5mTokens + e.cacheCreation1hTokens).toBe(e.cacheCreationTokens);
  }
});

test("a write with no reported TTL bills at the cheaper rate and is counted", async () => {
  const r = importClaudeCodeJsonl(await lines("cache-ttl.jsonl"), { projectId: "demo" });
  const e = r.events.find((x) => x.idempotencyKey === "claude_code:req_nosplit")!;
  expect(e.cacheCreation5mTokens).toBe(500);
  expect(e.cacheCreation1hTokens).toBe(0);
  expect(r.provenance.unknownTtlWrites).toBe(500);
});

test("a one-hour write costs more than the same write at five minutes", async () => {
  // The whole point: these must not price the same.
  const r = importClaudeCodeJsonl(await lines("cache-ttl.jsonl"), { projectId: "demo" });
  const byKey = Object.fromEntries(r.events.map((e) => [e.idempotencyKey, e]));
  const asIs = costOfEvent(byKey["claude_code:req_1h"], RATE_CARD_2026_08_08);
  const asFiveMin = costOfEvent(
    { ...byKey["claude_code:req_1h"], cacheCreation5mTokens: 10_142, cacheCreation1hTokens: 0 },
    RATE_CARD_2026_08_08,
  );
  expect(asIs.ok && asFiveMin.ok).toBe(true);
  if (asIs.ok && asFiveMin.ok) {
    expect(asIs.microCents).toBeGreaterThan(asFiveMin.microCents);
    expect(asIs.microCents - asFiveMin.microCents).toBe(10_142 * (1000 - 625));
  }
});
