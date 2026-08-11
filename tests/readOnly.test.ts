import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

/**
 * The audit runs against someone else's machine, on data they cannot afford to lose,
 * often before they trust us. "It only reads" has to be a property the suite defends,
 * not a claim in a README.
 *
 * These spawn the real CLI as a subprocess — the same entry point a customer runs. A
 * library-level test would prove the pure core is pure, which was never in doubt; the
 * risk lives at the I/O boundary.
 */

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

const LINE = (req: string, ts: string) => JSON.stringify({
  type: "assistant", timestamp: ts, requestId: req, sessionId: "sess-1",
  message: {
    model: "claude-opus-5",
    content: [{ type: "text", text: "SECRET_CANARY_READONLY" }],
    usage: {
      input_tokens: 12, cache_read_input_tokens: 4000, cache_creation_input_tokens: 900,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 900 },
      output_tokens: 60, service_tier: "standard",
    },
  },
}) + "\n";

function fixture(): string {
  const root = join(tmpdir(), `ts-ro-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  mkdirSync(join(root, "proj-a", "sess", "subagents"), { recursive: true });
  writeFileSync(join(root, "proj-a", "top.jsonl"),
    LINE("req_a", "2026-08-01T10:00:00Z") + LINE("req_b", "2026-08-01T10:02:00Z"));
  writeFileSync(join(root, "proj-a", "sess", "subagents", "nested.jsonl"),
    LINE("req_c", "2026-08-01T10:03:00Z"));
  return root;
}

/** Content hash, size and mtime of every file under `dir`, order-independent. */
function fingerprint(dir: string): string {
  const h = createHash("sha256");
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else {
        const content = createHash("sha256").update(readFileSync(full)).digest("hex");
        h.update(`${full} ${st.size} ${st.mtimeMs} ${content}|`);
      }
    }
  };
  walk(dir);
  return h.digest("hex");
}

const run = async (args: string[]) =>
  await Bun.spawn(["bun", "run", CLI, ...args], { stdout: "pipe", stderr: "pipe" }).exited;

test("a full run leaves every input file byte-identical", async () => {
  const root = fixture();
  try {
    const before = fingerprint(root);
    expect(await run(["--dir", root])).toBe(0);
    expect(fingerprint(root)).toBe(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a full run creates no files of its own", async () => {
  const root = fixture();
  try {
    const count = (d: string): number =>
      readdirSync(d).reduce((n, name) => {
        const full = join(d, name);
        return n + (statSync(full).isDirectory() ? count(full) : 1);
      }, 0);
    const before = count(root);
    await run(["--dir", root]);
    expect(count(root)).toBe(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the same input produces the same numbers on every run", async () => {
  // "It won't change results" also means run-to-run. Everything but the generation
  // timestamp must be stable, or two runs an hour apart are not comparable.
  const root = fixture();
  try {
    const strip = (s: string) => s.replace(/"generatedAt":\s*"[^"]*"/g, '"generatedAt":"FIXED"');
    const once = async () => {
      const proc = Bun.spawn(["bun", "run", CLI, "--dir", root, "--json"], { stdout: "pipe" });
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      return strip(out);
    };
    expect(await once()).toBe(await once());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no prompt text reaches the output", async () => {
  const root = fixture();
  try {
    const proc = Bun.spawn(["bun", "run", CLI, "--dir", root, "--json"], { stdout: "pipe" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    expect(out).not.toContain("SECRET_CANARY_READONLY");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--html writes exactly one file, and only where asked", async () => {
  const root = fixture();
  const out = join(tmpdir(), `ts-ro-doc-${Date.now()}.html`);
  try {
    const before = fingerprint(root);
    expect(await run(["--dir", root, "--html", out])).toBe(0);
    expect(fingerprint(root)).toBe(before);       // the input tree is still untouched
    expect(statSync(out).size).toBeGreaterThan(1000);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { force: true });
  }
});
