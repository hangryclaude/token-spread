import { expect, test } from "bun:test";
import { COVERAGE } from "../src/coverage";
import { loadRegister } from "../src/register/load";

/**
 * The audit document claims to be register-backed: each coverage row cites the register
 * entries behind a lever family. A cited id that does not exist, or that the register has
 * since rejected, turns that claim into decoration. This is the same instrument as
 * publishedCounts — a static table diffed against the data it cites — pointed at src/.
 */

const byId = new Map(loadRegister().map((e) => [e.id, e]));

test("every cited register id exists", () => {
  const missing = COVERAGE.flatMap((row) =>
    row.registerIds.filter((id) => !byId.has(id)).map((id) => `${row.family}: id ${id}`));
  expect(missing, `coverage cites ids the register does not hold:\n  ${missing.join("\n  ")}`).toEqual([]);
});

test("no register id is claimed by two families", () => {
  const seen = new Map<number, string>();
  const dup: string[] = [];
  for (const row of COVERAGE) {
    for (const id of row.registerIds) {
      const prev = seen.get(id);
      if (prev) dup.push(`id ${id} in both "${prev}" and "${row.family}"`);
      seen.set(id, row.family);
    }
  }
  expect(dup, dup.join("\n")).toEqual([]);
});

test("modeled, detected and exposure-only rows cite only verdicts that support them", () => {
  // A lever the audit MODELS or DETECTS must rest on entries the register still stands
  // behind — PASS_* or CONTRACTUAL_ONLY. Rows marked invisible are exempt: citing an
  // unresolved entry there is the point, not a defect.
  const wrong: string[] = [];
  for (const row of COVERAGE) {
    if (row.status === "invisible") continue;
    for (const id of row.registerIds) {
      const e = byId.get(id);
      if (!e) continue; // reported by the existence test above
      if (!/^PASS_|^CONTRACTUAL_ONLY$/.test(e.strictVerdict)) {
        wrong.push(`${row.family} (${row.status}): id ${id} holds ${e.strictVerdict}`);
      }
    }
  }
  expect(wrong, `coverage rows lean on verdicts that cannot carry them:\n  ${wrong.join("\n  ")}`).toEqual([]);
});

test("every row explains itself", () => {
  for (const row of COVERAGE) {
    expect(row.registerIds.length, `${row.family} cites no register entries`).toBeGreaterThan(0);
    expect(row.note.length, `${row.family} has no note`).toBeGreaterThan(20);
  }
});
