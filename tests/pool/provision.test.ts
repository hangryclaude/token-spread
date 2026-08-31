import { expect, test } from "bun:test";
import { planWorkspaces, matchKeys, workspaceNameFor, fetchAllAdminPages } from "../../src/pool/provision";

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
