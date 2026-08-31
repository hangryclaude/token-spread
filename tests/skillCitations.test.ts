import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBodyIds, parseCitationTable } from "../src/register/citations";
import { loadRegister } from "../src/register/load";

/**
 * skills/ makes the same promise as src/coverage.ts: every claim traces to a live register
 * id carrying the verdict it states. registerCoverage.test.ts guards the audit document;
 * nothing guarded the skills until now. Same instrument, pointed at skills/.
 */

const byId = new Map(loadRegister().map((e) => [e.id, e]));
const SKILLS_DIR = join(import.meta.dir, "..", "skills");
const skills = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => ({ name: d.name, md: readFileSync(join(SKILLS_DIR, d.name, "SKILL.md"), "utf8") }));

test("there are skills to check", () => {
  expect(skills.length).toBeGreaterThan(0);
});

test("every skill closes with a Register ids cited table", () => {
  for (const s of skills) {
    expect(parseCitationTable(s.md).length, `${s.name} has no parseable "Register ids cited" table`).toBeGreaterThan(0);
  }
});

test("every table row cites a live id and states its real verdict", () => {
  const wrong: string[] = [];
  for (const s of skills) {
    for (const row of parseCitationTable(s.md)) {
      const e = byId.get(row.id);
      if (!e) {
        wrong.push(`${s.name}: id ${row.id} is not in the register`);
        continue;
      }
      if (e.strictVerdict !== row.verdictToken) {
        wrong.push(`${s.name}: id ${row.id} table says ${row.verdictToken}, register holds ${e.strictVerdict}`);
      }
    }
  }
  expect(wrong, `skill citation tables disagree with the register:\n  ${wrong.join("\n  ")}`).toEqual([]);
});

test("every id a skill body mentions exists in the register", () => {
  const missing: string[] = [];
  for (const s of skills) {
    for (const id of parseBodyIds(s.md)) {
      if (!byId.has(id)) missing.push(`${s.name}: body cites id ${id}, register does not hold it`);
    }
  }
  expect(missing, missing.join("\n")).toEqual([]);
});

test("the closing table accounts for every id the body cites", () => {
  const stray: string[] = [];
  for (const s of skills) {
    const tabled = new Set(parseCitationTable(s.md).map((r) => r.id));
    for (const id of parseBodyIds(s.md)) {
      if (!tabled.has(id)) stray.push(`${s.name}: body cites id ${id}, closing table omits it`);
    }
  }
  expect(stray, `ids cited in prose but missing from the closing table:\n  ${stray.join("\n  ")}`).toEqual([]);
});

// The controls — a check that cannot fail is not a check.

const FAKE = `# X

Some prose citing id 61 and later ids 30, 202 in passing.

## Register ids cited

| id | name | verdict |
|----|------|---------|
| 61 | something | PASS_METADATA |
| 30 | a trap | FAIL (trap, not a technique) |
| 202 | forked | CONTRACTUAL_ONLY |
`;

test("control: the parser reads ids and leading verdict tokens from a table", () => {
  expect(parseCitationTable(FAKE)).toEqual([
    { id: 61, verdictToken: "PASS_METADATA" },
    { id: 30, verdictToken: "FAIL" },
    { id: 202, verdictToken: "CONTRACTUAL_ONLY" },
  ]);
});

test("control: the parser reads comma-run and repeated body citations", () => {
  expect(parseBodyIds(FAKE)).toEqual([30, 61, 202]);
});

test("control: a document without the section yields no rows", () => {
  expect(parseCitationTable("# nothing here\n\njust prose about id 5\n")).toEqual([]);
});
