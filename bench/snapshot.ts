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
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { findTranscripts } from "../src/walk";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import type { UsageEvent } from "../src/types";
import { arg } from "./util";

const dir = arg("dir", join(process.env.HOME ?? "", ".claude", "projects"))!;
const out = arg("out", join(import.meta.dir, ".snapshot.json"))!;

const seen = new Set<string>();
const events: UsageEvent[] = [];
let files = 0;
for (const { path, projectId } of findTranscripts(dir)) {
  files++;
  events.push(...importClaudeCodeJsonl(readFileSync(path, "utf8").split("\n"), { projectId, seen }).events);
}
events.sort((a, b) => a.ts.localeCompare(b.ts));

// Only what pricing needs. Nothing here can carry content even by accident. w5/w1 and
// tier are carried (not just the write total) because costOfEvent needs the TTL split
// and the tier multiplier — collapsing either loses information demo.ts must reconstruct.
const lean = events.map((e) => ({
  m: e.model,
  i: e.inputTokens,
  r: e.cacheReadTokens,
  w5: e.cacheCreation5mTokens,
  w1: e.cacheCreation1hTokens,
  o: e.outputTokens,
  tier: e.serviceTier,
}));

writeFileSync(out, JSON.stringify({ takenAt: new Date().toISOString(), files, events: lean }));
console.log(`snapshot: ${lean.length} events from ${files} transcripts -> ${out}`);
