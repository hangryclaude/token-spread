import { expect, test } from "bun:test";
import type { Entry } from "../src/register/load";
import { assignIds, nameCollisions, type Candidate } from "../src/register/merge";

/**
 * Sweep 12 adjudicated fifteen candidates and landed two. The other thirteen sat in a markdown
 * brief carrying ids 185-199 that the verdict files had already used. Nothing assigned those
 * numbers but a person typing them, and nothing checked them afterwards.
 */

const at = (id: number, name: string): Entry => ({
  id, name, strictVerdict: "FAIL", reasoning: "x", savings: "None",
  provenance: "primary-doc", telemetrySignal: "x", providers: ["anthropic"],
});
const proposed = (name: string): Candidate => ({
  name, strictVerdict: "PASS_ABSOLUTE", reasoning: "x", savings: "None",
  provenance: "primary-doc", telemetrySignal: "x", providers: ["anthropic"],
});

test("ids start one past the highest in use and run in submission order", () => {
  const { firstId, assigned } = assignIds([at(0, "a"), at(186, "b")], [proposed("c"), proposed("d")]);
  expect(firstId).toBe(187);
  expect(assigned.map((e) => e.id)).toEqual([187, 188]);
});

test("a gap in the existing ids is not filled", () => {
  // An id is a citation handle. Reusing 5 because entry 5 was withdrawn silently repoints
  // every citation that already went out.
  expect(assignIds([at(0, "a"), at(9, "b")], [proposed("c")]).assigned[0]!.id).toBe(10);
});

test("the candidate's own fields survive assignment", () => {
  const [only] = assignIds([at(0, "a")], [proposed("BullMQ job deduplication")]).assigned;
  expect(only!.name).toBe("BullMQ job deduplication");
  expect(only!.strictVerdict).toBe("PASS_ABSOLUTE");
});

test("merging nothing is not an error and moves no ids", () => {
  expect(assignIds([at(0, "a")], [])).toEqual({ firstId: 1, assigned: [] });
});

test("a resubmitted technique is caught however it is punctuated", () => {
  const hits = nameCollisions([at(4, "Message Batches API — 50% off")], [proposed("message batches api: 50% off")]);
  expect(hits).toEqual([{ candidate: "message batches api: 50% off", existingId: 4 }]);
});

test("a genuinely new technique is not flagged", () => {
  expect(nameCollisions([at(4, "Message Batches API")], [proposed("BullMQ job deduplication")])).toEqual([]);
});
