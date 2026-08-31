import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRegister, RESEARCH_DIR, type Entry } from "../src/register/load";

/**
 * A sweep brief publishes a table of ids and the verdicts they carry. Nothing checked it, and on
 * 2026-08-17 the first draft of the recovery brief had nine of fourteen ids wrong — written from
 * the order the entries were expected to land in rather than from the order they actually did.
 * The register's cohort file was right the whole time; the prose about it was not.
 *
 * The convention this enforces, so a brief can still say more than the JSON does: in a table row
 * that begins with a register id, the LAST bolded verdict token in that row is the verdict the
 * brief is claiming the entry now holds. Earlier unbolded ones are history — "PASS_ABSOLUTE ->
 * **FAIL**" reads as a demotion, and only the **FAIL** is a claim about the register today.
 */

const VERDICTS = [
  "PASS_ABSOLUTE", "PASS_METADATA", "PASS_SCHEDULING", "PASS_REPLAY",
  "CONTRACTUAL_ONLY", "FAIL", "INSUFFICIENT_EVIDENCE",
];
/* A table row whose first cell is a bare integer — the id column of a brief's summary table. */
const ID_ROW = /^\|\s*(\d{1,4})\s*\|(.*)\|\s*$/gm;
const BOLD_VERDICT = new RegExp(`\\*\\*(${VERDICTS.join("|")})\\*\\*`, "g");

const byId = new Map<number, Entry>(loadRegister().map((e) => [e.id, e]));
const briefs = readdirSync(RESEARCH_DIR).filter((f) => f.endsWith(".md"));

test("every brief names ids that exist in the register", () => {
  const missing: string[] = [];
  for (const f of briefs) {
    const text = readFileSync(join(RESEARCH_DIR, f), "utf8");
    for (const row of text.matchAll(ID_ROW)) {
      const id = Number(row[1]);
      if (!byId.has(id)) missing.push(`${f}: row for id ${id}, which is not in the register`);
    }
  }
  expect(missing, `briefs cite ids the register does not hold:\n  ${missing.join("\n  ")}`).toEqual([]);
});

test("every verdict a brief claims for an id is the verdict the register holds", () => {
  const wrong: string[] = [];
  let checked = 0;
  for (const f of briefs) {
    const text = readFileSync(join(RESEARCH_DIR, f), "utf8");
    for (const row of text.matchAll(ID_ROW)) {
      const entry = byId.get(Number(row[1]));
      if (entry === undefined) continue; // reported by the test above
      const bolded = [...row[2]!.matchAll(BOLD_VERDICT)].map((m) => m[1]);
      if (bolded.length === 0) continue; // the row makes no verdict claim
      checked++;
      const claimed = bolded[bolded.length - 1];
      if (claimed !== entry.strictVerdict) {
        wrong.push(`${f}: id ${entry.id} claimed ${claimed}, register holds ${entry.strictVerdict} — ${entry.name.slice(0, 50)}`);
      }
    }
  }
  // A gate that stops matching proves nothing about the tables it was watching.
  expect(checked, "no brief row made a verdict claim — the table convention changed, fix the parser").toBeGreaterThan(0);
  expect(wrong, `briefs disagree with the register:\n  ${wrong.join("\n  ")}`).toEqual([]);
});
