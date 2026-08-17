import { expect, test } from "bun:test";
import type { Entry } from "../src/register/load";
import { duplicateIds, nextId } from "../src/register/ids";

/**
 * publishedCounts.test.ts asserts the real register has no duplicate ids. This file asserts the
 * detector it uses would notice if it did — on entries built here, because a test whose only
 * fixture is the data it is guarding passes just as well when the detector does nothing.
 *
 * What it is guarding against: the 2026-08-12 sweep brief numbered its findings 185-199 while
 * the verdict files already held 185 and 186. Thirteen entries went unmerged for five days.
 */

const at = (id: number): Entry => ({
  id, name: `e${id}`, strictVerdict: "FAIL", reasoning: "x", savings: "None",
  provenance: "primary-doc", telemetrySignal: "x", providers: ["anthropic"],
});

test("a repeated id is reported, once, in order", () => {
  expect(duplicateIds([at(3), at(1), at(3), at(1), at(2)])).toEqual([1, 3]);
});

test("distinct ids report nothing", () => {
  expect(duplicateIds([at(0), at(1), at(2)])).toEqual([]);
});

test("nextId is one past the highest in use, not one past the count", () => {
  expect(nextId([at(0), at(186)])).toBe(187);
});

test("nextId does not fill a gap — ids are citation handles, not slots", () => {
  expect(nextId([at(0), at(9)])).toBe(10);
});

test("nextId on an empty register starts at zero", () => {
  expect(nextId([])).toBe(0);
});
