/**
 * What this audit does about each register-backed lever family — the table that makes
 * "register-backed" a checkable claim instead of a slogan. Every id cited here is
 * cross-checked against the live register by tests/registerCoverage.test.ts: an id that
 * stops existing, or whose verdict the register withdraws, fails the build.
 *
 * Static by design. The report pipeline is pure (no filesystem, no clock), so the audit
 * cannot read docs/research at run time — the test is what keeps this table honest.
 */

export type CoverageStatus = "modeled" | "detected" | "exposure-only" | "invisible";

export interface CoverageRow {
  family: string;
  registerIds: number[];
  status: CoverageStatus;
  /** What the audit does — or exactly which signal the data does not carry. */
  note: string;
}

export const COVERAGE: readonly CoverageRow[] = [
  {
    family: "Cache-hit headroom",
    registerIds: [9, 42, 64, 68, 141, 147, 163, 168],
    status: "modeled",
    note: "simulated at the operator-set target rate, measured hit rate printed beside it; the 0.1x read price is the whole lever",
  },
  {
    family: "Cache-write TTL right-sizing",
    registerIds: [23, 61, 173],
    status: "modeled",
    note: "priced from the gap to the next request in each session; aggregate sources without sessions say so instead of guessing",
  },
  {
    family: "Batch tier (Message Batches API)",
    registerIds: [137],
    status: "modeled",
    note: "opt-in simulation via --batch-share; contractual 50%, computed on the post-cache regime and excluded from measured figures",
  },
  {
    family: "Service-tier exposure",
    registerIds: [76, 86, 123],
    status: "exposure-only",
    note: "spend is split by tier so batch and priority exposure is visible; priority/flex have no published multiplier and are refused, not guessed",
  },
  {
    family: "TTL billing-crossing flip",
    registerIds: [184],
    status: "detected",
    note: "a session whose writes flip 1h to 5m mid-session warns and names ENABLE_PROMPT_CACHING_1H=1; a signature, never priced",
  },
  {
    family: "Spend anomalies and budget caps",
    registerIds: [126, 127],
    status: "detected",
    note: "day spikes past 3x the trailing median with a $10 floor are dated and dollared; money already spent is not a saving",
  },
  {
    family: "Cache-configuration hygiene",
    registerIds: [25, 26, 75, 165],
    status: "invisible",
    note: "breakpoint count and placement never reach token-count data — auditing them needs the request shape, which this tool refuses to read",
  },
  {
    family: "Waste: retries, duplicates, zombie loops",
    registerIds: [150, 154, 158],
    status: "invisible",
    note: "no retry, error or attempt marker exists in either source; stated as UNQUANTIFIED rather than reported as $0",
  },
  {
    family: "Extended-thinking share of output",
    registerIds: [183],
    status: "exposure-only",
    note: "thinking bills as output so the totals hold, but the thinking-vs-answer split is absent from these sources and the report says so",
  },
  {
    family: "Batch partial-failure resubmission",
    registerIds: [258],
    status: "invisible",
    note: "no batch job id exists in either source, so failed-subset resubmission cannot be seen here — it lives at the batch client",
  },
];
