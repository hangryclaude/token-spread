import { expect, test } from "bun:test";
import { loadRegister, type Entry } from "../src/register/load";

/**
 * The register's format, enforced.
 *
 * This project's one verified differentiator is that it publishes its rejections, its unresolved
 * bucket, and its own errata. That is a claim about process, and a claim about process is worth
 * exactly as much as its falsifiability — so the shape a correction takes has to be checkable by
 * a stranger, not described in prose on a repo with no track record.
 *
 * docs/research/SCHEMA.md is the contract. This is the enforcement.
 */

const entries: Entry[] = loadRegister();

const REQUIRED = ["id", "name", "strictVerdict", "reasoning", "savings", "provenance", "telemetrySignal", "providers"];
const VERDICTS = new Set([
  "PASS_ABSOLUTE", "PASS_METADATA", "PASS_SCHEDULING", "PASS_REPLAY",
  "CONTRACTUAL_ONLY", "FAIL", "INSUFFICIENT_EVIDENCE",
]);
const CORRECTION_KINDS = new Set(["withdrawn-from-passing", "verdict-changed", "source-corrected", "superseded"]);

test("every entry carries every required field", () => {
  const bad: string[] = [];
  for (const e of entries) {
    for (const k of REQUIRED) {
      const v = e[k];
      const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
      if (empty) bad.push(`id ${e.id ?? "?"} (${String(e.name).slice(0, 40)}): missing ${k}`);
    }
  }
  expect(bad, `entries violating the schema:\n  ${bad.join("\n  ")}`).toEqual([]);
});

test("every verdict is one the schema defines", () => {
  // A new class would land in no published bucket and silently break the tally reconciliation,
  // where it would read as an arithmetic error rather than an unhandled category.
  const strays = [...new Set(entries.map((e) => e.strictVerdict))].filter((v) => !VERDICTS.has(v));
  expect(strays, `undocumented verdict class(es): ${strays.join(", ")}`).toEqual([]);
});

test("reasoning is substantive, not a placeholder", () => {
  // The shortest real reasoning in the register runs well past 100 characters. A one-liner is
  // either a stub or a verdict nobody argued for.
  const thin = entries
    .filter((e) => String(e.reasoning).length < 100)
    .map((e) => `id ${e.id}: ${String(e.reasoning).length} chars`);
  expect(thin, `reasoning too short to be an adjudication:\n  ${thin.join("\n  ")}`).toEqual([]);
});

test("corrections are dated, typed, and explained", () => {
  /* The field the whole differentiator rests on. Four entries carry one today — ids 13, 15, 16
     and 18, expelled from the passing column when their sources failed checking. If a future
     correction is added in a different shape, a reader grepping for withdrawals misses it. */
  const bad: string[] = [];
  let seen = 0;
  for (const e of entries) {
    const cs = e.corrections as { date?: string; kind?: string; note?: string }[] | undefined;
    if (cs === undefined) continue;
    if (!Array.isArray(cs)) { bad.push(`id ${e.id}: corrections is not an array`); continue; }
    for (const c of cs) {
      seen++;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date ?? "")) bad.push(`id ${e.id}: correction date "${c.date}" is not YYYY-MM-DD`);
      if (!CORRECTION_KINDS.has(c.kind ?? "")) bad.push(`id ${e.id}: correction kind "${c.kind}" is not a documented kind`);
      if ((c.note ?? "").length < 80) bad.push(`id ${e.id}: correction note is too short to explain anything`);
    }
  }
  expect(bad, `malformed corrections:\n  ${bad.join("\n  ")}`).toEqual([]);
  // Vacuity guard: if the register ever contains no corrections at all, the assertions above
  // pass over an empty loop and this test proves nothing. Four exist as of 2026-08-13, and a
  // register that has never corrected itself is the thing this project says not to trust.
  expect(seen, "no corrections found — either they were edited away or this gate stopped watching").toBeGreaterThanOrEqual(4);
});

test("an unresolved entry says what would settle it, or says it cannot be settled", () => {
  // 40 entries are published as unresolved. Unresolved without a path forward is a shrug;
  // this asserts the register does the harder thing at least most of the time.
  const unresolved = entries.filter((e) => e.strictVerdict === "INSUFFICIENT_EVIDENCE");
  expect(unresolved.length).toBeGreaterThan(0);
  const withPath = unresolved.filter((e) => e.settlingExperiment || /experiment|would settle|measure|replay|probe/i.test(String(e.reasoning)));
  expect(withPath.length / unresolved.length, `only ${withPath.length}/${unresolved.length} unresolved entries name a way forward`)
    .toBeGreaterThan(0.5);
});

test("ids are unique and stable enough to cite", () => {
  const ids = entries.map((e) => e.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  expect(dupes, `duplicate ids break citation: ${dupes.join(", ")}`).toEqual([]);
  expect(ids.every((id) => Number.isInteger(id) && id >= 0)).toBe(true);
});
