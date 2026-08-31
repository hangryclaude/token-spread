import type { Cohort } from "./load";

/**
 * Every verdict rests on a source read on a day, and this reports which of those days have got
 * old. It runs into a limitation of the data it reads, and reports the limitation rather than
 * papering over it: of the 98 entries carrying `verifiedAgainst`, not one carries a date. The
 * phrase they use is "this session", which was unambiguous to the person writing it and is
 * unrecoverable now.
 *
 * So there are two grades of answer. `entry` means the entry named its own date. `cohort` means
 * it did not, and the date shown is the one in its cohort's filename — a genuine upper bound on
 * how recently that source can have been read, and no more precise than that. `none` means
 * neither, and is never silently aged: an entry nobody can date is the exact thing this report
 * exists to surface, so it must not be reported as fresh.
 */
const DATE = /\b20\d{2}-\d{2}-\d{2}\b/;

export type DateSource = "entry" | "cohort" | "none";

export interface Staleness {
  id: number;
  name: string;
  verifiedOn: string | null;
  ageDays: number | null;
  dateSource: DateSource;
}

export function staleness(cohorts: Cohort[], asOf: string): Staleness[] {
  const now = Date.parse(asOf);
  return cohorts.flatMap(({ file, entries }) => {
    const fromFile = DATE.exec(file)?.[0] ?? null;
    return entries.map((e) => {
      const src = typeof e.verifiedAgainst === "string" ? e.verifiedAgainst : "";
      const fromEntry = DATE.exec(src)?.[0] ?? null;
      const verifiedOn = fromEntry ?? fromFile;
      const dateSource: DateSource = fromEntry ? "entry" : fromFile ? "cohort" : "none";
      return {
        id: e.id,
        name: e.name,
        verifiedOn,
        ageDays: verifiedOn === null ? null : Math.floor((now - Date.parse(verifiedOn)) / 86_400_000),
        dateSource,
      };
    });
  });
}
