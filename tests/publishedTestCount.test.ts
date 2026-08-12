import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * The README's header badge states a test count. It said `145 tests` while the suite ran 156 —
 * stale in the harmless direction, but the badge would look identical if it said 500.
 *
 * The obvious instrument, grepping `test(` out of tests/, is wrong: publishedCounts.test.ts and
 * publishedRates.test.ts declare tests inside a for-loop, so a static count is short by however
 * many pages those loops cover and the gate cries wolf. So this runs the suite for real in a child
 * process and reads bun's own tally. Slower, and correct — the number on the README is the number
 * a reader would get by running the command, which is the only claim being made.
 *
 * The child is marked with an env var so this one test excuses itself there and cannot recurse.
 */

const CHILD = "TOKEN_SPREAD_COUNTING_TESTS";

test.skipIf(process.env[CHILD] === "1")("the README's test count is the number the suite actually runs", async () => {
  const proc = Bun.spawnSync(["bun", "test"], {
    env: { ...process.env, [CHILD]: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });

  // bun prints its summary on stderr; keep stdout in the haystack anyway rather than depend on it.
  const out = new TextDecoder().decode(proc.stderr) + new TextDecoder().decode(proc.stdout);
  const ran = out.match(/^\s*(\d+) pass$/m);
  expect(ran, `could not find bun's pass tally in the child run:\n${out.slice(-600)}`).not.toBeNull();

  // The child skips this test, so it runs exactly one fewer than the parent will.
  const actual = Number(ran![1]) + 1;

  const badge = readFileSync("README.md", "utf8").match(/`(\d+) tests`/);
  expect(badge, "the README no longer carries an `N tests` badge — fix the regex or drop this test").not.toBeNull();

  expect(Number(badge![1]), `README says ${badge![1]} tests, the suite runs ${actual}`).toBe(actual);
});
