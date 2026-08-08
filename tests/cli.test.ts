import { expect, test } from "bun:test";

const CLI = `${import.meta.dir}/../src/cli.ts`;
const FIX = `${import.meta.dir}/../fixtures`;

async function run(args: string[]) {
  const p = Bun.spawn(["bun", "run", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { stdout, stderr, code: await p.exited };
}

test("prints a human summary containing the current cost", async () => {
  const r = await run(["--dir", FIX, "--only", "mixed.jsonl"]);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("$317.05");
});

test("--json emits parseable JSON with no prompt content", async () => {
  const r = await run(["--dir", FIX, "--only", "mixed.jsonl", "--json"]);
  expect(r.code).toBe(0);
  const parsed = JSON.parse(r.stdout);
  expect(parsed.currentCost.formatted).toBe("$317.05");
  for (const canary of ["SECRET_CANARY_ALPHA", "SECRET_CANARY_BETA", "SECRET_CANARY_GAMMA"]) {
    expect(r.stdout).not.toContain(canary);
  }
});

test("exits non-zero with a usable message when the directory is missing", async () => {
  const r = await run(["--dir", "/nope/does/not/exist"]);
  expect(r.code).not.toBe(0);
  expect(r.stderr).toContain("/nope/does/not/exist");
});
