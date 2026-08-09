/**
 * Freeze the event stream so both demo panes price the identical set.
 *
 * The transcript directory is live — a running Claude Code session appends to it
 * while you read. Two panes that each walk the directory independently land on
 * different event counts and their totals stop corresponding, which is exactly the
 * kind of quiet mismatch this product exists to catch. So the panes never read the
 * directory: they read one snapshot, taken once.
 *
 * The snapshot carries token counts and model ids only — no prompt or response
 * content — the same guarantee UsageEvent makes.
 *
 *   bun run bench/snapshot.ts [--dir <path>] [--out bench/.snapshot.json]
 */
import { basename, join } from "node:path";
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import type { UsageEvent } from "../src/types";

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

const dir = arg("dir", join(process.env.HOME ?? "", ".claude", "projects"))!;
const out = arg("out", join(import.meta.dir, ".snapshot.json"))!;

function* transcripts(root: string): Generator<{ path: string; projectId: string }> {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) {
      for (const f of readdirSync(full)) if (f.endsWith(".jsonl")) yield { path: join(full, f), projectId: entry };
    } else if (entry.endsWith(".jsonl")) yield { path: full, projectId: basename(root) };
  }
}

const seen = new Set<string>();
const events: UsageEvent[] = [];
let files = 0;
for (const { path, projectId } of transcripts(dir)) {
  files++;
  events.push(...importClaudeCodeJsonl(readFileSync(path, "utf8").split("\n"), { projectId, seen }).events);
}
events.sort((a, b) => a.ts.localeCompare(b.ts));

// Only what pricing needs. Nothing here can carry content even by accident.
const lean = events.map((e) => ({
  m: e.model,
  i: e.inputTokens,
  r: e.cacheReadTokens,
  w: e.cacheCreationTokens,
  o: e.outputTokens,
}));

writeFileSync(out, JSON.stringify({ takenAt: new Date().toISOString(), files, events: lean }));
console.log(`snapshot: ${lean.length} events from ${files} transcripts -> ${out}`);
