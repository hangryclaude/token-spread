/**
 * Slice 2 — the pool ledger. Data contracts only; behavior lives in the sibling modules.
 * Design: docs/specs/2026-08-30-pool-ledger-design.md. Slice 1's frozen boundary
 * (UsageEvent, RateCard, costOfEvent) is imported unchanged — editing it to serve this
 * slice is a design-review signal, not a patch (architecture.md §3).
 *
 * Money is signed integer micro-cents everywhere: credits positive, usage negative.
 * No floats touch a balance. Clocks are injected — nothing in src/pool reads Date.now().
 */

/**
 * One seat. Attribution keys on the workspace (spec §3: one workspace per member, and
 * the admin importer already lands workspace_id in UsageEvent.projectId — the boundary
 * stays closed). The API key id is carried for one purpose only: it is the thing the
 * hard cap deactivates.
 */
export interface PoolMember {
  id: string;
  /** Attribution unit — matches UsageEvent.projectId ("default" for the default workspace). */
  workspaceId: string;
  /** Revocation target: Admin API `apikey_…` id, set inactive at the hard cap (spec §5). */
  apiKeyId: string;
}

export interface PoolConfig {
  members: PoolMember[];
  /** Consumed-share alert thresholds, percent of lifetime credits. Spec §5: 50/80/95. */
  alertThresholdPcts: number[];
  /** Blind window the meter cannot see: ~5 min freshness + 1 min poll + in-flight (spec §5). */
  exposureWindowMinutes: number;
  /** How far back peak burn is measured for the reserve holdback. */
  burnLookbackDays: number;
  /** Reconciliation tolerance: this floor plus tolerancePpm of the larger side (spec §6). */
  toleranceFloorMicroCents: number;
  /** Parts-per-million of max(ours, theirs); 1000 ppm = 0.1%. Integers, like all money math. */
  tolerancePpm: number;
}

export type LedgerRowKind = "usage" | "credit" | "adjustment" | "reconciliation";

/** A row before the ledger assigns its sequence number. */
export interface NewLedgerRow {
  kind: LedgerRowKind;
  /** Null only for org-level rows (reconciliation verdicts). */
  memberId: string | null;
  /**
   * Signed balance delta in integer micro-cents. Usage rows are negative (they consume
   * credit), credit rows positive, adjustments either, reconciliation rows exactly zero —
   * a verdict is a record, never money.
   */
  deltaMicroCents: number;
  /**
   * Dedup key. Usage rows reuse UsageEvent.idempotencyKey verbatim, so re-polling an
   * overlapping window cannot double-bill (spec §4). Credits and adjustments carry
   * caller-supplied keys; posting the same key twice is a no-op, which is what makes
   * a retried top-up safe.
   */
  idempotencyKey: string;
  /** Bucket start for usage rows; posting time (injected) for everything else. ISO 8601 UTC. */
  ts: string;
  /** Self-explanation: model/tier/workspace for usage, note for credits, verdict for reconciliation. */
  detail: Record<string, unknown>;
  /** Injected wall-clock at append time. */
  appendedAt: string;
}

export interface LedgerRow extends NewLedgerRow {
  /** Monotonic, assigned by the ledger on append, never by the caller. */
  seq: number;
}

/**
 * The whole ledger, replayable from its JSONL. Corrections are compensating rows;
 * nothing is ever edited in place (spec §4).
 */
export interface LedgerState {
  rows: readonly LedgerRow[];
  /** Every idempotencyKey ever appended — the dedup set re-polls check against. */
  seen: ReadonlySet<string>;
  nextSeq: number;
}

/**
 * What the budget gate decides for one member on one look (spec §5). Pure data —
 * the shell is the only place an alert is sent or a key is killed, and only under
 * --enforce; the default is a dry run that prints what it would have done.
 */
export interface BudgetDecision {
  memberId: string;
  creditedMicroCents: number;
  consumedMicroCents: number;
  balanceMicroCents: number;
  /** Holdback for the blind window: peak observed burn × exposureWindowMinutes. */
  reserveMicroCents: number;
  /** balance − reserve. The number a member can actually still spend. */
  spendableMicroCents: number;
  /** Thresholds newly crossed this look (already-alerted ones are not re-fired). */
  newAlertPcts: number[];
  /** True once spendable ≤ 0 — the key dies. Manual reactivation only (spec §5). */
  hardCap: boolean;
}

/** Side effects the pure core requests and the shell may perform. */
export type PoolAction =
  | { type: "alert"; memberId: string; pct: number; spendableMicroCents: number }
  | { type: "deactivate_key"; memberId: string; apiKeyId: string };

/** One (workspace, UTC day) comparison between our ledger and Anthropic's cost report (spec §6). */
export interface ReconcileVerdict {
  day: string; // YYYY-MM-DD, UTC
  workspaceId: string;
  oursMicroCents: number;
  theirsMicroCents: number;
  /** theirs − ours, signed. */
  deltaMicroCents: number;
  toleranceMicroCents: number;
  withinTolerance: boolean;
}
