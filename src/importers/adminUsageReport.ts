import { createHash } from "node:crypto";
import type { ServiceTier, UsageEvent } from "../types";
import { isCount, TIERS } from "./shared";

export interface AdminImportProvenance {
  pages: number;
  buckets: number;
  results: number;
  imported: number;
  malformed: number;
  deduped: number;
  /** Results whose tier has no published price multiplier — priced later, or not at all. */
  unpriceableTier: number;
}

export interface AdminImportResult {
  events: UsageEvent[];
  provenance: AdminImportProvenance;
}

/**
 * Anthropic's Admin usage report, `GET /v1/organizations/usage_report/messages`.
 *
 * This is the path for an organisation that does not run Claude Code: a read-only admin
 * key, no integration, no traffic through us, and no prompt content anywhere in the
 * payload — the report is counts and dimensions only, which is the same content-blind
 * footing the transcript importer stands on.
 *
 * The report already carries what the levers need: the cache-write TTL split
 * (`cache_creation.ephemeral_{5m,1h}_input_tokens`), `service_tier`, `inference_geo`,
 * `context_window`, and — with the `fast-mode-2026-02-01` beta — `speed`.
 *
 * **What it cannot support.** These are aggregate buckets, not requests. There are no
 * timestamps per call and no session, so anything that needs the gap between consecutive
 * turns — TTL right-sizing above all — cannot be computed from this source. It can report
 * the *exposure* (how many tokens were written at 1h) but never the *saving*, because
 * whether five minutes would have sufficed is unknowable here. A detector that silently
 * returned 0 on this input would be worse than one that refuses.
 */
export function importAdminUsageReport(
  pages: readonly any[],
  opts: { seen?: Set<string>; accountFallback?: string } = {},
): AdminImportResult {
  const events: UsageEvent[] = [];
  const seen = opts.seen ?? new Set<string>();
  const p: AdminImportProvenance = {
    pages: 0, buckets: 0, results: 0, imported: 0, malformed: 0, deduped: 0, unpriceableTier: 0,
  };

  for (const page of pages) {
    p.pages++;
    for (const bucket of page?.data ?? []) {
      p.buckets++;
      const startingAt = bucket?.starting_at;
      if (typeof startingAt !== "string") { p.malformed++; continue; }

      for (const r of bucket?.results ?? []) {
        p.results++;

        const model = r?.model;
        if (typeof model !== "string" || model === "") { p.malformed++; continue; }

        const cc = r?.cache_creation ?? {};
        const cacheCreation5mTokens = cc.ephemeral_5m_input_tokens ?? 0;
        const cacheCreation1hTokens = cc.ephemeral_1h_input_tokens ?? 0;
        const inputTokens = r?.uncached_input_tokens ?? 0;
        const cacheReadTokens = r?.cache_read_input_tokens ?? 0;
        const outputTokens = r?.output_tokens ?? 0;

        const counts = [
          inputTokens, cacheReadTokens, outputTokens,
          cacheCreation5mTokens, cacheCreation1hTokens,
        ];
        if (!counts.every(isCount)) { p.malformed++; continue; }

        const tier: ServiceTier | null =
          typeof r?.service_tier === "string" && TIERS.includes(r.service_tier)
            ? (r.service_tier as ServiceTier)
            : null;
        if (tier !== null && tier !== "standard" && tier !== "batch") p.unpriceableTier++;

        // A bucket is identified by its window plus every dimension it was grouped on.
        // Two groups inside one bucket must not collide, and re-importing the same window
        // must not double-count — so the key is derived, never synthesised from a counter.
        const canonical = [
          "admin_usage_report", startingAt, bucket?.ending_at ?? "", model,
          r?.workspace_id ?? "", r?.account_id ?? "", r?.api_key_id ?? "",
          r?.service_account_id ?? "", tier ?? "", r?.context_window ?? "",
          r?.inference_geo ?? "", r?.speed ?? "",
        ].join("|");
        const idempotencyKey =
          "admin:" + createHash("sha256").update(canonical).digest("hex").slice(0, 32);

        if (seen.has(idempotencyKey)) { p.deduped++; continue; }
        seen.add(idempotencyKey);

        events.push({
          idempotencyKey,
          accountId: r?.account_id ?? opts.accountFallback ?? "org",
          // The workspace is the cost centre an organisation already thinks in.
          projectId: r?.workspace_id ?? "default",
          ts: startingAt,
          // Aggregate buckets have no session. Anything session-shaped must decline to run.
          sessionId: null,
          source: "admin_usage_report",
          serviceTier: tier,
          model,
          inputTokens,
          cacheReadTokens,
          cacheCreationTokens: cacheCreation5mTokens + cacheCreation1hTokens,
          outputTokens,
          cacheCreation5mTokens,
          cacheCreation1hTokens,
          // Compaction is not broken out in the aggregate report; it is already folded
          // into the totals, so claiming a share here would be inventing one.
          compactionInputTokens: 0,
          compactionOutputTokens: 0,
        });
        p.imported++;
      }
    }
  }

  return { events, provenance: p };
}
