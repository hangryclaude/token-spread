/**
 * One arm of the side-by-side terminal demo.
 *
 *   bun run bench/demo.ts --arm without
 *   bun run bench/demo.ts --arm with
 *
 * Both arms replay the SAME real events, in the same order, at the same rate. The
 * only difference is the rate applied to a cache-read token: arm `without` bills it
 * as fresh input, arm `with` bills it at 0.1x. Nothing is simulated and nothing is
 * re-generated — these responses were produced once, months of work ago, and are
 * being priced twice.
 *
 * The panes stay in lockstep by wall clock, not by message passing: each computes
 * which event index it should be showing from elapsed time. A slow pane drops frames
 * instead of drifting, so the two totals always correspond to the same event.
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { costOfEvent } from "../src/pricing";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import type { UsageEvent } from "../src/types";
import { arg, usd, n } from "./util";

const ARM = (arg("arm", "with") as "with" | "without");
const SECONDS = Number(arg("seconds", "26"));
const START_AT = Number(arg("start", "0"));       // epoch ms, for pane sync
const SNAP = arg("snapshot", join(import.meta.dir, ".snapshot.json"))!;

const ON = ARM === "with";
const ACCENT = ON ? "\x1b[38;5;42m" : "\x1b[38;5;203m";
const DIM = "\x1b[38;5;244m";
const BOLD = "\x1b[1m";
const R = "\x1b[0m";

interface Lean { m: string; i: number; r: number; w5: number; w1: number; o: number; tier: UsageEvent["serviceTier"] }
const snap = JSON.parse(readFileSync(SNAP, "utf8")) as { takenAt: string; files: number; events: Lean[] };
const events: UsageEvent[] = snap.events.map((x, k) => ({
  idempotencyKey: String(k), accountId: "local", projectId: "-", ts: "", sessionId: null,
  source: "claude_code", serviceTier: x.tier, model: x.m,
  inputTokens: x.i, cacheReadTokens: x.r, cacheCreationTokens: x.w5 + x.w1,
  cacheCreation5mTokens: x.w5, cacheCreation1hTokens: x.w1, outputTokens: x.o,
  compactionInputTokens: 0, compactionOutputTokens: 0,
}));

/** Arm A bills cache reads as fresh input, and pays no write premium it never made. */
const priced = events.map((e) => {
  const ev = ON ? e : {
    ...e,
    inputTokens: e.inputTokens + e.cacheReadTokens + e.cacheCreationTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    // Must stay in sync with cacheCreationTokens above, or costOfEvent refuses the
    // event as malformed instead of pricing it.
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  };
  const c = costOfEvent(ev, CARD);
  const tok = e.inputTokens + e.cacheReadTokens + e.cacheCreationTokens + e.outputTokens;
  return { model: e.model, tok, uc: c.ok ? c.microCents : 0, ok: c.ok };
}).filter((x) => x.ok);

const GRAND = priced.reduce((s, x) => s + x.uc, 0);

const t0 = START_AT || Date.now();
const cols = () => Math.max(40, process.stdout.columns || 60);

function draw(i: number, spent: number, tok: number, done: boolean) {
  const w = cols();
  const inner = w - 4;
  const p = priced.length ? i / priced.length : 1;
  const filled = Math.round(inner * p);
  const title = ON ? " WITH  Tokens Saved " : " WITHOUT  Tokens Saved ";
  const sub = ON ? "cache reads billed at 0.1x" : "every token billed at full input rate";

  let s = "\x1b[H\x1b[J";
  s += `${ACCENT}${BOLD}${title.padEnd(w - 2)}${R}\n`;
  s += `${DIM}  ${sub}${R}\n\n`;
  s += `${DIM}  events${R}  ${n(i).padStart(9)} ${DIM}/ ${n(priced.length)}${R}\n`;
  s += `${DIM}  tokens${R}  ${n(tok).padStart(9)}\n\n`;
  s += `${ACCENT}${BOLD}  ${usd(spent)}${R}\n\n`;
  s += `  ${ACCENT}${"█".repeat(filled)}${DIM}${"░".repeat(Math.max(0, inner - filled))}${R}\n`;
  if (done) {
    s += `\n${DIM}  ${n(priced.length)} events · one generation, priced ${ON ? "with" : "without"} caching${R}\n`;
    s += `${ACCENT}${BOLD}  TOTAL ${usd(GRAND)}${R}\n`;
  }
  process.stdout.write(s);
}

let last = -1;
const timer = setInterval(() => {
  const elapsed = (Date.now() - t0) / 1000;
  const p = Math.min(1, Math.max(0, elapsed / SECONDS));
  // ease-out so the big numbers land readably rather than blurring past
  const eased = 1 - Math.pow(1 - p, 2);
  const i = Math.floor(eased * priced.length);
  if (i === last && p < 1) return;
  last = i;

  let spent = 0, tok = 0;
  for (let k = 0; k < i; k++) { spent += priced[k].uc; tok += priced[k].tok; }
  draw(i, spent, tok, p >= 1);

  if (p >= 1) clearInterval(timer);
}, 60);
