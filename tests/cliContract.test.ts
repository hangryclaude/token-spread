import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * The command-line contract a first-time user meets. These are the three things someone
 * does within a minute of cloning: ask what the flags are, point it somewhere wrong, and
 * point it somewhere empty.
 */

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

async function run(args: string[]) {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, stdout, stderr };
}

test("--help lists every flag the program actually accepts", async () => {
  const { code, stdout } = await run(["--help"]);
  expect(code).toBe(0);
  for (const flag of ["--dir", "--admin", "--html", "--json", "--cache-target", "--write-overhead", "--only"]) {
    expect(stdout).toContain(flag);
  }
});

test("--version prints a version", async () => {
  const { code, stdout } = await run(["--version"]);
  expect(code).toBe(0);
  expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
});

test("an unreadable directory fails loudly", async () => {
  const { code, stderr } = await run(["--dir", join(tmpdir(), "definitely-not-here-" + Date.now())]);
  expect(code).toBe(1);
  expect(stderr).toContain("cannot read");
});

test("a directory with no transcripts refuses to report $0.00", async () => {
  // The dangerous case. Pointing at the wrong folder used to produce a clean, confident
  // report saying you spend nothing — indistinguishable from a real audit of a quiet
  // month. Finding no input is not the same as finding no spend.
  const empty = join(tmpdir(), `ts-empty-${Date.now()}`);
  mkdirSync(empty, { recursive: true });
  try {
    const { code, stdout, stderr } = await run(["--dir", empty]);
    expect(code).toBe(1);
    expect(stdout).not.toContain("$0.00");
    expect(stderr.toLowerCase()).toContain("no transcripts");
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("a directory whose transcripts carry no usage says so distinctly", async () => {
  // Different failure from the one above: files were found, but none priced. That points
  // at a parsing problem, not a wrong path, and must not read as "you spend nothing".
  const d = join(tmpdir(), `ts-nousage-${Date.now()}`);
  mkdirSync(join(d, "proj"), { recursive: true });
  writeFileSync(join(d, "proj", "a.jsonl"), JSON.stringify({ type: "user", message: {} }) + "\n");
  try {
    const { code, stderr } = await run(["--dir", d]);
    expect(code).toBe(1);
    expect(stderr.toLowerCase()).toContain("no priced events");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("an unknown flag is refused rather than silently ignored", async () => {
  // Silently ignoring --htlm and printing a report is how someone concludes the tool
  // does not write documents.
  const { code, stderr } = await run(["--htlm", "out.html"]);
  expect(code).toBe(2);
  expect(stderr).toContain("--htlm");
});
