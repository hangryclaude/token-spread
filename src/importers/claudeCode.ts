import { createHash } from "node:crypto";
import type { ServiceTier, UsageEvent } from "../types";
import { isCount, TIERS } from "./shared";

export interface ImportProvenance {
  linesSeen: number;
  imported: number;
  malformed: number;
  deduped: number;
  synthesizedKeys: number;
  skippedNonAssistant: number;
  /** Requests that carried a compaction sampling step. */
  compactionEvents: number;
  /**
   * Cache-write tokens whose TTL the source did not report. Billed here at the cheaper
   * 5-minute rate, so the reported cost for those is a floor, not a fact.
   */
  unknownTtlWrites: number;
  /** Tokens a reader of the top-level `usage` fields alone would have missed. */
  hiddenInputTokens: number;
  hiddenOutputTokens: number;
  /**
   * Records carrying `usage.output_tokens_details` — the only place the extended-thinking
   * share of output is reported.
   *
   * Measured 2026-08-12 across this machine: 0 of 108,042 usage records in 1,661 transcripts
   * carried it. Extended thinking still bills as output, so the TOTAL cost here is right; what
   * cannot be answered from this source is how much of that output was thinking. Counted rather
   * than assumed, because "we did not look" and "we looked and it is never there" are different
   * claims and only one of them belongs in a report that sells traceability.
   */
  thinkingDetailRecords: number;
  /**
   * Paginated API responses and their `bucket_width` time windows read — an admin-usage-report
   * concept with no transcript analogue, always 0 on a transcript-only run. Carried on this
   * shared shape, not a separate one, so cli.ts's provenance merge is the same exhaustive
   * Object.keys loop for both sources; a second shape would need its own merge and its own
   * chance to drop a field silently, which is exactly how `pages` and `buckets` went missing
   * from the report until 2026-08-21.
   */
  pages: number;
  buckets: number;
  /** Results whose service tier carried no published price multiplier. Admin-only, like `pages`. */
  unpriceableTier: number;
}

export interface ImportResult {
  events: UsageEvent[];
  provenance: ImportProvenance;
}

/** The token counts read off a `usage` object or one `usage.iterations` entry. */
interface Counts {
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
}

const ZERO: Counts = {
  inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0,
  cacheCreation5mTokens: 0, cacheCreation1hTokens: 0,
};

/**
 * `usage.cache_creation` carries the TTL split — and it is the difference between
 * 1.25x and 2x base input on every written token. Measured 2026-08-11 across real
 * transcripts: 100% of cache writes were 1h, so treating the total as 5m under-charged
 * the sample by ~25% of its whole bill.
 *
 * When the split is absent, everything lands in the 5-minute bucket. That is the cheaper
 * reading, so it can only under-state; `provenance.unknownTtlWrites` records how much
 * rests on that assumption.
 */
const readCounts = (u: any): Counts => {
  const total = u?.cache_creation_input_tokens ?? 0;
  const cc = u?.cache_creation;
  const has5m = typeof cc?.ephemeral_5m_input_tokens === "number";
  const has1h = typeof cc?.ephemeral_1h_input_tokens === "number";
  return {
    inputTokens:         u?.input_tokens,
    cacheReadTokens:     u?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: total,
    outputTokens:        u?.output_tokens,
    cacheCreation5mTokens: has5m || has1h ? (cc.ephemeral_5m_input_tokens ?? 0) : total,
    cacheCreation1hTokens: has5m || has1h ? (cc.ephemeral_1h_input_tokens ?? 0) : 0,
  };
};

/** True when the source reported no TTL split for a non-zero write. */
const ttlUnknown = (u: any): boolean => {
  const cc = u?.cache_creation;
  return (u?.cache_creation_input_tokens ?? 0) > 0
    && typeof cc?.ephemeral_5m_input_tokens !== "number"
    && typeof cc?.ephemeral_1h_input_tokens !== "number";
};

const add = (a: Counts, b: Counts): Counts => ({
  inputTokens:         a.inputTokens + b.inputTokens,
  cacheReadTokens:     a.cacheReadTokens + b.cacheReadTokens,
  cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
  outputTokens:        a.outputTokens + b.outputTokens,
  cacheCreation5mTokens: a.cacheCreation5mTokens + b.cacheCreation5mTokens,
  cacheCreation1hTokens: a.cacheCreation1hTokens + b.cacheCreation1hTokens,
});

const valid = (c: Counts): boolean => Object.values(c).every(isCount);

/**
 * Compaction bills a second sampling step, and the response does not fold it into the
 * fields most tooling reads. Anthropic's own words: "The top-level `input_tokens` and
 * `output_tokens` do not include compaction iteration usage" — and "to calculate total
 * tokens consumed and billed for a request, sum across all entries in the
 * `usage.iterations` array."
 *
 * Their documented example reports 23,000 input and bills 203,000. A reader of the top
 * level alone under-reports that request by 8.6x. So: when `iterations` is present, the
 * totals come from the sum and the top level is ignored entirely (it duplicates the
 * `message` entry). When it is absent, the top level is the total.
 *
 * Compaction input is priced at the standard input rate here. Whether the sampling step
 * is eligible for the cache-read discount is undocumented and unresolved — see the open
 * questions in docs/research/2026-08-11-context-survival-register.md. If it turns out to
 * be discounted, this over-states compaction cost; it never under-states it.
 *
 * Claude Code transcripts DO emit `iterations` — measured 2026-08-11, on 9,898 of 9,960
 * assistant records. An earlier revision of this comment claimed they do not, on the
 * strength of the compaction warning never firing; the real reason it never fired is that
 * every iteration seen so far is `type: "message"`, so the compaction share is zero. The
 * summing path is live traffic, not a placeholder.
 */
function totalsFromUsage(u: any): { total: Counts; compaction: Counts } | null {
  const iterations = u?.iterations;
  if (!Array.isArray(iterations) || iterations.length === 0) {
    const total = readCounts(u);
    return valid(total) ? { total, compaction: ZERO } : null;
  }

  let total = ZERO;
  let compaction = ZERO;
  for (const it of iterations) {
    const c = readCounts(it);
    if (!valid(c)) return null;
    total = add(total, c);
    if (it?.type !== "message") compaction = add(compaction, c);
  }
  return { total, compaction };
}

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
    compactionEvents: 0, hiddenInputTokens: 0, hiddenOutputTokens: 0,
    unknownTtlWrites: 0, thinkingDetailRecords: 0, pages: 0, buckets: 0, unpriceableTier: 0,
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

    const totals = totalsFromUsage(u);
    if (!totals) { p.malformed++; continue; }

    const {
      inputTokens, cacheReadTokens, cacheCreationTokens, outputTokens,
      cacheCreation5mTokens, cacheCreation1hTokens,
    } = totals.total;
    const compactionInputTokens  = totals.compaction.inputTokens;
    const compactionOutputTokens = totals.compaction.outputTokens;

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
      ts, sessionId: typeof rec.sessionId === "string" ? rec.sessionId : null,
      source: "claude_code",
      // Transcripts report the tier on usage; it decides the price multiplier.
      serviceTier: TIERS.includes(u?.service_tier) ? u.service_tier : null,
      model,
      inputTokens, cacheReadTokens, cacheCreationTokens, outputTokens,
      cacheCreation5mTokens, cacheCreation1hTokens,
      compactionInputTokens, compactionOutputTokens,
    });
    if (ttlUnknown(u)) p.unknownTtlWrites += cacheCreationTokens;
    if (u && typeof u.output_tokens_details === "object" && u.output_tokens_details !== null) {
      p.thinkingDetailRecords++;
    }
    p.imported++;
    if (compactionInputTokens > 0 || compactionOutputTokens > 0) {
      p.compactionEvents++;
      // What a top-level reader misses is exactly the non-message iterations.
      p.hiddenInputTokens  += compactionInputTokens;
      p.hiddenOutputTokens += compactionOutputTokens;
    }
  }

  return { events, provenance: p };
}
