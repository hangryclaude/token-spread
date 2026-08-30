import type { EvidenceClass } from "../evidence";
import type { Metrics } from "../metrics";

export const ANOMALY_FLOOR_MICRO_CENTS = 1_000_000_000; // $10.00
export const MIN_HISTORY_DAYS = 8;
export const ANOMALY_MULTIPLIER = 3;

export interface SpendAnomalyFinding {
  evidence: EvidenceClass;
  /** False when there are priced days but fewer than MIN_HISTORY_DAYS of them. */
  computable: boolean;
  /** Distinct UTC days with priced spend. */
  days: number;
  anomalies: Array<{ day: string; microCents: number; trailingMedianMicroCents: number }>;
  /** Events that could not be priced; counted apart rather than guessed at. */
  skippedUnpriceable: number;
}

/**
 * Register ids 126 and 127: budget alerts and anomaly detection change nothing on the
 * wire — the point is that a runaway loop ($1,771 in 4 hours against a $25 limit, in the
 * register's own unresolved id 160) becomes a same-day incident instead of an invoice.
 *
 * The rule: a UTC day is anomalous when it bills more than ANOMALY_MULTIPLIER (3x) the
 * median of the previous seven observed days AND clears an absolute floor of $10.00 —
 * ratios alone cry wolf on tiny bills. A silent-then-spike history (median $0, day over
 * the floor) counts: that is the classic runaway shape, not an exception to it.
 *
 * Detect-only, deliberately: money already spent is not recoverable, so an anomaly is a
 * warning with dates and dollars, never a priced saving. And it is retrospective — a
 * report generated monthly is not an alerting system, and does not claim to be one.
 *
 * Reads `Metrics.byDay` rather than events + a rate card: `computeMetrics` already runs
 * `costOfEvent` once per event to build every other total, and pricing the same events a
 * second time here would double that cost for no different answer. `skippedUnpriceable`
 * follows the same reasoning — it is exactly the events `computeMetrics` could not price.
 */
export function detectSpendAnomaly(metrics: Metrics): SpendAnomalyFinding {
  const days = Object.entries(metrics.byDay).sort(([a], [b]) => a.localeCompare(b));
  const skippedUnpriceable =
    metrics.skipped.unknown_model + metrics.skipped.malformed + metrics.skipped.unknown_tier;

  const f: SpendAnomalyFinding = {
    evidence: "PASS_ABSOLUTE",
    computable: days.length === 0 || days.length >= MIN_HISTORY_DAYS,
    days: days.length,
    anomalies: [],
    skippedUnpriceable,
  };
  if (!f.computable) return f;

  for (let i = MIN_HISTORY_DAYS - 1; i < days.length; i++) {
    const [day, microCents] = days[i];
    if (microCents < ANOMALY_FLOOR_MICRO_CENTS) continue;
    const window = days.slice(Math.max(0, i - 7), i).map(([, c]) => c).sort((a, b) => a - b);
    const median = window[Math.floor((window.length - 1) / 2)];
    if (microCents > ANOMALY_MULTIPLIER * median) {
      f.anomalies.push({ day, microCents, trailingMedianMicroCents: median });
    }
  }

  return f;
}
