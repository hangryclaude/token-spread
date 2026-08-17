import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Where the register lives. One list, so the schema test, the film and the site cannot
 * disagree about what "the register" is — the same reason `cli.ts` keeps one FLAGS array.
 */
export const RESEARCH_DIR = join(import.meta.dir, "..", "..", "docs", "research");

export type StrictVerdict =
  | "PASS_ABSOLUTE" | "PASS_METADATA" | "PASS_SCHEDULING" | "PASS_REPLAY"
  | "CONTRACTUAL_ONLY" | "FAIL" | "INSUFFICIENT_EVIDENCE";

export interface Correction {
  date: string;
  kind: "withdrawn-from-passing" | "verdict-changed" | "source-corrected" | "superseded";
  note: string;
}

/** One adjudicated candidate. `docs/research/SCHEMA.md` is the prose contract for this shape. */
export interface Entry {
  id: number;
  name: string;
  strictVerdict: StrictVerdict;
  reasoning: string;
  savings: string;
  provenance: string;
  telemetrySignal: string;
  providers: string[];
  verifiedAgainst?: string;
  corrections?: Correction[];
  [key: string]: unknown;
}

export function cohortFiles(): string[] {
  return JSON.parse(readFileSync(join(RESEARCH_DIR, "cohorts.json"), "utf8")) as string[];
}

/**
 * The register, still grouped by the file each entry came from. Which cohort an entry belongs
 * to is evidence in its own right: the filename carries the date that cohort was adjudicated,
 * and for the 89 entries whose `verifiedAgainst` says "this session" and nothing more, that
 * filename is the only date anyone can still recover.
 */
export interface Cohort {
  file: string;
  entries: Entry[];
}

export function loadCohorts(): Cohort[] {
  return cohortFiles().map((file) => ({
    file,
    entries: JSON.parse(readFileSync(join(RESEARCH_DIR, file), "utf8")) as Entry[],
  }));
}

export function loadRegister(): Entry[] {
  return loadCohorts().flatMap((c) => c.entries);
}

/** The four buckets the site publishes. Derived here so nothing downstream counts by hand. */
export interface Tally {
  total: number;
  pass: number;
  contractual: number;
  rejected: number;
  unresolved: number;
}

export function tally(entries: Entry[]): Tally {
  const t: Tally = { total: entries.length, pass: 0, contractual: 0, rejected: 0, unresolved: 0 };
  for (const e of entries) {
    if (e.strictVerdict.startsWith("PASS_")) t.pass++;
    else if (e.strictVerdict === "CONTRACTUAL_ONLY") t.contractual++;
    else if (e.strictVerdict === "FAIL") t.rejected++;
    else if (e.strictVerdict === "INSUFFICIENT_EVIDENCE") t.unresolved++;
    // No catch-all bucket. A new verdict class silently landing in "unresolved" is how a
    // register drops a category while still adding up — the thing this one exists to prevent.
    else throw new Error(`id ${e.id}: unrecognised verdict ${e.strictVerdict}`);
  }
  return t;
}
