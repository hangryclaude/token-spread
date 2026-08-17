#!/usr/bin/env bun
import { loadCohorts, loadRegister, tally } from "./load";
import { duplicateIds, nextId } from "./ids";
import { staleness } from "./stale";

/** Every verb the program accepts. One list, so --help and dispatch cannot disagree. */
const VERBS = [
  { name: "stat", desc: "the four buckets, as the site publishes them" },
  { name: "next-id", desc: "the id the next entry takes" },
  { name: "stale", desc: "entries by how long since their source was last read" },
  { name: "check", desc: "duplicate ids; exits 1 if any" },
] as const;

const verb = process.argv[2];
const asked = verb === undefined || verb === "--help";

if (asked || !VERBS.some((v) => v.name === verb)) {
  const width = Math.max(...VERBS.map((v) => v.name.length));
  const usage = `usage: bun run register <verb>\n\n${VERBS.map((v) => `  ${v.name.padEnd(width)}  ${v.desc}`).join("\n")}`;
  // A silently ignored verb is how someone concludes the register has no tally command.
  if (asked) console.log(usage);
  else console.error(`unknown verb: ${verb}\n\n${usage}`);
  process.exit(asked ? 0 : 2);
}

const entries = loadRegister();

if (verb === "stat") {
  const t = tally(entries);
  console.log(
    [`total ${t.total}`, `pass ${t.pass}`, `contractual ${t.contractual}`,
     `rejected ${t.rejected}`, `unresolved ${t.unresolved}`].join("\n"),
  );
} else if (verb === "next-id") {
  console.log(nextId(entries));
} else if (verb === "stale") {
  const asOf = new Date().toISOString().slice(0, 10);
  const rows = staleness(loadCohorts(), asOf).sort((a, b) => (b.ageDays ?? Infinity) - (a.ageDays ?? Infinity));
  for (const r of rows) {
    // `~` marks a date inherited from the cohort filename rather than stated by the entry. It
    // is an upper bound on how recently the source can have been read, not a reading date, and
    // a report that printed the two the same way would be inventing precision it does not have.
    const age = r.ageDays === null ? "  undated" : `${r.dateSource === "entry" ? " " : "~"}${String(r.ageDays).padStart(5)}d`;
    console.log(`${String(r.id).padStart(4)}  ${age}  ${r.name.slice(0, 78)}`);
  }
  const byEntry = rows.filter((r) => r.dateSource === "entry").length;
  console.error(
    `\n${rows.length} entries · ${byEntry} dated by the entry itself · ${rows.length - byEntry} dated only by their cohort file (~)`,
  );
} else {
  const dup = duplicateIds(entries);
  if (dup.length > 0) {
    console.error(`ids used more than once: ${dup.join(", ")}`);
    process.exit(1);
  }
  console.log(`${entries.length} entries, no duplicate ids`);
}
