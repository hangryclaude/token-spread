import { expect, test } from "bun:test";
import { doctorReport } from "../../src/pool/doctor";

const GOOD_CONFIG = JSON.stringify({
  members: [{ id: "angus", workspaceId: "ws-a", apiKeyId: "apikey_01a" }],
});
const NOW = "2026-08-31T12:00:00Z";

function base() {
  return {
    configText: GOOD_CONFIG,
    dataDirWritable: true,
    ledgerText: "",
    healthText: null as string | null,
    adminKeySet: true,
    plistsPresent: false,
    nowIso: NOW,
  };
}

function check(r: ReturnType<typeof doctorReport>, name: string) {
  const c = r.checks.find((c) => c.name === name);
  if (!c) throw new Error(`no check named ${name}: ${r.checks.map((c) => c.name).join(", ")}`);
  return c;
}

test("a healthy pre-live setup passes: never-polled and no plists are notes, not failures", () => {
  const r = doctorReport(base());
  expect(r.ok).toBe(true);
  expect(check(r, "health").ok).toBe(true);
  expect(check(r, "health").detail).toContain("never");
  expect(check(r, "launchd").ok).toBe(true);
});

test("an unparseable config is fatal", () => {
  const r = doctorReport({ ...base(), configText: "{nope" });
  expect(r.ok).toBe(false);
  expect(check(r, "config").ok).toBe(false);
});

test("malformed ledger lines are fatal — a poisoned ledger must stop go-live, not warn", () => {
  const r = doctorReport({ ...base(), ledgerText: '{"seq":1,broken\n' });
  expect(r.ok).toBe(false);
  expect(check(r, "ledger").ok).toBe(false);
});

test("a stale heartbeat is fatal once polling has ever happened", () => {
  // lastPollAt 11 minutes before now — past the runbook's 10-minute dead-man line.
  const health = JSON.stringify({ lastPollAt: "2026-08-31T11:49:00Z", appended: 0, deduped: 0, unattributed: 0, unpriced: 0 });
  const r = doctorReport({ ...base(), healthText: health });
  expect(r.ok).toBe(false);
  expect(check(r, "health").ok).toBe(false);
  expect(check(r, "health").detail).toContain("stale");
});

test("a fresh heartbeat passes and reports its age", () => {
  const health = JSON.stringify({ lastPollAt: "2026-08-31T11:58:30Z", appended: 2, deduped: 0, unattributed: 0, unpriced: 0 });
  const r = doctorReport({ ...base(), healthText: health });
  expect(check(r, "health").ok).toBe(true);
  expect(check(r, "health").detail).toContain("90s");
});

test("a missing admin key is a warning, never fatal — doctor must run keyless", () => {
  const r = doctorReport({ ...base(), adminKeySet: false });
  expect(r.ok).toBe(true);
  expect(check(r, "admin-key").ok).toBe(false);
  expect(check(r, "admin-key").fatal).toBe(false);
});
