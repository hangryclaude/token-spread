import type { Entry } from "./load";
import { nextId } from "./ids";

/** A candidate as a sweep hands it over: everything an entry needs except the id. */
export type Candidate = Omit<Entry, "id">;

export interface Assignment {
  firstId: number;
  assigned: Entry[];
}

/**
 * Ids come from the register, not from whoever wrote the brief. Sweep 12's brief numbered its
 * own findings and collided with ids already in use; thirteen entries went unmerged for five
 * days because reconciling that by hand was work nobody had time for.
 */
export function assignIds(existing: Entry[], candidates: Candidate[]): Assignment {
  const firstId = nextId(existing);
  return { firstId, assigned: candidates.map((c, i) => ({ ...c, id: firstId + i })) };
}

/* Same technique, different wording. Twelve sweeps have resubmitted the batch API under four
   spellings; punctuation and case are not evidence of novelty, so they go before comparing. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function nameCollisions(
  existing: Entry[],
  candidates: Candidate[],
): { candidate: string; existingId: number }[] {
  const index = new Map(existing.map((e) => [norm(e.name), e.id]));
  const hits: { candidate: string; existingId: number }[] = [];
  for (const c of candidates) {
    const existingId = index.get(norm(c.name));
    if (existingId !== undefined) hits.push({ candidate: c.name, existingId });
  }
  return hits;
}
