import { expect, test } from "bun:test";
import { loadCohorts, type Cohort, type Entry } from "../src/register/load";
import { staleness } from "../src/register/stale";

/**
 * Every verdict rests on a source read on a day. Providers reprice and withdraw features; the
 * entry does not notice. What makes this awkward is that the register's own dating is thin —
 * 98 entries carry `verifiedAgainst` and none of them carry a date, because the phrase they all
 * use is "this session". So the report has to grade its own confidence, and these tests are
 * mostly about it refusing to overstate.
 */

const sourced = (id: number, verifiedAgainst?: string): Entry => ({
  id, name: `e${id}`, strictVerdict: "PASS_ABSOLUTE", reasoning: "x", savings: "None",
  provenance: "primary-doc", telemetrySignal: "x", providers: ["anthropic"],
  ...(verifiedAgainst === undefined ? {} : { verifiedAgainst }),
});
/* A filename with no date in it, so these cases exercise the entry's own date and nothing else. */
const undatedCohort = (...entries: Entry[]): Cohort[] => [{ file: "fixture.json", entries }];

test("a date inside prose is found, aged, and credited to the entry", () => {
  const [r] = staleness(undatedCohort(sourced(1, "platform.claude.com/docs/pricing (WebFetch 2026-08-01)")), "2026-08-17");
  expect(r!.verifiedOn).toBe("2026-08-01");
  expect(r!.ageDays).toBe(16);
  expect(r!.dateSource).toBe("entry");
});

test("a source read on the day is zero days old, not unknown", () => {
  const [r] = staleness(undatedCohort(sourced(4, "anthropic.com/legal/aup (re-read 2026-08-17)")), "2026-08-17");
  expect(r!.ageDays).toBe(0);
});

test("the first date wins where a source names two", () => {
  // "ms.date 2026-05-22" alongside the day it was read: the earlier is the weaker claim, and
  // taking the weaker one keeps this report from flattering the register.
  const [r] = staleness(undatedCohort(sourced(5, "learn.microsoft.com (ms.date 2026-05-22), read 2026-08-12")), "2026-08-17");
  expect(r!.verifiedOn).toBe("2026-05-22");
});

test("an entry with no date falls back to its cohort's, and says so", () => {
  const [r] = staleness([{ file: "2026-08-10-verdicts-final.json", entries: [sourced(2, "bifrost stream.go (WebFetch, this session)")] }], "2026-08-17");
  expect(r!.verifiedOn).toBe("2026-08-10");
  expect(r!.ageDays).toBe(7);
  expect(r!.dateSource).toBe("cohort");
});

test("an entry the cohort cannot date either is unknown, never fresh", () => {
  const [r] = staleness(undatedCohort(sourced(3)), "2026-08-17");
  expect(r!.verifiedOn).toBeNull();
  expect(r!.ageDays).toBeNull();
  expect(r!.dateSource).toBe("none");
});

test("the real register is datable end to end — every entry gets a day from somewhere", () => {
  // Cohort filenames all carry a date, so nothing should land in "none". If a cohort is ever
  // added under a name without one, this is what says so rather than the report going quiet.
  const undated = staleness(loadCohorts(), "2026-08-17").filter((r) => r.dateSource === "none");
  expect(undated.map((r) => r.id), `entries no cohort can date: ${undated.map((r) => r.id).join(", ")}`).toEqual([]);
});
