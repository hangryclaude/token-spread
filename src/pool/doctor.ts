/**
 * Go-live health checks (runbook §4's dead-man line, made runnable). Pure: the shell
 * gathers file contents and environment facts; this decides. Fatal checks are the ones
 * where proceeding loses money or truth — config, data dir, ledger integrity, heartbeat
 * staleness. Advisory checks (admin key present, plists installed) inform without
 * blocking, because doctor must be safe to run on a machine that holds no key at all.
 */
import { parsePoolConfig } from "./config";
import { parseLedgerJsonl } from "./ledger";

/** The runbook's dead-man line: a heartbeat older than this means the cap is not live. */
const STALE_AFTER_SECONDS = 10 * 60;

export interface DoctorCheck {
  name: string;
  ok: boolean;
  fatal: boolean;
  detail: string;
}

export interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
}

export function doctorReport(deps: {
  configText: string | null;
  dataDirWritable: boolean;
  ledgerText: string;
  healthText: string | null;
  adminKeySet: boolean;
  plistsPresent: boolean;
  nowIso: string;
}): DoctorResult {
  const checks: DoctorCheck[] = [];

  if (deps.configText === null) {
    checks.push({ name: "config", ok: false, fatal: true, detail: "config file unreadable" });
  } else {
    let parsed: ReturnType<typeof parsePoolConfig> | null = null;
    try {
      parsed = parsePoolConfig(JSON.parse(deps.configText));
    } catch {
      checks.push({ name: "config", ok: false, fatal: true, detail: "not valid JSON" });
    }
    if (parsed !== null) {
      checks.push(parsed.config !== null
        ? { name: "config", ok: true, fatal: true, detail: `${parsed.config.members.length} member(s)` }
        : { name: "config", ok: false, fatal: true, detail: parsed.problems.join("; ") });
    }
  }

  checks.push(deps.dataDirWritable
    ? { name: "data-dir", ok: true, fatal: true, detail: "writable" }
    : { name: "data-dir", ok: false, fatal: true, detail: "not writable — the ledger cannot append" });

  const ledger = parseLedgerJsonl(deps.ledgerText.split("\n"));
  checks.push(ledger.malformed === 0
    ? { name: "ledger", ok: true, fatal: true, detail: `${ledger.state.rows.length} row(s), clean` }
    : {
        name: "ledger", ok: false, fatal: true,
        detail: `${ledger.malformed} malformed line(s) — restore from raw/ before going further`,
      });

  if (deps.healthText === null) {
    // Pre-live is a legitimate state; the heartbeat only binds once it has ever beaten.
    checks.push({ name: "health", ok: true, fatal: true, detail: "never polled yet (pre-live)" });
  } else {
    let ageSeconds: number | null = null;
    try {
      const lastPollAt = JSON.parse(deps.healthText)?.lastPollAt;
      const age = (Date.parse(deps.nowIso) - Date.parse(lastPollAt)) / 1000;
      ageSeconds = Number.isFinite(age) ? Math.round(age) : null;
    } catch { /* fall through to unreadable */ }
    if (ageSeconds === null) {
      checks.push({ name: "health", ok: false, fatal: true, detail: "health.json unreadable" });
    } else if (ageSeconds > STALE_AFTER_SECONDS) {
      checks.push({
        name: "health", ok: false, fatal: true,
        detail: `heartbeat stale: last poll ${ageSeconds}s ago — the cap is NOT live; only Console spend limits stand`,
      });
    } else {
      checks.push({ name: "health", ok: true, fatal: true, detail: `last poll ${ageSeconds}s ago` });
    }
  }

  checks.push(deps.adminKeySet
    ? { name: "admin-key", ok: true, fatal: false, detail: "present in environment" }
    : { name: "admin-key", ok: false, fatal: false, detail: "not set — poll/reconcile/provision will refuse" });

  checks.push(deps.plistsPresent
    ? { name: "launchd", ok: true, fatal: false, detail: "plists installed" }
    : { name: "launchd", ok: true, fatal: false, detail: "plists not installed — scheduling is manual until they are" });

  return { ok: checks.every((c) => c.ok || !c.fatal), checks };
}
