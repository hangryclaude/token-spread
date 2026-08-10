import { readdirSync } from "node:fs";
import { basename, join } from "node:path";

export interface FoundTranscript {
  path: string;
  /** The top-level project directory, so nested spend lands on the project that caused it. */
  projectId: string;
}

/**
 * Every transcript under `root`, at any depth.
 *
 * Depth matters more than it looks. Claude Code writes subagent transcripts to
 * `<project>/<session-id>/subagents/<kind>/<id>.jsonl` — five levels down. A walker that
 * descended one level, as this one did until 2026-08-11, found 120 of 1,238 files on a
 * real machine and silently ignored every token a subagent ever spent. On agent-heavy
 * traffic that is most of the bill, and it fails as an under-report: quiet, plausible,
 * and in the direction that flatters the tool.
 *
 * Projects are the top-level entries; everything beneath one belongs to it. Attributing a
 * nested transcript to `subagents` or `workflows` would scatter one project's cost across
 * cost centres that do not exist.
 */
export function* findTranscripts(root: string): Generator<FoundTranscript> {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* descend(full, entry.name);
    } else if (entry.name.endsWith(".jsonl")) {
      yield { path: full, projectId: basename(root) };
    }
  }
}

function* descend(dir: string, projectId: string): Generator<FoundTranscript> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // an unreadable directory is not worth failing an entire audit over
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* descend(full, projectId);
    else if (entry.name.endsWith(".jsonl")) yield { path: full, projectId };
  }
}
