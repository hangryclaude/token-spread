import type { Entry } from "./load";

/**
 * The next free id. Ids are citation handles: never reused, never renumbered, not even after
 * an entry is withdrawn from the passing column.
 */
export function nextId(entries: Entry[]): number {
  return entries.reduce((max, e) => Math.max(max, e.id), -1) + 1;
}

export function duplicateIds(entries: Entry[]): number[] {
  const seen = new Set<number>();
  const dup = new Set<number>();
  for (const e of entries) (seen.has(e.id) ? dup : seen).add(e.id);
  return [...dup].sort((a, b) => a - b);
}
