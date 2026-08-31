import { expect, test } from "bun:test";
import { planWorkspaces, matchKeys, workspaceNameFor, fetchAllAdminPages, provision } from "../../src/pool/provision";

test("workspace names are derived, bounded, and collision-proof for legal member ids", () => {
  // Convention pinned here: "pool-" + member id. Member ids are lowercase kebab (config.ts
  // enforces it) and the API caps names at 40 chars, so a 35-char id is the longest legal one.
  expect(workspaceNameFor("angus")).toBe("pool-angus");
  expect(workspaceNameFor("a".repeat(35))).toBe("pool-" + "a".repeat(35));
  expect(() => workspaceNameFor("a".repeat(36))).toThrow(); // would exceed the API's 40-char cap
});

test("planWorkspaces finds existing pool workspaces and plans only the missing ones", () => {
  const existing = [
    { id: "wrkspc_A", name: "pool-angus", archived_at: null },
    { id: "wrkspc_OLD", name: "pool-ghost", archived_at: "2026-01-01T00:00:00Z" }, // archived: unusable
    { id: "wrkspc_X", name: "unrelated", archived_at: null },
  ];
  const { found, create } = planWorkspaces(["angus", "friend-one", "ghost"], existing);
  expect(found.get("angus")).toBe("wrkspc_A");
  // An archived workspace must NOT satisfy a member — new sessions can't use it.
  expect([...create].sort()).toEqual(["friend-one", "ghost"]);
});

test("matchKeys pairs each member with exactly one active workspace-scoped key", () => {
  const byMember = new Map([["angus", "wrkspc_A"], ["friend-one", "wrkspc_B"], ["friend-two", "wrkspc_C"]]);
  const keys = [
    { id: "apikey_1", status: "active", scope: { type: "workspace", workspace_id: "wrkspc_A" } },
    { id: "apikey_2", status: "inactive", scope: { type: "workspace", workspace_id: "wrkspc_B" } }, // dead
    { id: "apikey_3", status: "active", scope: { type: "organization" } },                          // org-wide: never a seat key
    { id: "apikey_4", status: "active", scope: { type: "workspace", workspace_id: "wrkspc_C" } },
    { id: "apikey_5", status: "active", scope: { type: "workspace", workspace_id: "wrkspc_C" } },   // second key: ambiguous
  ];
  const r = matchKeys(byMember, keys);
  expect(r.matched.get("angus")).toBe("apikey_1");
  // friend-one's only key is inactive: missing, not matched — a dead key can't be a seat.
  expect(r.missing).toEqual(["friend-one"]);
  // Two active keys on one workspace is a human mistake to surface, never to auto-pick from:
  // attribution keys on the workspace, but REVOCATION targets the key — guessing kills the wrong one.
  expect(r.ambiguous).toEqual(["friend-two"]);
});

test("fetchAllAdminPages follows the after_id/has_more scheme and sends admin headers", async () => {
  const calls: string[] = [];
  const pages: Record<string, unknown> = {
    "": { data: [{ id: "w1" }, { id: "w2" }], has_more: true, last_id: "w2" },
    "w2": { data: [{ id: "w3" }], has_more: false, last_id: "w3" },
  };
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    calls.push(String((init?.headers as Record<string, string>)["x-api-key"]) + "|" + (u.searchParams.get("after_id") ?? ""));
    return new Response(JSON.stringify(pages[u.searchParams.get("after_id") ?? ""]), { status: 200 });
  }) as unknown as typeof fetch;

  const rows = await fetchAllAdminPages(fetchFn, "https://api.anthropic.com/v1/organizations/workspaces", "sk-ant-admin-test");
  expect(rows.map((r: any) => r.id)).toEqual(["w1", "w2", "w3"]);
  expect(calls).toEqual(["sk-ant-admin-test|", "sk-ant-admin-test|w2"]);
});

test("fetchAllAdminPages throws loudly on a non-2xx page, never half-returns", async () => {
  const fetchFn = (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
  await expect(
    fetchAllAdminPages(fetchFn, "https://api.anthropic.com/v1/organizations/workspaces", "k"),
  ).rejects.toThrow(/403/);
});

function adminStub() {
  // Scripted Admin API: no workspaces yet; creates succeed; the key list carries
  // exactly one active workspace-scoped key per created workspace.
  const calls: { url: string; method: string; body?: unknown }[] = [];
  let created = 0;
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes("/workspaces") && method === "POST") {
      created++;
      return new Response(JSON.stringify({ id: `wrkspc_new_${created}`, name: JSON.parse(String(init!.body)).name }), { status: 200 });
    }
    if (url.includes("/workspaces")) {
      return new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 });
    }
    // api_keys list: one active key per workspace created so far
    const data = Array.from({ length: created }, (_, i) => ({
      id: `apikey_new_${i + 1}`, status: "active",
      scope: { type: "workspace", workspace_id: `wrkspc_new_${i + 1}` },
    }));
    return new Response(JSON.stringify({ data, has_more: false }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test("provision end-to-end: creates missing workspaces and writes a valid pool.json", async () => {
  const { mkdtempSync, readFileSync: rf } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: j } = await import("node:path");
  const dir = mkdtempSync(j(tmpdir(), "ts-pool-prov-"));
  const outPath = j(dir, "pool.json");
  const { fn, calls } = adminStub();
  const logs: string[] = [];
  const r = await provision({ fetchFn: fn, adminKey: "k", memberIds: ["angus", "friend-one"], outPath, log: (l) => logs.push(l) });
  expect(r.created).toEqual(["angus", "friend-one"]);
  expect(r.wrote).toBe(true);
  const config = JSON.parse(rf(outPath, "utf8"));
  // Pairing is by workspace id, not list order luck: angus got wrkspc_new_1 → apikey_new_1.
  expect(config.members).toEqual([
    { id: "angus", workspaceId: "wrkspc_new_1", apiKeyId: "apikey_new_1" },
    { id: "friend-one", workspaceId: "wrkspc_new_2", apiKeyId: "apikey_new_2" },
  ]);
  // And the workspace create bodies used the pool-<member> convention.
  const posts = calls.filter((c) => c.method === "POST").map((c) => (c.body as { name: string }).name);
  expect(posts).toEqual(["pool-angus", "pool-friend-one"]);
});

test("provision with a keyless workspace names the gap and refuses to write pool.json", async () => {
  const { mkdtempSync, existsSync: ex } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: j } = await import("node:path");
  const dir = mkdtempSync(j(tmpdir(), "ts-pool-prov-"));
  const outPath = j(dir, "pool.json");
  // Same stub but the key list is always empty: workspaces exist, keys never clicked out.
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/workspaces") && (init?.method ?? "GET") === "POST") {
      return new Response(JSON.stringify({ id: "wrkspc_x", name: "pool-angus" }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 });
  }) as unknown as typeof fetch;
  const logs: string[] = [];
  const r = await provision({ fetchFn: fn, adminKey: "k", memberIds: ["angus"], outPath, log: (l) => logs.push(l) });
  expect(r.wrote).toBe(false);
  expect(r.missing).toEqual(["angus"]);
  expect(ex(outPath)).toBe(false);
  expect(logs.some((l) => l.includes("MISSING"))).toBe(true);
});
