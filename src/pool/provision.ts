/**
 * Provisioning: turn a member list into workspaces and a pool.json (spec §3).
 *
 * What the Admin API allows draws the boundary here: workspaces CAN be created
 * programmatically (POST /v1/organizations/workspaces); API keys CANNOT — they are
 * minted in the Console by a human. So this tool creates the workspaces, then reads
 * the key list back and tells the operator exactly which workspaces still need a key
 * clicked out. It never creates, rotates, or deactivates anything but workspaces.
 *
 * The admin key comes ONLY from the environment — never an argv, never a file this
 * tool writes — so it can't end up in shell history or a committed config.
 */
import { writeFileSync } from "node:fs";

const API = "https://api.anthropic.com";

/** "pool-" + member id. config.ts pins ids to lowercase kebab; the API caps names at 40. */
export function workspaceNameFor(memberId: string): string {
  const name = "pool-" + memberId;
  if (name.length > 40) {
    throw new Error(`member id "${memberId}" would need a ${name.length}-char workspace name; the API caps at 40`);
  }
  return name;
}

/**
 * Admin list endpoints page with after_id/has_more/last_id — a different scheme from
 * the usage report's next_page cursor, which is why poller.ts's pager is not reused.
 */
export async function fetchAllAdminPages(
  fetchFn: typeof fetch,
  url: string,
  adminKey: string,
  opts: { maxPages?: number } = {},
): Promise<any[]> {
  const maxPages = opts.maxPages ?? 50;
  const rows: any[] = [];
  let afterId: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const u = new URL(url);
    u.searchParams.set("limit", "100");
    if (afterId !== null) u.searchParams.set("after_id", afterId);
    const res = await fetchFn(u.toString(), {
      headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`admin list ${u.pathname} returned ${res.status}: ${body}`);
    }
    const json: any = await res.json();
    rows.push(...(json?.data ?? []));
    if (!json?.has_more) return rows;
    afterId = json?.last_id ?? null;
    if (afterId === null) return rows; // has_more with no cursor: stop rather than loop
  }
  throw new Error(`admin list ${url} exceeded ${maxPages} pages; refusing to spin`);
}

/** Which members already have a live pool workspace, and which need one created. */
export function planWorkspaces(
  memberIds: readonly string[],
  existing: readonly { id: string; name: string; archived_at: string | null }[],
): { found: Map<string, string>; create: string[] } {
  const live = new Map(
    existing.filter((w) => w.archived_at === null).map((w) => [w.name, w.id]),
  );
  const found = new Map<string, string>();
  const create: string[] = [];
  for (const m of memberIds) {
    const id = live.get(workspaceNameFor(m));
    if (id !== undefined) found.set(m, id);
    else create.push(m);
  }
  return { found, create };
}

/**
 * Pair each member's workspace with exactly one active workspace-scoped key.
 * Zero keys → missing (the Console step hasn't happened). Two or more → ambiguous:
 * revocation targets the key, and guessing between two live keys kills the wrong one,
 * so a human resolves it — this tool only names the problem.
 */
export function matchKeys(
  byMember: ReadonlyMap<string, string>,
  keys: readonly { id: string; status: string; scope: { type: string; workspace_id?: string } | null }[],
): { matched: Map<string, string>; missing: string[]; ambiguous: string[] } {
  const activeByWorkspace = new Map<string, string[]>();
  for (const k of keys) {
    if (k.status !== "active") continue;
    if (k.scope?.type !== "workspace" || !k.scope.workspace_id) continue;
    const list = activeByWorkspace.get(k.scope.workspace_id) ?? [];
    list.push(k.id);
    activeByWorkspace.set(k.scope.workspace_id, list);
  }
  const matched = new Map<string, string>();
  const missing: string[] = [];
  const ambiguous: string[] = [];
  for (const [memberId, workspaceId] of byMember) {
    const found = activeByWorkspace.get(workspaceId) ?? [];
    if (found.length === 1) matched.set(memberId, found[0]);
    else if (found.length === 0) missing.push(memberId);
    else ambiguous.push(memberId);
  }
  return { matched, missing, ambiguous };
}

async function createWorkspace(fetchFn: typeof fetch, adminKey: string, name: string): Promise<string> {
  const res = await fetchFn(`${API}/v1/organizations/workspaces`, {
    method: "POST",
    headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`create workspace "${name}" returned ${res.status}: ${body}`);
  }
  const json: any = await res.json();
  if (typeof json?.id !== "string") throw new Error(`create workspace "${name}": response carried no id`);
  return json.id;
}

/** One idempotent pass: ensure workspaces, read keys, emit pool.json or name the gaps. */
export async function provision(deps: {
  fetchFn: typeof fetch;
  adminKey: string;
  memberIds: readonly string[];
  outPath: string;
  log: (line: string) => void;
}): Promise<{ created: string[]; missing: string[]; ambiguous: string[]; wrote: boolean }> {
  const { fetchFn, adminKey, memberIds, outPath, log } = deps;

  const workspaces = await fetchAllAdminPages(fetchFn, `${API}/v1/organizations/workspaces`, adminKey);
  const plan = planWorkspaces(memberIds, workspaces);
  for (const [m, id] of plan.found) log(`found    ${workspaceNameFor(m)} = ${id}`);

  const created: string[] = [];
  for (const m of plan.create) {
    const id = await createWorkspace(fetchFn, adminKey, workspaceNameFor(m));
    plan.found.set(m, id);
    created.push(m);
    log(`created  ${workspaceNameFor(m)} = ${id}`);
  }

  const keys = await fetchAllAdminPages(fetchFn, `${API}/v1/organizations/api_keys`, adminKey);
  const km = matchKeys(plan.found, keys);
  for (const m of km.missing) {
    log(`MISSING  ${m}: no active key in ${workspaceNameFor(m)} — create one in Console → API keys, scoped to that workspace`);
  }
  for (const m of km.ambiguous) {
    log(`AMBIGUOUS ${m}: more than one active key in ${workspaceNameFor(m)} — deactivate the extras in Console, then re-run`);
  }

  const complete = km.missing.length === 0 && km.ambiguous.length === 0;
  if (complete) {
    const config = {
      members: memberIds.map((id) => ({
        id,
        workspaceId: plan.found.get(id)!,
        apiKeyId: km.matched.get(id)!,
      })),
    };
    writeFileSync(outPath, JSON.stringify(config, null, 2) + "\n");
    log(`wrote ${outPath} — ${memberIds.length} seats, ready for \`pool credit\` and \`pool poll\``);
  } else {
    log(`pool.json NOT written — resolve the lines above and re-run (safe to repeat; nothing is duplicated)`);
  }
  return { created, missing: km.missing, ambiguous: km.ambiguous, wrote: complete };
}

/* ---------------------------- CLI ---------------------------- */

function usage(): never {
  console.log(`token-spread pool provisioning — workspaces via Admin API, keys stay human.

usage:
  bun run src/pool/provision.ts --members angus,friend-one,friend-two [--out pool.json]

The Admin key is read from ANTHROPIC_ADMIN_KEY (never a flag). Workspaces are created
as pool-<member>; API keys cannot be created by API — the tool lists what exists and
tells you which workspaces still need a key clicked out in the Console.
Safe to re-run: existing workspaces are found, not duplicated.`);
  process.exit(1);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const memberArg = args[args.indexOf("--members") + 1];
  if (!args.includes("--members") || !memberArg) usage();
  const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : "pool.json";
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) {
    console.error("ANTHROPIC_ADMIN_KEY is not set. Put it in the environment (see docs/ops/RUNBOOK-pool.md) — never in a flag or a file.");
    process.exit(1);
  }
  const memberIds = memberArg.split(",").map((s) => s.trim()).filter(Boolean);
  // Same shape config.ts enforces — fail here, before any workspace is created.
  const bad = memberIds.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id));
  if (memberIds.length === 0 || bad.length > 0) {
    console.error(`member ids must be lowercase kebab; bad: ${bad.join(", ") || "(none given)"}`);
    process.exit(1);
  }
  const r = await provision({ fetchFn: fetch, adminKey, memberIds, outPath, log: (l) => console.log(l) });
  process.exit(r.wrote ? 0 : 2);
}
