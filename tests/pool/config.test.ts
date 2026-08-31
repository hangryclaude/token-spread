import { expect, test } from "bun:test";
import {
  parsePoolConfig,
  workspaceToMember,
  memberToWorkspace,
  memberById,
  EXAMPLE_POOL_CONFIG,
} from "../../src/pool/config";

function minimalJson() {
  return {
    members: [{ id: "angus", workspaceId: "ws-angus", apiKeyId: "apikey_01aaa" }],
  };
}

test("parses a minimal valid config and applies documented defaults", () => {
  const { config, problems } = parsePoolConfig(minimalJson());
  expect(problems).toEqual([]);
  expect(config).not.toBeNull();
  expect(config!.members).toEqual([
    { id: "angus", workspaceId: "ws-angus", apiKeyId: "apikey_01aaa" },
  ]);
  // Defaults pinned by spec §5 / §6: [50, 80, 95] alert thresholds, 7-day lookback,
  // 7-minute exposure window, a 1-cent floor, 1000 ppm (0.1%) tolerance. One cent is
  // 1,000,000 micro-cents (microCentsToCents divides by 1e6) — 10,000 would be 0.01¢,
  // a floor 100x tighter than the spec and guaranteed to page on rounding dust.
  expect(config!.alertThresholdPcts).toEqual([50, 80, 95]);
  expect(config!.exposureWindowMinutes).toBe(7);
  expect(config!.burnLookbackDays).toBe(7);
  expect(config!.toleranceFloorMicroCents).toBe(1_000_000);
  expect(config!.tolerancePpm).toBe(1000);
});

test("rejects a non-object payload and reports a problem, never throws", () => {
  for (const bad of [null, "oops", 42, [], undefined]) {
    const { config, problems } = parsePoolConfig(bad);
    expect(config).toBeNull();
    expect(problems.length).toBeGreaterThan(0);
  }
});

test("rejects an empty members array", () => {
  const { config, problems } = parsePoolConfig({ members: [] });
  expect(config).toBeNull();
  expect(problems.some((p) => p.includes("members"))).toBe(true);
});

test("rejects a member missing a required field", () => {
  const { config, problems } = parsePoolConfig({
    members: [{ id: "angus", workspaceId: "" }],
  });
  expect(config).toBeNull();
  // Both the empty workspaceId and the missing apiKeyId are named, not just the first.
  expect(problems.some((p) => p.includes("workspaceId"))).toBe(true);
  expect(problems.some((p) => p.includes("apiKeyId"))).toBe(true);
});

test("rejects a member id that is not lowercase kebab-case", () => {
  const { config, problems } = parsePoolConfig({
    members: [{ id: "Angus_1", workspaceId: "ws-a", apiKeyId: "apikey_01aaa" }],
  });
  expect(config).toBeNull();
  expect(problems.some((p) => p.includes("id") && p.includes("kebab"))).toBe(true);
});

test("names the sk-ant- mistake: a secret key pasted where the Admin API key id belongs", () => {
  const { config, problems } = parsePoolConfig({
    members: [{ id: "angus", workspaceId: "ws-a", apiKeyId: "sk-ant-api03-abc123" }],
  });
  expect(config).toBeNull();
  const p = problems.find((p) => p.includes("apikey_"));
  expect(p).toBeDefined();
  expect(p).toMatch(/sk-ant-/);
});

test("catches a duplicate workspaceId and says attribution would merge two members", () => {
  const { config, problems } = parsePoolConfig({
    members: [
      { id: "angus", workspaceId: "ws-shared", apiKeyId: "apikey_01aaa" },
      { id: "friend-one", workspaceId: "ws-shared", apiKeyId: "apikey_02bbb" },
    ],
  });
  expect(config).toBeNull();
  const p = problems.find((p) => p.includes("workspaceId") && p.includes("ws-shared"));
  expect(p).toBeDefined();
  expect(p).toMatch(/attribut/i);
});

test("catches duplicate ids and duplicate apiKeyIds too", () => {
  const { config, problems } = parsePoolConfig({
    members: [
      { id: "angus", workspaceId: "ws-a", apiKeyId: "apikey_01aaa" },
      { id: "angus", workspaceId: "ws-b", apiKeyId: "apikey_01aaa" },
    ],
  });
  expect(config).toBeNull();
  expect(problems.some((p) => p.includes("id") && p.includes("angus"))).toBe(true);
  expect(problems.some((p) => p.includes("apiKeyId") && p.includes("apikey_01aaa"))).toBe(true);
});

test("collects every problem in a single pass, not just the first", () => {
  const { config, problems } = parsePoolConfig({
    members: [
      { id: "Bad Id", workspaceId: "ws-shared", apiKeyId: "sk-ant-oops" },
      { id: "ok-member", workspaceId: "ws-shared", apiKeyId: "apikey_02bbb" },
    ],
  });
  expect(config).toBeNull();
  // At least: bad-kebab id, sk-ant- apiKeyId, and duplicate workspaceId.
  expect(problems.length).toBeGreaterThanOrEqual(3);
});

test("rejects out-of-order alert thresholds and falls back to the default", () => {
  const { config, problems } = parsePoolConfig({
    ...minimalJson(),
    alertThresholdPcts: [80, 50, 95],
  });
  expect(config).toBeNull();
  expect(problems.some((p) => p.includes("alertThresholdPcts"))).toBe(true);
});

test("rejects thresholds outside 1..99", () => {
  const { config, problems } = parsePoolConfig({
    ...minimalJson(),
    alertThresholdPcts: [0, 50, 100],
  });
  expect(config).toBeNull();
  expect(problems.some((p) => p.includes("alertThresholdPcts"))).toBe(true);
});

test("accepts custom thresholds and non-default numeric options", () => {
  const { config, problems } = parsePoolConfig({
    ...minimalJson(),
    alertThresholdPcts: [25, 90],
    exposureWindowMinutes: 10,
    burnLookbackDays: 14,
    toleranceFloorMicroCents: 5_000,
    tolerancePpm: 500,
  });
  expect(problems).toEqual([]);
  expect(config!.alertThresholdPcts).toEqual([25, 90]);
  expect(config!.exposureWindowMinutes).toBe(10);
  expect(config!.burnLookbackDays).toBe(14);
  expect(config!.toleranceFloorMicroCents).toBe(5_000);
  expect(config!.tolerancePpm).toBe(500);
});

test("round-trips EXAMPLE_POOL_CONFIG through JSON unchanged", () => {
  const { config, problems } = parsePoolConfig(JSON.parse(JSON.stringify(EXAMPLE_POOL_CONFIG)));
  expect(problems).toEqual([]);
  expect(config).toEqual(EXAMPLE_POOL_CONFIG);
});

test("workspaceToMember and memberToWorkspace invert each other for the example config", () => {
  const w2m = workspaceToMember(EXAMPLE_POOL_CONFIG);
  const m2w = memberToWorkspace(EXAMPLE_POOL_CONFIG);
  expect(w2m.get("ws-angus")).toBe("angus");
  expect(w2m.get("ws-friend-one")).toBe("friend-one");
  expect(m2w.get("angus")).toBe("ws-angus");
  expect(w2m.size).toBe(3);
  expect(m2w.size).toBe(3);
});

test("memberById finds a member by id and returns null for an unknown id", () => {
  expect(memberById(EXAMPLE_POOL_CONFIG, "friend-two")?.workspaceId).toBe("ws-friend-two");
  expect(memberById(EXAMPLE_POOL_CONFIG, "nobody")).toBeNull();
});
