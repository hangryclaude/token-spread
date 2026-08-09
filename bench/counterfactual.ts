/**
 * The A/B that needs no API key, because the traffic already happened.
 *
 * The two-arm live benchmark in `benchmark.ts` answers "same prompt, two billing
 * configurations, what changes?" by spending money. This answers the same question
 * from real history instead: take every metered event on this machine and reprice it
 * twice, against the same rate card.
 *
 *   ARM A — without   every cache-read token billed as a fresh input token
 *   ARM B — with      the bill as it was actually charged
 *
 * The two arms are the same events, same models, same token counts, and the same
 * outputs — those outputs were produced once, and are not being re-sampled. So this
 * is a stronger identity guarantee than a live A/B can offer, not a weaker one: there
 * is exactly one generation, priced two ways.
 *
 * What it is NOT: evidence that a cache can be *added* to traffic that lacks one. It
 * measures what an existing cache is already worth. A prospect at 7% starts far from
 * arm B and the gap is theirs to close; the audit is what measures their real start.
 *
 *   bun run bench/counterfactual.ts [--dir <path>] [--top 12]
 */
import { basename, join } from "node:path";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { costOfEvent } from "../src/pricing";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import type { UsageEvent } from "../src/types";

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

const dir = arg("dir", join(process.env.HOME ?? "", ".claude", "projects"))!;
const topN = Number(arg("top", "12"));

function* transcripts(root: string): Generator<{ path: string; projectId: string }> {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) {
      for (const f of readdirSync(full)) if (f.endsWith(".jsonl")) yield { path: join(full, f), projectId: entry };
    } else if (entry.endsWith(".jsonl")) {
      yield { path: full, projectId: basename(root) };
    }
  }
}

const seen = new Set<string>();
const events: UsageEvent[] = [];
let files = 0;
for (const { path, projectId } of transcripts(dir)) {
  files++;
  const lines = readFileSync(path, "utf8").split("\n");
  events.push(...importClaudeCodeJsonl(lines, { projectId, seen }).events);
}

/** Arm A: the same event with its cache reads moved into the fresh-input bucket. */
const uncached = (e: UsageEvent): UsageEvent => ({
  ...e,
  inputTokens: e.inputTokens + e.cacheReadTokens + e.cacheCreationTokens,
  cacheReadTokens: 0,
  // A run that never caches never pays the write premium either. Charging arm A for
  // writes it would not have made is the thing that would make this number a lie.
  cacheCreationTokens: 0,
});

interface Row { withCache: number; without: number; events: number; tokens: number }
const zero = (): Row => ({ withCache: 0, without: 0, events: 0, tokens: 0 });

const total = zero();
const byModel = new Map<string, Row>();
const byProject = new Map<string, Row>();
let skipped = 0;

for (const e of events) {
  const b = costOfEvent(e, CARD);
  const a = costOfEvent(uncached(e), CARD);
  if (!b.ok || !a.ok) { skipped++; continue; }
  const tok = e.inputTokens + e.cacheReadTokens + e.cacheCreationTokens + e.outputTokens;
  for (const [map, key] of [[byModel, e.model], [byProject, e.projectId]] as const) {
    const r = map.get(key) ?? zero();
    r.withCache += b.microCents; r.without += a.microCents; r.events++; r.tokens += tok;
    map.set(key, r);
  }
  total.withCache += b.microCents; total.without += a.microCents; total.events++; total.tokens += tok;
}

const usd = (uc: number) => "$" + (uc / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (x: number) => x.toLocaleString("en-US");
const pct = (r: Row) => r.without === 0 ? 0 : ((r.without - r.withCache) / r.without) * 100;

const W = 74;
const line = (c = "─") => console.log(c.repeat(W));

console.log();
line("═");
console.log("  TOKENS SAVED — counterfactual on real traffic");
console.log(`  ${n(files)} transcripts · ${n(total.events)} priced events · rate card ${CARD.capturedAt}`);
line("═");
console.log();
console.log("  Same events. Same models. Same outputs — generated once, priced twice.");
console.log();
console.log(`    WITHOUT caching   ${usd(total.without).padStart(14)}`);
console.log(`    WITH caching      ${usd(total.withCache).padStart(14)}`);
console.log(`    ${"─".repeat(32)}`);
console.log(`    saved             ${usd(total.without - total.withCache).padStart(14)}   ${pct(total).toFixed(1)}%`);
console.log();
console.log(`    tokens            ${n(total.tokens).padStart(14)}`);
console.log(`    blended $/MTok    ${(total.without / 1e8 / (total.tokens / 1e6)).toFixed(3).padStart(14)}  →  ${(total.withCache / 1e8 / (total.tokens / 1e6)).toFixed(3)}`);
console.log();

const table = (title: string, map: Map<string, Row>, limit: number) => {
  const rows = [...map.entries()].sort((x, y) => (y[1].without - y[1].withCache) - (x[1].without - x[1].withCache)).slice(0, limit);
  line();
  console.log(`  ${title}`);
  line();
  console.log(`  ${"".padEnd(30)}${"without".padStart(13)}${"with".padStart(12)}${"saved".padStart(13)}${"cut".padStart(7)}`);
  for (const [k, r] of rows) {
    const label = k.length > 29 ? "…" + k.slice(-28) : k;
    console.log(`  ${label.padEnd(30)}${usd(r.without).padStart(13)}${usd(r.withCache).padStart(12)}${usd(r.without - r.withCache).padStart(13)}${(pct(r).toFixed(0) + "%").padStart(7)}`);
  }
  console.log();
};

table("BY MODEL", byModel, 10);
table(`BY PROJECT — top ${topN} by dollars saved`, byProject, topN);

if (skipped) console.log(`  ! ${n(skipped)} event(s) skipped (unknown model or malformed counts)\n`);
console.log("  Cache reads bill at 0.1x input. Arm A is charged no write premium, because");
console.log("  a run that never caches never writes one.\n");
