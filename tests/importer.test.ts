import { expect, test } from "bun:test";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { USAGE_EVENT_KEYS } from "../src/types";

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
