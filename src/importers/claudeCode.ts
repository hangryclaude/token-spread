import { createHash } from "node:crypto";
import type { UsageEvent } from "../types";

export interface ImportProvenance {
  linesSeen: number;
  imported: number;
  malformed: number;
  deduped: number;
  synthesizedKeys: number;
  skippedNonAssistant: number;
}

export interface ImportResult {
  events: UsageEvent[];
  provenance: ImportProvenance;
}

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/**
 * Lines in, events out. Pure: no filesystem, no clock, no network.
 * Prompt and response content is never copied out of the parsed line — only the
 * scalar fields below are read, and the parsed object goes out of scope immediately.
 */
export function importClaudeCodeJsonl(
  lines: Iterable<string>,
  opts: {
    projectId: string;
    accountId?: string;
    /**
     * Caller-owned dedup set. Thread one across every file in an import run, or the
     * same requestId appearing in two transcripts is counted twice and inflates the
     * bill. Omitted, dedup is scoped to this call alone.
     */
    seen?: Set<string>;
  },
): ImportResult {
  const accountId = opts.accountId ?? "local";
  const events: UsageEvent[] = [];
  const seen = opts.seen ?? new Set<string>();
  const p: ImportProvenance = {
    linesSeen: 0, imported: 0, malformed: 0,
    deduped: 0, synthesizedKeys: 0, skippedNonAssistant: 0,
  };

  for (const line of lines) {
    if (line.trim() === "") continue;
    p.linesSeen++;

    let rec: any;
    try {
      rec = JSON.parse(line);
    } catch {
      p.malformed++;
      continue;
    }

    if (rec?.type !== "assistant") { p.skippedNonAssistant++; continue; }

    const u = rec?.message?.usage;
    const model = rec?.message?.model;
    const ts = rec?.timestamp;
    if (!u || typeof model !== "string" || typeof ts !== "string") { p.malformed++; continue; }

    const inputTokens         = u.input_tokens;
    const cacheReadTokens     = u.cache_read_input_tokens ?? 0;
    const cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
    const outputTokens        = u.output_tokens;

    if (![inputTokens, cacheReadTokens, cacheCreationTokens, outputTokens].every(isCount)) {
      p.malformed++;
      continue;
    }

    let idempotencyKey: string;
    let synthesized = false;
    if (typeof rec.requestId === "string" && rec.requestId !== "") {
      idempotencyKey = `claude_code:${rec.requestId}`;
    } else {
      // Scoped by tenant: a server-issued requestId is globally unique, but this hash
      // is derived from timestamp + model + token counts, which two different projects
      // can genuinely produce identically. Unscoped, it would collide across tenants
      // the first time slice 2 used it as a ledger primary key.
      const canonical = [
        "claude_code", accountId, opts.projectId, ts, model,
        inputTokens, cacheReadTokens, cacheCreationTokens, outputTokens,
      ].join("|");
      idempotencyKey = "syn:" + createHash("sha256").update(canonical).digest("hex").slice(0, 32);
      synthesized = true;
    }

    if (seen.has(idempotencyKey)) { p.deduped++; continue; }
    seen.add(idempotencyKey);
    if (synthesized) p.synthesizedKeys++;

    events.push({
      idempotencyKey, accountId, projectId: opts.projectId,
      ts, source: "claude_code", model,
      inputTokens, cacheReadTokens, cacheCreationTokens, outputTokens,
    });
    p.imported++;
  }

  return { events, provenance: p };
}
