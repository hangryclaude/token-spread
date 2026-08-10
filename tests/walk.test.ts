import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { findTranscripts } from "../src/walk";

/**
 * Real directories, not mocks: the bug this guards was a walker that descended exactly
 * one level, so a mock of "a directory" would have passed it.
 */
function fixture(): string {
  const root = join(tmpdir(), `ts-walk-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  // A project with a session transcript at the top level...
  mkdirSync(join(root, "proj-a"), { recursive: true });
  writeFileSync(join(root, "proj-a", "session1.jsonl"), "{}\n");
  // ...and subagent transcripts nested three levels deeper, which is where Claude Code
  // actually puts them: <project>/<session-id>/subagents/<kind>/<id>.jsonl
  mkdirSync(join(root, "proj-a", "sess-uuid", "subagents", "workflows", "wf_1"), { recursive: true });
  writeFileSync(join(root, "proj-a", "sess-uuid", "subagents", "workflows", "wf_1", "agent-1.jsonl"), "{}\n");
  writeFileSync(join(root, "proj-a", "sess-uuid", "subagents", "agent-2.jsonl"), "{}\n");
  // A second project, and a non-transcript file that must be ignored.
  mkdirSync(join(root, "proj-b"), { recursive: true });
  writeFileSync(join(root, "proj-b", "session9.jsonl"), "{}\n");
  writeFileSync(join(root, "proj-b", "notes.md"), "not a transcript\n");
  return root;
}

test("finds transcripts at every depth, not just the first", () => {
  const root = fixture();
  try {
    const found = [...findTranscripts(root)];
    expect(found.length).toBe(4);
    expect(found.some((f) => f.path.includes("agent-1.jsonl"))).toBe(true);
    expect(found.some((f) => f.path.includes("agent-2.jsonl"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a nested subagent transcript is attributed to its top-level project", () => {
  // Subagent spend is the project's spend. Attributing it to "subagents" or "workflows"
  // would scatter one project's cost across invented cost centres.
  const root = fixture();
  try {
    for (const f of findTranscripts(root)) {
      expect(["proj-a", "proj-b"]).toContain(f.projectId);
    }
    const nested = [...findTranscripts(root)].find((f) => f.path.includes("agent-1.jsonl"))!;
    expect(nested.projectId).toBe("proj-a");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ignores files that are not transcripts", () => {
  const root = fixture();
  try {
    expect([...findTranscripts(root)].every((f) => f.path.endsWith(".jsonl"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a transcript sitting directly in the root is attributed to the root", () => {
  const root = join(tmpdir(), `ts-walk-flat-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "loose.jsonl"), "{}\n");
  try {
    const found = [...findTranscripts(root)];
    expect(found.length).toBe(1);
    expect(found[0].projectId).toBe(basename(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
