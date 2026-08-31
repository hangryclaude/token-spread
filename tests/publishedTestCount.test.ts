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

/* Four places publish this number and three had drifted apart: README banner 157, README
   quick-start 140, RUNNING.md 140, BRIEF.md 130 — while the suite ran 157. Checking only the
   banner would have left a reader running `bun run test` against a comment promising 140. */
const PUBLISHED: Record<string, RegExp> = {
  "README.md": /badge\/tests-(\d+)/,
  "README.md#quickstart": /bun run test\s+# (\d+) tests/,
  "RUNNING.md": /bun run test\s+# (\d+) tests/,
  "site/BRIEF.md": /\*\*(\d+) tests\*\*/,
};

test.skipIf(process.env[CHILD] === "1")("every published test count is the number the suite actually runs", async () => {
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

  const wrong: string[] = [];
  for (const [where, re] of Object.entries(PUBLISHED)) {
    const found = readFileSync(where.split("#")[0], "utf8").match(re);
    // A regex that stops matching proves nothing about the number it was watching, so an
    // unmatched pattern is a failure here rather than a silent pass.
    if (!found) { wrong.push(`${where}: no test count found — the wording changed, fix the regex`); continue; }
    if (Number(found[1]) !== actual) wrong.push(`${where}: says ${found[1]}, suite runs ${actual}`);
  }
  expect(wrong, `published test counts disagree with the suite:\n  ${wrong.join("\n  ")}`).toEqual([]);
});
