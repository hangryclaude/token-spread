/**
 * Pool configuration parsing (spec §3). The member <-> workspace <-> API-key mapping
 * is config, not code — a bad mapping mis-bills a human, so this is total (never
 * throws on data) and strict (every problem is reported, not just the first).
 */

import type { PoolConfig, PoolMember } from "./types";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DEFAULT_ALERT_THRESHOLD_PCTS = [50, 80, 95];
const DEFAULT_EXPOSURE_WINDOW_MINUTES = 7;
const DEFAULT_BURN_LOOKBACK_DAYS = 7;
// One cent. microCentsToCents divides by 1e6, so 10_000 here would be 0.01¢ —
// a floor 100x tighter than spec §6's "1¢ + 0.1%" and a pager that never sleeps.
const DEFAULT_TOLERANCE_FLOOR_MICRO_CENTS = 1_000_000;
const DEFAULT_TOLERANCE_PPM = 1000;

export function parsePoolConfig(json: unknown): { config: PoolConfig | null; problems: string[] } {
  const problems: string[] = [];

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { config: null, problems: ["config must be a JSON object"] };
  }
  const obj = json as Record<string, unknown>;

  const members = parseMembers(obj.members, problems);

  const alertThresholdPcts = parseAlertThresholdPcts(obj.alertThresholdPcts, problems);
  const exposureWindowMinutes = parsePositiveInt(
    obj.exposureWindowMinutes, "exposureWindowMinutes", DEFAULT_EXPOSURE_WINDOW_MINUTES, problems,
  );
  const burnLookbackDays = parsePositiveInt(
    obj.burnLookbackDays, "burnLookbackDays", DEFAULT_BURN_LOOKBACK_DAYS, problems,
  );
  const toleranceFloorMicroCents = parsePositiveInt(
    obj.toleranceFloorMicroCents, "toleranceFloorMicroCents", DEFAULT_TOLERANCE_FLOOR_MICRO_CENTS, problems,
  );
  const tolerancePpm = parsePositiveInt(
    obj.tolerancePpm, "tolerancePpm", DEFAULT_TOLERANCE_PPM, problems,
  );

  if (problems.length > 0 || !members) return { config: null, problems };

  const config: PoolConfig = {
    members,
    alertThresholdPcts,
    exposureWindowMinutes,
    burnLookbackDays,
    toleranceFloorMicroCents,
    tolerancePpm,
  };
  return { config, problems: [] };
}

/**
 * Members must be validated as a whole set (uniqueness), not one at a time, so this
 * always walks every element and accumulates — a bad third member never hides a bad
 * first one.
 */
function parseMembers(raw: unknown, problems: string[]): PoolMember[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    problems.push("members must be a non-empty array");
    return null;
  }

  const members: PoolMember[] = [];
  const seenIds = new Map<string, number>();
  const seenWorkspaceIds = new Map<string, number>();
  const seenApiKeyIds = new Map<string, number>();
  let anyFieldProblem = false;

  raw.forEach((raw_m, i) => {
    const label = `members[${i}]`;
    if (typeof raw_m !== "object" || raw_m === null) {
      problems.push(`${label} must be an object`);
      anyFieldProblem = true;
      return;
    }
    const m = raw_m as Record<string, unknown>;

    const id = requireNonEmptyString(m.id, `${label}.id`, problems);
    const workspaceId = requireNonEmptyString(m.workspaceId, `${label}.workspaceId`, problems);
    const apiKeyId = requireNonEmptyString(m.apiKeyId, `${label}.apiKeyId`, problems);

    if (id === null || workspaceId === null || apiKeyId === null) {
      anyFieldProblem = true;
      return;
    }

    if (!KEBAB.test(id)) {
      problems.push(`${label}.id "${id}" must be lowercase kebab-case (e.g. "friend-one")`);
      anyFieldProblem = true;
    }

    // The likely mistake is a secret key (sk-ant-...) pasted where the Admin API's
    // apikey_ id belongs — name it, since the field otherwise looks superficially right.
    if (!apiKeyId.startsWith("apikey_")) {
      const hint = apiKeyId.startsWith("sk-ant-")
        ? ` — this looks like a secret key (sk-ant-...), not the Admin API key id`
        : "";
      problems.push(`${label}.apiKeyId "${apiKeyId}" must start with "apikey_" (the Admin API key id)${hint}`);
      anyFieldProblem = true;
    }

    const dupId = seenIds.get(id);
    if (dupId !== undefined) {
      problems.push(`duplicate member id "${id}" (members[${dupId}] and ${label})`);
      anyFieldProblem = true;
    } else {
      seenIds.set(id, i);
    }

    const dupWorkspace = seenWorkspaceIds.get(workspaceId);
    if (dupWorkspace !== undefined) {
      problems.push(
        `duplicate workspaceId "${workspaceId}" (members[${dupWorkspace}] and ${label}) — ` +
        `attribution would silently merge these two members' usage`,
      );
      anyFieldProblem = true;
    } else {
      seenWorkspaceIds.set(workspaceId, i);
    }

    const dupApiKey = seenApiKeyIds.get(apiKeyId);
    if (dupApiKey !== undefined) {
      problems.push(`duplicate apiKeyId "${apiKeyId}" (members[${dupApiKey}] and ${label})`);
      anyFieldProblem = true;
    } else {
      seenApiKeyIds.set(apiKeyId, i);
    }

    members.push({ id, workspaceId, apiKeyId });
  });

  return anyFieldProblem ? null : members;
}

function requireNonEmptyString(v: unknown, label: string, problems: string[]): string | null {
  if (typeof v !== "string" || v.length === 0) {
    problems.push(`${label} must be a non-empty string`);
    return null;
  }
  return v;
}

function parseAlertThresholdPcts(raw: unknown, problems: string[]): number[] {
  if (raw === undefined) return DEFAULT_ALERT_THRESHOLD_PCTS;
  if (!Array.isArray(raw) || raw.length === 0) {
    problems.push("alertThresholdPcts must be a non-empty array of integers");
    return DEFAULT_ALERT_THRESHOLD_PCTS;
  }
  let ok = true;
  for (const v of raw) {
    if (!Number.isInteger(v) || v < 1 || v > 99) {
      problems.push(`alertThresholdPcts values must be integers between 1 and 99, got ${JSON.stringify(v)}`);
      ok = false;
    }
  }
  for (let i = 1; i < raw.length; i++) {
    if (!(raw[i] > raw[i - 1])) {
      problems.push(`alertThresholdPcts must be strictly ascending, got [${raw.join(", ")}]`);
      ok = false;
      break;
    }
  }
  return ok ? (raw as number[]) : DEFAULT_ALERT_THRESHOLD_PCTS;
}

function parsePositiveInt(raw: unknown, label: string, dflt: number, problems: string[]): number {
  if (raw === undefined) return dflt;
  if (!Number.isInteger(raw) || (raw as number) <= 0) {
    problems.push(`${label} must be a positive integer, got ${JSON.stringify(raw)}`);
    return dflt;
  }
  return raw as number;
}

export function workspaceToMember(config: PoolConfig): ReadonlyMap<string, string> {
  return new Map(config.members.map((m) => [m.workspaceId, m.id]));
}

export function memberToWorkspace(config: PoolConfig): ReadonlyMap<string, string> {
  return new Map(config.members.map((m) => [m.id, m.workspaceId]));
}

export function memberById(config: PoolConfig, id: string): PoolMember | null {
  return config.members.find((m) => m.id === id) ?? null;
}

/**
 * A 3-member example pinned by a round-trip test (spec: parsePoolConfig(JSON.parse(
 * JSON.stringify(EXAMPLE_POOL_CONFIG))) must accept it). apikey_ ids are obviously fake.
 */
export const EXAMPLE_POOL_CONFIG: PoolConfig = {
  members: [
    { id: "angus", workspaceId: "ws-angus", apiKeyId: "apikey_01exampleaaaa" },
    { id: "friend-one", workspaceId: "ws-friend-one", apiKeyId: "apikey_01examplebbbb" },
    { id: "friend-two", workspaceId: "ws-friend-two", apiKeyId: "apikey_01examplecccc" },
  ],
  alertThresholdPcts: [50, 80, 95],
  exposureWindowMinutes: 7,
  burnLookbackDays: 7,
  toleranceFloorMicroCents: 10_000,
  tolerancePpm: 1000,
};
