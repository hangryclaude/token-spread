/**
 * Phase 0 benchmark — does prompt caching actually cut the bill, on real API calls?
 *
 * Two arms, run against the live Anthropic API:
 *   A (baseline) — a multi-turn agentic session with NO cache_control breakpoints.
 *   B (cached)   — the SAME model, the SAME messages, byte for byte, WITH breakpoints.
 *
 * Because both arms send identical content to an identical model, there is no quality
 * question to grade: cache_control changes billing and latency, never what the model
 * reads. That is why this harness has no LLM-judge and no answer grader — the entire
 * class of "did the cheap model do as well" bugs does not exist here.
 *
 * Deliberate design choices (each fixes a real flaw found reviewing an earlier draft):
 *  - Costs come from src/pricing.ts's costOfEvent, imported, never reimplemented, so the
 *    benchmark can never disagree with the product's own pricing math.
 *  - Arm B FAILS LOUDLY if the cache never actually hits, rather than quietly reporting
 *    0% savings as a successful run.
 *  - No eval of model output anywhere; nothing generated is ever executed.
 *  - Estimated cost is printed and must be confirmed with --yes before a paid call.
 */

import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "node:fs";
import { costOfEvent, microCentsToCents, formatCents } from "../src/pricing";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import type { UsageEvent } from "../src/types";

const MODEL = "claude-opus-5";
const TURNS = Number(process.env.BENCH_TURNS ?? 8);
const CONFIRMED = process.argv.includes("--yes");

/** A stable prefix: the thing a real agent resends on every single turn. */
const SYSTEM_PROMPT = `You are a senior TypeScript engineer working in a large monorepo.

Conventions you always follow:
- Prefer small, pure, well-named functions over clever one-liners.
- All monetary values are integer micro-cents; never floating point.
- Every exported function needs an explicit return type.
- Errors are values where practical; throw only for programmer error.
- Match the surrounding file's idiom: naming, comment density, import style.
- Comments explain WHY, never restating what the line does.
- No new dependencies without flagging it first.

When asked to build something, reply with a short plan and then the code.
Keep replies focused; skip preamble.`.repeat(6); // ~ realistic agent prefix size

/** Turns of a plausible "build X, then build Y" session. */
const TURN_PROMPTS: string[] = [
  "Write a function `clamp(n, lo, hi)` that clamps a number. Include the return type.",
  "Now add `lerp(a, b, t)` alongside it, same file conventions.",
  "Add a `Range` interface and a `contains(range, n)` helper.",
  "Write `intersect(a: Range, b: Range): Range | null`.",
  "Add a `union` that returns the smallest range covering both.",
  "Write a short test plan for these five functions. No code, just the cases.",
  "Which of those cases would catch an off-by-one in `contains`?",
  "Summarise the module's public API in five bullet points.",
  "Add a `clampRange(r: Range, bounds: Range): Range` function.",
  "What edge case in `intersect` is easiest to get wrong?",
  "Write the signature only for a `split(r: Range, at: number)` helper.",
  "Name three properties this module should satisfy under property-based testing.",
];

type Block = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

function toEvent(usage: Anthropic.Messages.Usage, tag: string): UsageEvent {
  return {
    idempotencyKey: tag,
    accountId: "bench",
    projectId: "bench",
    ts: new Date().toISOString(),
    source: "claude_code",
    model: MODEL,
    inputTokens: usage.input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
  };
}

interface ArmResult {
  arm: "baseline" | "cached";
  microCents: number;
  totals: { input: number; cacheRead: number; cacheWrite: number; output: number };
  replies: string[];
}

async function runArm(
  client: Anthropic,
  arm: "baseline" | "cached",
  turns: number,
): Promise<ArmResult> {
  // Both arms build the SAME conversation. The only difference is whether
  // cache_control breakpoints are attached — the text is byte-identical.
  const history: Anthropic.Messages.MessageParam[] = [];
  const replies: string[] = [];
  let microCents = 0;
  const totals = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

  for (let i = 0; i < turns; i++) {
    const prompt = TURN_PROMPTS[i % TURN_PROMPTS.length]!;

    const systemBlocks: Block[] = [{ type: "text", text: SYSTEM_PROMPT }];
    if (arm === "cached") {
      // Breakpoint 1: end of the stable system prefix — read on every later turn.
      systemBlocks[0]!.cache_control = { type: "ephemeral" };
    }

    const messages: Anthropic.Messages.MessageParam[] = [
      ...history,
      { role: "user", content: prompt },
    ];

    // Breakpoint 2 (cached arm only): a rolling anchor at the end of the newest
    // turn, so the next request reads the whole accumulated prefix.
    if (arm === "cached" && messages.length > 1) {
      const anchor = messages[messages.length - 2]!;
      if (typeof anchor.content === "string") {
        anchor.content = [
          { type: "text", text: anchor.content, cache_control: { type: "ephemeral" } },
        ] as unknown as Anthropic.Messages.MessageParam["content"];
      }
    }

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: systemBlocks as unknown as Anthropic.Messages.TextBlockParam[],
      messages,
    });

    const ev = toEvent(res.usage, `${arm}-${i}`);
    const priced = costOfEvent(ev, CARD);
    if (!priced.ok) {
      throw new Error(`pricing failed on ${arm} turn ${i}: ${priced.reason} (model ${MODEL})`);
    }
    microCents += priced.microCents;
    totals.input += ev.inputTokens;
    totals.cacheRead += ev.cacheReadTokens;
    totals.cacheWrite += ev.cacheCreationTokens;
    totals.output += ev.outputTokens;

    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    replies.push(text);
    history.push({ role: "user", content: prompt });
    history.push({ role: "assistant", content: text });

    process.stdout.write(
      `  ${arm} turn ${String(i + 1).padStart(2)}/${turns}  ` +
      `in=${String(ev.inputTokens).padStart(6)} read=${String(ev.cacheReadTokens).padStart(7)} ` +
      `write=${String(ev.cacheCreationTokens).padStart(6)} out=${String(ev.outputTokens).padStart(4)}\n`,
    );
  }

  return { arm, microCents, totals, replies };
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Export a key and re-run.");
    process.exit(1);
  }

  // Rough pre-flight estimate so nobody spends blind. Deliberately conservative.
  const estCents = Math.ceil(TURNS * TURNS * 1.2);
  console.log(`\nPhase 0 benchmark — prompt caching, measured on real API calls`);
  console.log(`model ${MODEL} · ${TURNS} turns per arm · 2 arms\n`);
  console.log(`Rough cost estimate: under ${formatCents(estCents)} total.`);
  if (!CONFIRMED) {
    console.log(`\nThis makes ${TURNS * 2} paid API calls. Re-run with --yes to proceed.\n`);
    process.exit(0);
  }

  const client = new Anthropic();

  console.log(`\nArm A — baseline (no cache_control)`);
  const a = await runArm(client, "baseline", TURNS);
  console.log(`\nArm B — cached (identical content + breakpoints)`);
  const b = await runArm(client, "cached", TURNS);

  // The load-bearing assertion: if the cache never hit, this run proves nothing.
  if (b.totals.cacheRead === 0) {
    console.error(
      `\nFAIL: arm B recorded zero cache-read tokens — the cache never hit, so this run ` +
      `does not demonstrate anything. Common causes: the stable prefix is below the ` +
      `model's minimum cacheable size (512 tokens on Opus 5), or the prefix changed ` +
      `between turns.`,
    );
    process.exit(1);
  }

  const saved = a.microCents - b.microCents;
  const pct = (saved / a.microCents) * 100;
  const hitRate = b.totals.cacheRead / (b.totals.cacheRead + b.totals.input);

  // Output equivalence, reported honestly. Identical bytes are NOT expected —
  // LLM inference is not deterministic — and their absence is not a quality signal,
  // because both arms sent identical content to an identical model.
  let exact = 0;
  for (let i = 0; i < a.replies.length; i++) if (a.replies[i] === b.replies[i]) exact++;

  console.log(`\n${"=".repeat(58)}`);
  console.log(`  baseline (no cache)   ${formatCents(microCentsToCents(a.microCents)).padStart(10)}`);
  console.log(`  cached                ${formatCents(microCentsToCents(b.microCents)).padStart(10)}`);
  console.log(`  saved                 ${formatCents(microCentsToCents(saved)).padStart(10)}   ${pct.toFixed(1)}%`);
  console.log(`  observed hit rate     ${(hitRate * 100).toFixed(1).padStart(9)}%`);
  console.log(`  identical replies     ${String(exact).padStart(6)}/${a.replies.length}   (not expected to be 100% — see note)`);
  console.log(`${"=".repeat(58)}`);
  console.log(
    `\nNote: both arms sent the same model the same tokens. cache_control changes\n` +
    `billing and latency only, so a differing reply reflects ordinary sampling\n` +
    `nondeterminism, not a quality change. Byte-identity is guaranteed only for an\n` +
    `exact-match response cache (returning stored bytes), which this run does not test.\n`,
  );

  const out = {
    model: MODEL, turns: TURNS, ranAt: new Date().toISOString(),
    baseline: { microCents: a.microCents, totals: a.totals },
    cached: { microCents: b.microCents, totals: b.totals },
    savedMicroCents: saved, savedPct: +pct.toFixed(2),
    observedHitRate: +hitRate.toFixed(4),
    identicalReplies: exact, totalReplies: a.replies.length,
  };
  writeFileSync("bench/result.json", JSON.stringify(out, null, 2));
  console.log(`Wrote bench/result.json\n`);
}

main().catch((err) => {
  console.error("\nBenchmark failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
