import type { EvidenceClass } from "../evidence";
import type { UsageEvent } from "../types";
import { sessionsOrderedByTime } from "./session";

export interface TtlCrossingFinding {
  evidence: EvidenceClass;
  /** False when the input carries no sessions — aggregates cannot answer this question. */
  computable: boolean;
  /** Sessions whose writes started on the 1-hour TTL and later continued on 5-minute writes alone. */
  flippedSessions: number;
  /** 5-minute write tokens after the last 1-hour write in each flipped session. */
  affectedWriteTokens: number;
}

/**
 * Register id 184: Claude Code's cache TTL flips from 1 hour to 5 minutes on crossing from
 * subscription into usage-credit billing, and `ENABLE_PROMPT_CACHING_1H=1` restores it.
 * After the flip, every pause longer than five minutes re-bills the full context as a fresh
 * write instead of a 0.1x read.
 *
 * The wire signature is a session whose writes start on the 1-hour TTL and later continue
 * on 5-minute writes alone. That is a signature, not a proof — a deliberate mid-session TTL
 * change looks identical — so this finding warns and never prices. What it deliberately
 * does NOT do:
 *   - price the re-billed context (that needs the gap structure, which is the TTL
 *     right-sizing detector's instrument pointed the other way);
 *   - fire on mixed writes inside one event, or on 5m writes that PRECEDE the 1h regime —
 *     only a completed 1h→5m handover counts.
 */
export function detectTtlCrossing(events: readonly UsageEvent[]): TtlCrossingFinding {
  const sessioned = events.filter((e) => e.sessionId !== null).length;
  const f: TtlCrossingFinding = {
    evidence: "PASS_METADATA",
    computable: events.length === 0 || sessioned > 0,
    flippedSessions: 0,
    affectedWriteTokens: 0,
  };
  if (!f.computable) return f;

  // A null sessionId can carry no before-and-after, so it excludes rather than islands.
  for (const ordered of sessionsOrderedByTime(events, (e) => e.sessionId)) {
    const lastOneHour = ordered.findLastIndex((e) => e.cacheCreation1hTokens > 0);
    if (lastOneHour === -1) continue; // never on the 1-hour regime, nothing to flip from

    let after = 0;
    for (const e of ordered.slice(lastOneHour + 1)) after += e.cacheCreation5mTokens;
    if (after > 0) {
      f.flippedSessions++;
      f.affectedWriteTokens += after;
    }
  }

  return f;
}
