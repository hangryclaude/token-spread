import { expect, test } from "bun:test";
import { EVIDENCE_CLASSES, isProvable, shipsByDefault } from "../src/evidence";

// The tier boundary from docs/research/2026-08-10-strict-identity-register.md, expressed
// as a type so a finding cannot exist without declaring what backs it.

test("contractual-only never ships by default", () => {
  expect(shipsByDefault("CONTRACTUAL_ONLY")).toBe(false);
  expect(shipsByDefault("PASS_METADATA")).toBe(true);
});

test("only replay and absolute are provable without provider cooperation", () => {
  expect(isProvable("PASS_REPLAY")).toBe(true);
  expect(isProvable("PASS_ABSOLUTE")).toBe(true);
  expect(isProvable("CONTRACTUAL_ONLY")).toBe(false);
});

test("metadata and scheduling rest on provider prose, not on proof", () => {
  // Anthropic states caching does not change output; we cannot demonstrate it ourselves.
  // Calling these "provable" would launder a documented promise into a measurement.
  expect(isProvable("PASS_METADATA")).toBe(false);
  expect(isProvable("PASS_SCHEDULING")).toBe(false);
});

test("every class is covered", () => {
  expect(EVIDENCE_CLASSES.length).toBe(5);
});

test("the classes are ordered strongest first", () => {
  // Ordering is load-bearing: findings sort by it, so the strongest evidence leads.
  expect([...EVIDENCE_CLASSES]).toEqual([
    "PASS_ABSOLUTE", "PASS_METADATA", "PASS_SCHEDULING", "PASS_REPLAY", "CONTRACTUAL_ONLY",
  ]);
});
