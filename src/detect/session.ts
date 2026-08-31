import type { UsageEvent } from "../types";

/**
 * Group events into sessions and order each session by timestamp. Both TTL detectors point
 * this same instrument at the traffic — the gap between consecutive requests in a session —
 * and only differ in what counts as a group: `ttlCrossing` needs a real session to speak
 * about a "flip" at all, while `ttlRightSizing` treats a sessionless event as its own
 * one-event island rather than excluding it. That difference lives entirely in `keyOf`;
 * grouping and ordering were identical and had drifted into two copies.
 *
 * `keyOf` returning `null` excludes the event from every group.
 */
export function sessionsOrderedByTime(
  events: readonly UsageEvent[],
  keyOf: (e: UsageEvent) => string | null,
): UsageEvent[][] {
  const bySession = new Map<string, UsageEvent[]>();
  for (const e of events) {
    const key = keyOf(e);
    if (key === null) continue;
    const list = bySession.get(key);
    if (list) list.push(e);
    else bySession.set(key, [e]);
  }
  return [...bySession.values()].map(
    (list) => [...list].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)),
  );
}
