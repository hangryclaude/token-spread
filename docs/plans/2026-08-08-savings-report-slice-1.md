# Token Spread — Savings Report (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure, read-only pipeline that prices real Claude Code usage from local transcripts and reports what the same traffic would cost under caching and model routing.

**Architecture:** Seven small units, six of them pure functions with no I/O, no clock and no global state. Data flows importer → pricing → metrics → simulate → report, with `cli.ts` as the only unit that touches the filesystem. `UsageEvent`, `RateCard` and `costOfEvent` are deliberately shaped as the metering ledger's read half so slice 2 wraps storage around them without modification.

**Tech Stack:** TypeScript on bun (`bun test`, `bun run`). No runtime dependencies. `node:crypto` for hashing only.

**Spec:** `docs/specs/2026-08-08-savings-report-design.md` — read §4, §6 and §9 before starting.

## Global Constraints

- **No runtime dependencies.** Anything beyond the bun/Node standard library needs sign-off first.
- **No floating point in the pricing path.** All money is integer micro-cents (µ¢ = 10⁻⁶ cent). Conversion to cents happens once, at the report boundary, half-up.
- **Fractions are integer percents.** Routable fraction and cache targets are integers 0–100, never floats. This keeps simulation arithmetic exact.
- **No network in slice 1.** Importer A is filesystem-only. No `fetch`, no sockets.
- **No storage.** No database, no cache files, no writes except the report the user asked for.
- **No prompt or response content** may enter a `UsageEvent`, a log line, or the report.
- **Purity:** every unit except `cli.ts` is a pure function of its arguments. No module-level mutable state, no ambient `Date.now()`, no hardcoded `accountId` outside an importer default parameter.
- **Commits:** commit commands are pre-written in each task, but **do not run them without Angus's explicit go-ahead** — his standing rule is no commits unless asked. Complete the work, then ask.
- **Rate card is dated.** `capturedAt: "2026-08-08"`. Sonnet intro pricing lapses 2026-08-31.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types.ts` | `UsageEvent` and shared result types. No logic. |
| `src/rates.ts` | Dated rate card in integer µ¢/token. Single source of truth for prices. |
| `src/pricing.ts` | `costOfEvent()` — the one function the ledger and the invoice must agree on. |
| `src/importers/claudeCode.ts` | JSONL lines → `UsageEvent[]` + provenance. Strips content. |
| `src/metrics.ts` | Observed totals: current cost, cache-hit rate, by-model, by-project. |
| `src/simulate.ts` | Routing curve, cache headroom, and per-lever savings attribution. |
| `src/report.ts` | Assembles metrics + simulation + provenance into a deterministic `Report`. |
| `src/cli.ts` | The only I/O. Resolves paths, reads files, prints JSON and human text. |
| `tests/*.test.ts` | One test file per unit, plus `tests/acceptance.test.ts` for cross-cutting criteria. |
| `fixtures/*.jsonl` + `fixtures/*.expected.json` | Synthetic input with separately hand-computed expected values. |

`src/types.ts` is not named in spec §7. It exists because `UsageEvent` is consumed by
every other unit and giving it a home avoids a circular import. Flagged as a
deliberate, minor deviation.

---

## Task 1: Scaffold and the rate card

**Files:**
- Create: `package.json`, `tsconfig.json`, `src/types.ts`, `src/rates.ts`
- Test: `tests/rates.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `UsageEvent`, `ModelRate`, `RateCard`, `RATE_CARD_2026_08_08`.

- [ ] **Step 1: Scaffold the project**

```bash
cd /Users/angus/dev/token-spread
bun init -y
mkdir -p src/importers tests fixtures
```

Then replace `package.json` with:

```json
{
  "name": "token-spread",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test",
    "report": "bun run src/cli.ts"
  }
}
```

Note there are no `dependencies` and no `devDependencies`. That is intentional.

- [ ] **Step 2: Write `src/types.ts`**

```ts
/** A single metered API interaction. Carries no prompt or response content, by design. */
export interface UsageEvent {
  /** Dedup key in slice 1; ledger primary key in slice 2. */
  idempotencyKey: string;

  /** Billing entity. Slice 1 fills this with a constant. */
  accountId: string;
  /** Cost centre. Slice 1 derives this from the transcript directory name. */
  projectId: string;

  ts: string;
  source: "claude_code" | "admin_usage_report";
  model: string;

  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
}

export const USAGE_EVENT_KEYS = [
  "idempotencyKey", "accountId", "projectId", "ts", "source", "model",
  "inputTokens", "cacheReadTokens", "cacheCreationTokens", "outputTokens",
] as const;
```

`USAGE_EVENT_KEYS` exists so the content-leak test can assert an event has no
extra keys without restating the list.

- [ ] **Step 3: Write the failing rate-card test**

```ts
// tests/rates.test.ts
import { expect, test } from "bun:test";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";

test("every rate is a non-negative integer in micro-cents", () => {
  for (const [model, r] of Object.entries(CARD.rates)) {
    for (const [field, v] of Object.entries(r)) {
      expect(Number.isInteger(v), `${model}.${field} = ${v}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  }
});

test("derived cache rates divide exactly — no silent rounding", () => {
  for (const [model, r] of Object.entries(CARD.rates)) {
    expect(r.input * 10 % 100, `${model} cacheRead`).toBe(0);
    expect(r.input * 125 % 100, `${model} cacheWrite`).toBe(0);
    expect(r.cacheRead).toBe(r.input * 10 / 100);
    expect(r.cacheWrite).toBe(r.input * 125 / 100);
  }
});

test("opus input is 500 micro-cents per token", () => {
  // $5.00 per MTok = 500 cents per 1e6 tokens = 500 micro-cents per token
  expect(CARD.rates["claude-opus-5"].input).toBe(500);
});

test("card is dated", () => {
  expect(CARD.capturedAt).toBe("2026-08-08");
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `bun test tests/rates.test.ts`
Expected: FAIL — `Cannot find module '../src/rates'`

- [ ] **Step 5: Write `src/rates.ts`**

```ts
/** All rates are integer micro-cents (1e-6 cent) per token. */
export interface ModelRate {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface RateCard {
  capturedAt: string;
  rates: Readonly<Record<string, ModelRate>>;
  notes: readonly string[];
}

// $D per MTok == D * 100 micro-cents per token.
// cacheRead = 0.10x input, cacheWrite = 1.25x input — precomputed, see tests.
export const RATE_CARD_2026_08_08: RateCard = {
  capturedAt: "2026-08-08",
  rates: {
    "claude-opus-5":    { input: 500, output: 2500, cacheRead: 50, cacheWrite: 625 },
    "claude-sonnet-5":  { input: 300, output: 1500, cacheRead: 30, cacheWrite: 375 },
    "claude-haiku-4-5": { input: 100, output:  500, cacheRead: 10, cacheWrite: 125 },
  },
  notes: [
    "claude-sonnet-5 intro pricing ($2/$10 per MTok) lapses 2026-08-31.",
  ],
};

/** Days between the card's capture date and `asOf`. Used for the staleness warning. */
export function cardAgeDays(card: RateCard, asOf: Date): number {
  const captured = Date.parse(card.capturedAt + "T00:00:00Z");
  return Math.floor((asOf.getTime() - captured) / 86_400_000);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test tests/rates.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 7: Commit** *(only with Angus's go-ahead — see Global Constraints)*

```bash
git add package.json tsconfig.json src/types.ts src/rates.ts tests/rates.test.ts
git commit -m "feat: scaffold project and dated rate card in integer micro-cents"
```

---

## Task 2: The pricing function

This is the unit slice 2 reuses verbatim. It gets the most tests.

**Files:**
- Create: `src/pricing.ts`
- Test: `tests/pricing.test.ts`

**Interfaces:**
- Consumes: `UsageEvent` (Task 1), `RateCard` (Task 1).
- Produces: `costOfEvent(e, card): PriceResult`, `microCentsToCents(n): number`, `formatCents(n): string`, types `Priced`, `Unpriced`, `PriceResult`.

- [ ] **Step 1: Write the failing test**

Expected values below were computed by hand, not by the code under test.

```ts
// tests/pricing.test.ts
import { expect, test } from "bun:test";
import { costOfEvent, microCentsToCents, formatCents } from "../src/pricing";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import type { UsageEvent } from "../src/types";

function ev(over: Partial<UsageEvent> = {}): UsageEvent {
  return {
    idempotencyKey: "k", accountId: "local", projectId: "p",
    ts: "2026-08-01T00:00:00Z", source: "claude_code", model: "claude-opus-5",
    inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0,
    ...over,
  };
}

test("prices opus input exactly", () => {
  // 18,000,000 tokens x 500 micro-cents = 9,000,000,000 micro-cents = 9000 cents = $90.00
  const r = costOfEvent(ev({ inputTokens: 18_000_000 }), CARD);
  expect(r).toEqual({ ok: true, microCents: 9_000_000_000 });
  expect(microCentsToCents(9_000_000_000)).toBe(9_000);
  expect(formatCents(9_000)).toBe("$90.00");
});

test("prices all four token classes together", () => {
  // opus: 18e6*500 + 42e6*50 + 3e6*625 + 6e6*2500
  //     = 9.000e9  + 2.100e9 + 1.875e9 + 15.000e9 = 27.975e9 micro-cents = $279.75
  const r = costOfEvent(ev({
    inputTokens: 18_000_000, cacheReadTokens: 42_000_000,
    cacheCreationTokens: 3_000_000, outputTokens: 6_000_000,
  }), CARD);
  expect(r).toEqual({ ok: true, microCents: 27_975_000_000 });
  expect(formatCents(microCentsToCents(27_975_000_000))).toBe("$279.75");
});

test("prices haiku at one fifth of opus input", () => {
  // 12e6*100 + 28e6*10 + 2e6*125 + 4e6*500
  //  = 1.200e9 + 0.280e9 + 0.250e9 + 2.000e9 = 3.730e9 micro-cents = $37.30
  const r = costOfEvent(ev({
    model: "claude-haiku-4-5",
    inputTokens: 12_000_000, cacheReadTokens: 28_000_000,
    cacheCreationTokens: 2_000_000, outputTokens: 4_000_000,
  }), CARD);
  expect(r).toEqual({ ok: true, microCents: 3_730_000_000 });
  expect(formatCents(microCentsToCents(3_730_000_000))).toBe("$37.30");
});

test("unknown model is surfaced, never priced at zero", () => {
  expect(costOfEvent(ev({ model: "gpt-9" }), CARD)).toEqual({ ok: false, reason: "unknown_model" });
});

test("negative and non-integer token counts are rejected", () => {
  expect(costOfEvent(ev({ inputTokens: -1 }), CARD)).toEqual({ ok: false, reason: "malformed" });
  expect(costOfEvent(ev({ outputTokens: 1.5 }), CARD)).toEqual({ ok: false, reason: "malformed" });
});

test("never throws, whatever it is handed", () => {
  expect(() => costOfEvent(ev({ model: "", inputTokens: NaN }), CARD)).not.toThrow();
});

test("rounds to cents half-up, once", () => {
  expect(microCentsToCents(1_499_999)).toBe(1);   // 1.499999c -> 1c
  expect(microCentsToCents(1_500_000)).toBe(2);   // 1.5c      -> 2c
  expect(microCentsToCents(0)).toBe(0);
});

test("formats cents with two decimal places", () => {
  expect(formatCents(0)).toBe("$0.00");
  expect(formatCents(5)).toBe("$0.05");
  expect(formatCents(317_05)).toBe("$317.05");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test tests/pricing.test.ts`
Expected: FAIL — `Cannot find module '../src/pricing'`

- [ ] **Step 3: Write `src/pricing.ts`**

```ts
import type { RateCard } from "./rates";
import type { UsageEvent } from "./types";

export type Priced   = { ok: true;  microCents: number };
export type Unpriced = { ok: false; reason: "unknown_model" | "malformed" };
export type PriceResult = Priced | Unpriced;

/**
 * The single pricing function. Slice 2's ledger imports this unchanged — if the
 * report and the invoice ever disagree, the product is dead. Total: never throws.
 */
export function costOfEvent(e: UsageEvent, card: RateCard): PriceResult {
  const rate = card.rates[e.model];
  if (!rate) return { ok: false, reason: "unknown_model" };

  const counts = [e.inputTokens, e.cacheReadTokens, e.cacheCreationTokens, e.outputTokens];
  if (counts.some((t) => !Number.isInteger(t) || t < 0)) {
    return { ok: false, reason: "malformed" };
  }

  return {
    ok: true,
    microCents:
      e.inputTokens * rate.input +
      e.cacheReadTokens * rate.cacheRead +
      e.cacheCreationTokens * rate.cacheWrite +
      e.outputTokens * rate.output,
  };
}

/** Half-up. Call this once, at the report boundary — never per event. */
export function microCentsToCents(microCents: number): number {
  return Math.floor(microCents / 1_000_000 + 0.5);
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/pricing.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit** *(only with go-ahead)*

```bash
git add src/pricing.ts tests/pricing.test.ts
git commit -m "feat: exact integer micro-cent pricing function"
```

---

## Task 3: The Claude Code importer

**Files:**
- Create: `src/importers/claudeCode.ts`, `fixtures/mixed.jsonl`, `fixtures/dupes.jsonl`, `fixtures/malformed.jsonl`, `fixtures/nokey.jsonl`
- Test: `tests/importer.test.ts`

**Interfaces:**
- Consumes: `UsageEvent` (Task 1).
- Produces: `importClaudeCodeJsonl(lines, opts): ImportResult`, type `ImportResult` with `{ events, provenance }` where provenance is `{ linesSeen, imported, malformed, deduped, synthesizedKeys, skippedNonAssistant }`.

The importer takes an iterable of **lines**, not a path. Reading files is `cli.ts`'s
job. This keeps the importer pure and lets tests feed it strings.

- [ ] **Step 1: Write the fixtures**

`fixtures/mixed.jsonl` — two models, hand-computed totals:

```
{"type":"assistant","timestamp":"2026-08-01T10:00:00Z","requestId":"req_a","message":{"model":"claude-opus-5","content":[{"type":"text","text":"SECRET_CANARY_ALPHA"}],"usage":{"input_tokens":18000000,"cache_read_input_tokens":42000000,"cache_creation_input_tokens":3000000,"output_tokens":6000000}}}
{"type":"assistant","timestamp":"2026-08-01T10:05:00Z","requestId":"req_b","message":{"model":"claude-haiku-4-5","content":[{"type":"text","text":"SECRET_CANARY_BETA"}],"usage":{"input_tokens":12000000,"cache_read_input_tokens":28000000,"cache_creation_input_tokens":2000000,"output_tokens":4000000}}}
{"type":"user","timestamp":"2026-08-01T10:04:00Z","message":{"content":"SECRET_CANARY_GAMMA"}}
```

Hand-computed: opus $279.75 + haiku $37.30 = **$317.05** total, and the two
`SECRET_CANARY_*` strings must never appear downstream.

`fixtures/dupes.jsonl`:

```
{"type":"assistant","timestamp":"2026-08-01T11:00:00Z","requestId":"req_x","message":{"model":"claude-opus-5","usage":{"input_tokens":1000000,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"output_tokens":0}}}
{"type":"assistant","timestamp":"2026-08-01T11:00:00Z","requestId":"req_x","message":{"model":"claude-opus-5","usage":{"input_tokens":1000000,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"output_tokens":0}}}
```

`fixtures/malformed.jsonl`:

```
{"type":"assistant","timestamp":"2026-08-01T12:00:00Z","requestId":"req_neg","message":{"model":"claude-opus-5","usage":{"input_tokens":-5,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"output_tokens":0}}}
{"type":"assistant","timestamp":"2026-08-01T12:01:00Z","requestId":"req_unk","message":{"model":"some-other-model","usage":{"input_tokens":1000,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"output_tokens":0}}}
not json at all
{"type":"assistant","timestamp":"2026-08-01T12:02:00Z","requestId":"req_nousage","message":{"model":"claude-opus-5"}}
```

`fixtures/nokey.jsonl`:

```
{"type":"assistant","timestamp":"2026-08-01T13:00:00Z","message":{"model":"claude-opus-5","usage":{"input_tokens":2000000,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"output_tokens":0}}}
{"type":"assistant","timestamp":"2026-08-01T13:00:00Z","message":{"model":"claude-opus-5","usage":{"input_tokens":2000000,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"output_tokens":0}}}
```

The two `nokey` lines are byte-identical apart from nothing — they are the documented
collision case from spec §4.1 and must produce one event plus one `deduped`.

- [ ] **Step 2: Write the failing test**

```ts
// tests/importer.test.ts
import { expect, test } from "bun:test";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { USAGE_EVENT_KEYS } from "../src/types";

const read = (name: string) =>
  Bun.file(`${import.meta.dir}/../fixtures/${name}`).text();

async function lines(name: string) {
  return (await read(name)).split("\n").filter((l) => l.trim() !== "");
}

test("imports only assistant records that carry usage", async () => {
  const r = importClaudeCodeJsonl(await lines("mixed.jsonl"), { projectId: "demo" });
  expect(r.events.length).toBe(2);
  expect(r.provenance.skippedNonAssistant).toBe(1);
});

test("attributes every event to a project and an account", async () => {
  const r = importClaudeCodeJsonl(await lines("mixed.jsonl"), { projectId: "demo" });
  for (const e of r.events) {
    expect(e.projectId).toBe("demo");
    expect(e.accountId).toBe("local");
  }
});

test("namespaces the idempotency key by source", async () => {
  const r = importClaudeCodeJsonl(await lines("mixed.jsonl"), { projectId: "demo" });
  expect(r.events[0].idempotencyKey).toBe("claude_code:req_a");
});

test("carries no key beyond the UsageEvent schema", async () => {
  const r = importClaudeCodeJsonl(await lines("mixed.jsonl"), { projectId: "demo" });
  for (const e of r.events) {
    expect(Object.keys(e).sort()).toEqual([...USAGE_EVENT_KEYS].sort());
  }
});

test("no prompt content survives the import", async () => {
  const r = importClaudeCodeJsonl(await lines("mixed.jsonl"), { projectId: "demo" });
  const dump = JSON.stringify(r);
  for (const canary of ["SECRET_CANARY_ALPHA", "SECRET_CANARY_BETA", "SECRET_CANARY_GAMMA"]) {
    expect(dump).not.toContain(canary);
  }
});

test("drops duplicate idempotency keys and counts them", async () => {
  const r = importClaudeCodeJsonl(await lines("dupes.jsonl"), { projectId: "demo" });
  expect(r.events.length).toBe(1);
  expect(r.provenance.deduped).toBe(1);
});

test("buckets malformed input instead of swallowing it", async () => {
  const r = importClaudeCodeJsonl(await lines("malformed.jsonl"), { projectId: "demo" });
  // negative tokens and the unparseable line and the usage-less record are malformed;
  // the unknown model imports fine here and is rejected later, at pricing.
  expect(r.provenance.malformed).toBe(3);
  expect(r.events.map((e) => e.model)).toEqual(["some-other-model"]);
});

test("synthesizes a key when requestId is absent, and counts it", async () => {
  const r = importClaudeCodeJsonl(await lines("nokey.jsonl"), { projectId: "demo" });
  expect(r.events.length).toBe(1);          // the two identical lines collide, as documented
  expect(r.provenance.deduped).toBe(1);
  expect(r.provenance.synthesizedKeys).toBe(1);
  expect(r.events[0].idempotencyKey.startsWith("syn:")).toBe(true);
});

test("is deterministic", async () => {
  const ls = await lines("mixed.jsonl");
  expect(JSON.stringify(importClaudeCodeJsonl(ls, { projectId: "demo" })))
    .toBe(JSON.stringify(importClaudeCodeJsonl(ls, { projectId: "demo" })));
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bun test tests/importer.test.ts`
Expected: FAIL — `Cannot find module '../src/importers/claudeCode'`

- [ ] **Step 4: Write `src/importers/claudeCode.ts`**

```ts
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
  opts: { projectId: string; accountId?: string },
): ImportResult {
  const accountId = opts.accountId ?? "local";
  const events: UsageEvent[] = [];
  const seen = new Set<string>();
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
    if (typeof rec.requestId === "string" && rec.requestId !== "") {
      idempotencyKey = `claude_code:${rec.requestId}`;
    } else {
      const canonical = [
        "claude_code", ts, model,
        inputTokens, cacheReadTokens, cacheCreationTokens, outputTokens,
      ].join("|");
      idempotencyKey = "syn:" + createHash("sha256").update(canonical).digest("hex").slice(0, 32);
      p.synthesizedKeys++;
    }

    if (seen.has(idempotencyKey)) { p.deduped++; continue; }
    seen.add(idempotencyKey);

    events.push({
      idempotencyKey, accountId, projectId: opts.projectId,
      ts, source: "claude_code", model,
      inputTokens, cacheReadTokens, cacheCreationTokens, outputTokens,
    });
    p.imported++;
  }

  return { events, provenance: p };
}
```

Note the counting order: a synthesized key that then collides increments both
`synthesizedKeys` and `deduped`. That is intended — the operator needs to see that
the dedup was the weak kind.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/importer.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 6: Commit** *(only with go-ahead)*

```bash
git add src/importers/claudeCode.ts fixtures/ tests/importer.test.ts
git commit -m "feat: content-stripping Claude Code transcript importer"
```

---

## Task 4: Observed metrics

**Files:**
- Create: `src/metrics.ts`
- Test: `tests/metrics.test.ts`

**Interfaces:**
- Consumes: `UsageEvent`, `RateCard`, `costOfEvent`.
- Produces: `computeMetrics(events, card): Metrics`, types `Totals`, `Metrics`. `Totals` is `{ events, microCents, inputTokens, cacheReadTokens, cacheCreationTokens, outputTokens }`. `Metrics` is `{ overall, byModel, byProject, cacheHitRate, skipped }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/metrics.test.ts
import { expect, test } from "bun:test";
import { computeMetrics } from "../src/metrics";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import { microCentsToCents, formatCents } from "../src/pricing";
import type { UsageEvent } from "../src/types";

async function fixture(name: string, projectId = "demo") {
  const text = await Bun.file(`${import.meta.dir}/../fixtures/${name}`).text();
  return importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId }).events;
}

function ev(over: Partial<UsageEvent>): UsageEvent {
  return {
    idempotencyKey: Math.random().toString(36), accountId: "local", projectId: "p",
    ts: "2026-08-01T00:00:00Z", source: "claude_code", model: "claude-opus-5",
    inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0,
    ...over,
  };
}

test("current cost matches the hand-computed total exactly", async () => {
  const m = computeMetrics(await fixture("mixed.jsonl"), CARD);
  // $279.75 opus + $37.30 haiku, computed by hand in the spec
  expect(formatCents(microCentsToCents(m.overall.microCents))).toBe("$317.05");
});

test("splits by model", async () => {
  const m = computeMetrics(await fixture("mixed.jsonl"), CARD);
  expect(formatCents(microCentsToCents(m.byModel["claude-opus-5"].microCents))).toBe("$279.75");
  expect(formatCents(microCentsToCents(m.byModel["claude-haiku-4-5"].microCents))).toBe("$37.30");
});

test("by-project totals sum to the overall total", async () => {
  const events = [...(await fixture("mixed.jsonl", "alpha")), ...(await fixture("dupes.jsonl", "beta"))];
  const m = computeMetrics(events, CARD);
  const summed = Object.values(m.byProject).reduce((a, t) => a + t.microCents, 0);
  expect(summed).toBe(m.overall.microCents);
  expect(Object.keys(m.byProject).sort()).toEqual(["alpha", "beta"]);
});

test("cache-hit rate is read / (read + fresh input)", () => {
  const m = computeMetrics([ev({ inputTokens: 30, cacheReadTokens: 70, cacheCreationTokens: 999 })], CARD);
  expect(m.cacheHitRate).toBeCloseTo(0.7, 10); // cacheCreation excluded from the denominator
});

test("cache-hit rate is 0 with no cache reads and 1 with only cache reads", () => {
  expect(computeMetrics([ev({ inputTokens: 100 })], CARD).cacheHitRate).toBe(0);
  expect(computeMetrics([ev({ cacheReadTokens: 100 })], CARD).cacheHitRate).toBe(1);
});

test("cache-hit rate is 0, not NaN, when there is no eligible input", () => {
  expect(computeMetrics([ev({ outputTokens: 5 })], CARD).cacheHitRate).toBe(0);
});

test("unpriceable events are bucketed and excluded from cost", async () => {
  const m = computeMetrics(await fixture("malformed.jsonl"), CARD);
  expect(m.skipped.unknown_model).toBe(1);
  expect(m.overall.microCents).toBe(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test tests/metrics.test.ts`
Expected: FAIL — `Cannot find module '../src/metrics'`

- [ ] **Step 3: Write `src/metrics.ts`**

```ts
import { costOfEvent } from "./pricing";
import type { RateCard } from "./rates";
import type { UsageEvent } from "./types";

export interface Totals {
  events: number;
  microCents: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
}

export interface Metrics {
  overall: Totals;
  byModel: Record<string, Totals>;
  byProject: Record<string, Totals>;
  /** cacheRead / (cacheRead + freshInput). Cache *writes* are excluded from the denominator. */
  cacheHitRate: number;
  skipped: { unknown_model: number; malformed: number };
}

const empty = (): Totals => ({
  events: 0, microCents: 0, inputTokens: 0,
  cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0,
});

function add(t: Totals, e: UsageEvent, microCents: number): void {
  t.events++;
  t.microCents += microCents;
  t.inputTokens += e.inputTokens;
  t.cacheReadTokens += e.cacheReadTokens;
  t.cacheCreationTokens += e.cacheCreationTokens;
  t.outputTokens += e.outputTokens;
}

export function computeMetrics(events: UsageEvent[], card: RateCard): Metrics {
  const overall = empty();
  const byModel: Record<string, Totals> = {};
  const byProject: Record<string, Totals> = {};
  const skipped = { unknown_model: 0, malformed: 0 };

  for (const e of events) {
    const priced = costOfEvent(e, card);
    if (!priced.ok) { skipped[priced.reason]++; continue; }

    byModel[e.model] ??= empty();
    byProject[e.projectId] ??= empty();
    add(overall, e, priced.microCents);
    add(byModel[e.model], e, priced.microCents);
    add(byProject[e.projectId], e, priced.microCents);
  }

  const eligible = overall.cacheReadTokens + overall.inputTokens;
  const cacheHitRate = eligible === 0 ? 0 : overall.cacheReadTokens / eligible;

  return { overall, byModel, byProject, cacheHitRate, skipped };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/metrics.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit** *(only with go-ahead)*

```bash
git add src/metrics.ts tests/metrics.test.ts
git commit -m "feat: observed cost, cache-hit rate, per-model and per-project totals"
```

---

## Task 5: Simulation and savings attribution

The trap this task exists to avoid: the two levers overlap, so their savings must
never be added together.

**Files:**
- Create: `src/simulate.ts`
- Test: `tests/simulate.test.ts`

**Interfaces:**
- Consumes: `Metrics`/`Totals` (Task 4), `RateCard`, `ModelRate`.
- Produces: `simulate(metrics, card, assumptions): Simulation`, types `Assumptions`, `RoutingPoint`, `Simulation`.
  `Assumptions` is `{ routableFractionsPct: readonly number[]; targetModel: string; targetCacheHitPct: number | null }`.
  `Simulation` is `{ baselineMicroCents, routingCurve, cacheHeadroom, attribution }` where
  `attribution` is `{ cacheOnlySavedMicroCents, routingOnlySavedMicroCents, combinedSavedMicroCents }`.

- [ ] **Step 1: Write the failing test**

Expected values are the worked example from spec §6.7, computed by hand.

```ts
// tests/simulate.test.ts
import { expect, test } from "bun:test";
import { simulate } from "../src/simulate";
import { computeMetrics } from "../src/metrics";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import { microCentsToCents, formatCents } from "../src/pricing";
import type { UsageEvent } from "../src/types";

// 100 MTok fresh input, 10 MTok output, all Opus, no cache -> $750.00 baseline
const BASELINE: UsageEvent[] = [{
  idempotencyKey: "k1", accountId: "local", projectId: "p",
  ts: "2026-08-01T00:00:00Z", source: "claude_code", model: "claude-opus-5",
  inputTokens: 100_000_000, cacheReadTokens: 0, cacheCreationTokens: 0,
  outputTokens: 10_000_000,
}];

const A = {
  routableFractionsPct: [0, 25, 50, 75, 100] as const,
  targetModel: "claude-haiku-4-5",
  targetCacheHitPct: 70,
};

const cash = (micro: number) => formatCents(microCentsToCents(micro));

test("baseline reproduces the hand-computed bill", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, A);
  expect(cash(s.baselineMicroCents)).toBe("$750.00");
});

test("routing at 0% saves exactly nothing", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, A);
  const p0 = s.routingCurve.find((p) => p.fractionPct === 0)!;
  expect(p0.savedMicroCents).toBe(0);
});

test("routing at 100% moves everything to the target model", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, A);
  const p100 = s.routingCurve.find((p) => p.fractionPct === 100)!;
  // all haiku: 100e6*100 + 10e6*500 = 10e9 + 5e9 = 15e9 micro-cents = $150.00
  expect(cash(p100.microCents)).toBe("$150.00");
});

test("routing curve is monotonically cheaper toward the cheaper model", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, A);
  const costs = s.routingCurve.map((p) => p.microCents);
  for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeLessThan(costs[i - 1]);
});

test("cache headroom below the observed rate is rejected", () => {
  const m = computeMetrics(BASELINE, CARD); // observed cache-hit is 0
  expect(() => simulate(m, CARD, { ...A, targetCacheHitPct: -1 })).toThrow();
});

test("the levers compound — combined saves less than the sum of each alone", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, { ...A, routableFractionsPct: [40] });
  const { cacheOnlySavedMicroCents: c, routingOnlySavedMicroCents: r,
          combinedSavedMicroCents: both } = s.attribution;

  expect(cash(c)).toBe("$283.75");     // hand-computed, spec 6.7
  expect(cash(r)).toBe("$240.00");     // hand-computed, spec 6.7
  expect(cash(both)).toBe("$432.95");  // hand-computed, spec 6.7
  expect(both).toBeLessThan(c + r);    // the bug this test exists to prevent
});

test("attribution exposes no additive total", () => {
  const s = simulate(computeMetrics(BASELINE, CARD), CARD, { ...A, routableFractionsPct: [40] });
  expect(Object.keys(s.attribution).sort()).toEqual([
    "cacheOnlySavedMicroCents", "combinedSavedMicroCents", "routingOnlySavedMicroCents",
  ]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test tests/simulate.test.ts`
Expected: FAIL — `Cannot find module '../src/simulate'`

- [ ] **Step 3: Write `src/simulate.ts`**

```ts
import type { Metrics, Totals } from "./metrics";
import type { ModelRate, RateCard } from "./rates";

export interface Assumptions {
  /** Integer percents, 0-100. A curve, never a single point. */
  routableFractionsPct: readonly number[];
  targetModel: string;
  /** Integer percent, or null to skip the headroom simulation. */
  targetCacheHitPct: number | null;
}

export interface RoutingPoint {
  fractionPct: number;
  microCents: number;
  savedMicroCents: number;
}

export interface Simulation {
  baselineMicroCents: number;
  routingCurve: RoutingPoint[];
  cacheHeadroom: { targetCacheHitPct: number; microCents: number; savedMicroCents: number } | null;
  attribution: {
    cacheOnlySavedMicroCents: number;
    routingOnlySavedMicroCents: number;
    combinedSavedMicroCents: number;
  };
}

/** Token quantities detached from a model, so they can be repriced under another. */
interface Bundle {
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
}

const bundleOf = (t: Totals): Bundle => ({
  inputTokens: t.inputTokens, cacheReadTokens: t.cacheReadTokens,
  cacheCreationTokens: t.cacheCreationTokens, outputTokens: t.outputTokens,
});

const scale = (b: Bundle, pct: number): Bundle => ({
  inputTokens: Math.round(b.inputTokens * pct / 100),
  cacheReadTokens: Math.round(b.cacheReadTokens * pct / 100),
  cacheCreationTokens: Math.round(b.cacheCreationTokens * pct / 100),
  outputTokens: Math.round(b.outputTokens * pct / 100),
});

/**
 * Price a bundle. When `cacheTargetPct` is given, the input side is recomputed as if
 * that share of cache-eligible input (fresh + read) were served from cache.
 */
function priceBundle(b: Bundle, rate: ModelRate, cacheTargetPct: number | null): number {
  let fresh = b.inputTokens;
  let read = b.cacheReadTokens;

  if (cacheTargetPct !== null) {
    const eligible = b.inputTokens + b.cacheReadTokens;
    read = Math.floor(eligible * cacheTargetPct / 100);
    fresh = eligible - read;
  }

  return fresh * rate.input
       + read * rate.cacheRead
       + b.cacheCreationTokens * rate.cacheWrite
       + b.outputTokens * rate.output;
}

/** Total cost across all models, optionally routing `routePct` of every bundle to the target. */
function totalCost(
  metrics: Metrics, card: RateCard,
  routePct: number, targetModel: string, cacheTargetPct: number | null,
): number {
  const target = card.rates[targetModel];
  if (!target) throw new Error(`target model not in rate card: ${targetModel}`);

  let sum = 0;
  for (const [model, totals] of Object.entries(metrics.byModel)) {
    const rate = card.rates[model];
    if (!rate) continue; // already bucketed as unknown_model by computeMetrics
    const whole = bundleOf(totals);
    sum += priceBundle(scale(whole, 100 - routePct), rate, cacheTargetPct);
    sum += priceBundle(scale(whole, routePct), target, cacheTargetPct);
  }
  return sum;
}

export function simulate(metrics: Metrics, card: RateCard, a: Assumptions): Simulation {
  for (const p of a.routableFractionsPct) {
    if (!Number.isInteger(p) || p < 0 || p > 100) {
      throw new Error(`routable fraction must be an integer percent 0-100, got ${p}`);
    }
  }

  const observedPct = Math.round(metrics.cacheHitRate * 100);
  if (a.targetCacheHitPct !== null) {
    if (!Number.isInteger(a.targetCacheHitPct) || a.targetCacheHitPct < 0 || a.targetCacheHitPct > 100) {
      throw new Error(`target cache hit must be an integer percent 0-100, got ${a.targetCacheHitPct}`);
    }
    if (a.targetCacheHitPct < observedPct) {
      throw new Error(`target cache hit ${a.targetCacheHitPct}% is below the observed ${observedPct}%`);
    }
  }

  const baseline = metrics.overall.microCents;

  const routingCurve = a.routableFractionsPct.map((fractionPct) => {
    const microCents = totalCost(metrics, card, fractionPct, a.targetModel, null);
    return { fractionPct, microCents, savedMicroCents: baseline - microCents };
  });

  const cacheHeadroom = a.targetCacheHitPct === null ? null : (() => {
    const microCents = totalCost(metrics, card, 0, a.targetModel, a.targetCacheHitPct);
    return {
      targetCacheHitPct: a.targetCacheHitPct,
      microCents,
      savedMicroCents: baseline - microCents,
    };
  })();

  // Attribution uses the LAST curve point as "the" routing scenario, so a caller that
  // passes a single fraction gets that fraction attributed.
  const routePct = a.routableFractionsPct.at(-1) ?? 0;
  const cachePct = a.targetCacheHitPct;

  const cacheOnly   = totalCost(metrics, card, 0,        a.targetModel, cachePct);
  const routingOnly = totalCost(metrics, card, routePct, a.targetModel, null);
  const combined    = totalCost(metrics, card, routePct, a.targetModel, cachePct);

  return {
    baselineMicroCents: baseline,
    routingCurve,
    cacheHeadroom,
    attribution: {
      cacheOnlySavedMicroCents: baseline - cacheOnly,
      routingOnlySavedMicroCents: baseline - routingOnly,
      combinedSavedMicroCents: baseline - combined,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/simulate.test.ts`
Expected: PASS, 7 tests

If the `$432.95` assertion is off by a cent or two, do **not** adjust the expected
value — the hand computation in spec §6.7 is the reference. Check `scale()` rounding
first; the fixture is chosen so every split is a whole number of tokens.

- [ ] **Step 5: Commit** *(only with go-ahead)*

```bash
git add src/simulate.ts tests/simulate.test.ts
git commit -m "feat: routing curve, cache headroom, non-additive savings attribution"
```

---

## Task 6: The report object

**Files:**
- Create: `src/report.ts`
- Test: `tests/report.test.ts`

**Interfaces:**
- Consumes: `Metrics`, `Simulation`, `Assumptions`, `ImportProvenance`, `RateCard`, `cardAgeDays`, `microCentsToCents`, `formatCents`.
- Produces: `buildReport(input): Report`, where `input` is `{ metrics, simulation, assumptions, provenance, card, generatedAt: Date }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/report.test.ts
import { expect, test } from "bun:test";
import { buildReport } from "../src/report";
import { computeMetrics } from "../src/metrics";
import { simulate } from "../src/simulate";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";

const A = { routableFractionsPct: [0, 25, 50, 75, 100], targetModel: "claude-haiku-4-5", targetCacheHitPct: 90 };

async function build(generatedAt = new Date("2026-08-08T00:00:00Z")) {
  const text = await Bun.file(`${import.meta.dir}/../fixtures/mixed.jsonl`).text();
  const imported = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId: "demo" });
  const metrics = computeMetrics(imported.events, CARD);
  const simulation = simulate(metrics, CARD, A);
  return buildReport({ metrics, simulation, assumptions: A, provenance: imported.provenance, card: CARD, generatedAt });
}

test("states the current cost in dollars", async () => {
  expect((await build()).currentCost.formatted).toBe("$317.05");
});

test("tags every assumption as measured or operator-set", async () => {
  const r = await build();
  const tags = Object.fromEntries(r.assumptions.map((a) => [a.name, a.kind]));
  expect(tags["cacheHitRate"]).toBe("measured");
  expect(tags["routableFraction"]).toBe("operator_set");
});

test("carries the rate card it actually used", async () => {
  const r = await build();
  expect(r.rateCard.capturedAt).toBe("2026-08-08");
  expect(r.rateCard.rates["claude-opus-5"].input).toBe(500);
});

test("carries full provenance", async () => {
  const r = await build();
  expect(r.provenance.imported).toBe(2);
  expect(r.provenance.skippedNonAssistant).toBe(1);
});

test("warns when the rate card is stale", async () => {
  const fresh = await build(new Date("2026-08-08T00:00:00Z"));
  const stale = await build(new Date("2026-10-01T00:00:00Z"));
  expect(fresh.warnings.some((w) => w.includes("rate card"))).toBe(false);
  expect(stale.warnings.some((w) => w.includes("rate card"))).toBe(true);
});

test("the human summary states the cache-hit definition and the compounding caveat", async () => {
  const s = (await build()).humanSummary;
  expect(s).toContain("cache writes are excluded");
  expect(s).toContain("do not add");
});

test("is byte-identical across runs", async () => {
  const a = JSON.stringify(await build());
  const b = JSON.stringify(await build());
  expect(a).toBe(b);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test tests/report.test.ts`
Expected: FAIL — `Cannot find module '../src/report'`

- [ ] **Step 3: Write `src/report.ts`**

```ts
import type { ImportProvenance } from "./importers/claudeCode";
import type { Metrics } from "./metrics";
import { formatCents, microCentsToCents } from "./pricing";
import { cardAgeDays, type RateCard } from "./rates";
import type { Assumptions, Simulation } from "./simulate";

const STALE_AFTER_DAYS = 30;

export interface Money { microCents: number; cents: number; formatted: string }

export interface AssumptionNote {
  name: string;
  value: string;
  kind: "measured" | "operator_set";
  note: string;
}

export interface Report {
  generatedAt: string;
  rateCard: RateCard;
  currentCost: Money;
  cacheHitRate: number;
  byModel: Record<string, Money>;
  byProject: Record<string, Money>;
  savings: { cacheOnly: Money; routingOnly: Money; combined: Money };
  routingCurve: Array<{ fractionPct: number; cost: Money; saved: Money }>;
  cacheHeadroom: { targetCacheHitPct: number; cost: Money; saved: Money } | null;
  assumptions: AssumptionNote[];
  provenance: ImportProvenance & { skipped: Metrics["skipped"] };
  warnings: string[];
  humanSummary: string;
}

const money = (microCents: number): Money => {
  const cents = microCentsToCents(microCents);
  return { microCents, cents, formatted: formatCents(cents) };
};

const mapMoney = (rec: Record<string, { microCents: number }>): Record<string, Money> =>
  Object.fromEntries(
    Object.entries(rec).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, money(v.microCents)]),
  );

export function buildReport(input: {
  metrics: Metrics;
  simulation: Simulation;
  assumptions: Assumptions;
  provenance: ImportProvenance;
  card: RateCard;
  generatedAt: Date;
}): Report {
  const { metrics, simulation: sim, assumptions: a, provenance, card, generatedAt } = input;

  const warnings: string[] = [];
  const age = cardAgeDays(card, generatedAt);
  if (age > STALE_AFTER_DAYS) {
    warnings.push(`rate card is ${age} days old (captured ${card.capturedAt}) — every figure may be wrong`);
  }
  if (provenance.synthesizedKeys > 0) {
    warnings.push(`${provenance.synthesizedKeys} events had no requestId; dedup for those is best-effort`);
  }
  if (metrics.skipped.unknown_model > 0) {
    warnings.push(`${metrics.skipped.unknown_model} events used a model absent from the rate card and were excluded`);
  }

  const observedPct = Math.round(metrics.cacheHitRate * 100);
  const humanSummary = [
    `Current cost: ${formatCents(microCentsToCents(metrics.overall.microCents))} across ${metrics.overall.events} priced events.`,
    `Observed cache-hit rate: ${observedPct}% — defined as cache reads over (cache reads + fresh input); cache writes are excluded from the denominator.`,
    `Savings levers compound and do not add: cache-only ${formatCents(microCentsToCents(sim.attribution.cacheOnlySavedMicroCents))}, routing-only ${formatCents(microCentsToCents(sim.attribution.routingOnlySavedMicroCents))}, both together ${formatCents(microCentsToCents(sim.attribution.combinedSavedMicroCents))}.`,
    `Rate card captured ${card.capturedAt}. ${card.notes.join(" ")}`,
  ].join("\n");

  return {
    generatedAt: generatedAt.toISOString(),
    rateCard: card,
    currentCost: money(metrics.overall.microCents),
    cacheHitRate: metrics.cacheHitRate,
    byModel: mapMoney(metrics.byModel),
    byProject: mapMoney(metrics.byProject),
    savings: {
      cacheOnly: money(sim.attribution.cacheOnlySavedMicroCents),
      routingOnly: money(sim.attribution.routingOnlySavedMicroCents),
      combined: money(sim.attribution.combinedSavedMicroCents),
    },
    routingCurve: sim.routingCurve.map((p) => ({
      fractionPct: p.fractionPct, cost: money(p.microCents), saved: money(p.savedMicroCents),
    })),
    cacheHeadroom: sim.cacheHeadroom && {
      targetCacheHitPct: sim.cacheHeadroom.targetCacheHitPct,
      cost: money(sim.cacheHeadroom.microCents),
      saved: money(sim.cacheHeadroom.savedMicroCents),
    },
    assumptions: [
      { name: "cacheHitRate", value: `${observedPct}%`, kind: "measured",
        note: "computed from real cache_read vs input tokens" },
      { name: "cacheWriteOverhead", value: `${metrics.overall.cacheCreationTokens} tokens`, kind: "measured",
        note: "cache_creation tokens present in the source data" },
      { name: "modelMix", value: Object.keys(metrics.byModel).sort().join(", "), kind: "measured",
        note: "observed per-model split" },
      { name: "projectSplit", value: Object.keys(metrics.byProject).sort().join(", "), kind: "measured",
        note: "observed per-project split" },
      { name: "routableFraction", value: `${a.routableFractionsPct.join("/")}%`, kind: "operator_set",
        note: "no per-request difficulty label exists yet — reported as a curve, never a point" },
      { name: "rateCard", value: card.capturedAt, kind: "operator_set",
        note: "list prices, refreshed by hand" },
    ],
    provenance: { ...provenance, skipped: metrics.skipped },
    warnings,
    humanSummary,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/report.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit** *(only with go-ahead)*

```bash
git add src/report.ts tests/report.test.ts
git commit -m "feat: deterministic auditable report with tagged assumptions"
```

---

## Task 7: The CLI

The only unit that performs I/O.

**Files:**
- Create: `src/cli.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: a runnable entry point. `bun run src/cli.ts --dir <path> [--json] [--routable 0,25,50,75,100] [--cache-target 90]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cli.test.ts
import { expect, test } from "bun:test";

const CLI = `${import.meta.dir}/../src/cli.ts`;
const FIX = `${import.meta.dir}/../fixtures`;

async function run(args: string[]) {
  const p = Bun.spawn(["bun", "run", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { stdout, stderr, code: await p.exited };
}

test("prints a human summary containing the current cost", async () => {
  const r = await run(["--dir", FIX, "--only", "mixed.jsonl"]);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("$317.05");
});

test("--json emits parseable JSON with no prompt content", async () => {
  const r = await run(["--dir", FIX, "--only", "mixed.jsonl", "--json"]);
  expect(r.code).toBe(0);
  const parsed = JSON.parse(r.stdout);
  expect(parsed.currentCost.formatted).toBe("$317.05");
  for (const canary of ["SECRET_CANARY_ALPHA", "SECRET_CANARY_BETA", "SECRET_CANARY_GAMMA"]) {
    expect(r.stdout).not.toContain(canary);
  }
});

test("exits non-zero with a usable message when the directory is missing", async () => {
  const r = await run(["--dir", "/nope/does/not/exist"]);
  expect(r.code).not.toBe(0);
  expect(r.stderr).toContain("/nope/does/not/exist");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test tests/cli.test.ts`
Expected: FAIL — module not found / non-zero exit

- [ ] **Step 3: Write `src/cli.ts`**

```ts
import { basename, join } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { importClaudeCodeJsonl, type ImportProvenance } from "./importers/claudeCode";
import { computeMetrics } from "./metrics";
import { buildReport } from "./report";
import { RATE_CARD_2026_08_08 as CARD } from "./rates";
import { simulate } from "./simulate";
import type { UsageEvent } from "./types";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const dir = arg("dir", join(process.env.HOME ?? "", ".claude", "projects"))!;
const only = arg("only");
const routable = (arg("routable", "0,25,50,75,100")!).split(",").map((s) => Number(s.trim()));
const cacheTargetRaw = arg("cache-target");

try {
  statSync(dir);
} catch {
  console.error(`cannot read transcript directory: ${dir}`);
  process.exit(1);
}

/** Walk one level of project directories, or a flat directory of .jsonl files. */
function* transcripts(root: string): Generator<{ path: string; projectId: string }> {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) {
      for (const f of readdirSync(full)) {
        if (f.endsWith(".jsonl")) yield { path: join(full, f), projectId: entry };
      }
    } else if (entry.endsWith(".jsonl")) {
      yield { path: full, projectId: basename(root) };
    }
  }
}

const events: UsageEvent[] = [];
const provenance: ImportProvenance = {
  linesSeen: 0, imported: 0, malformed: 0, deduped: 0, synthesizedKeys: 0, skippedNonAssistant: 0,
};

for (const { path, projectId } of transcripts(dir)) {
  if (only && basename(path) !== only) continue;
  const text = await Bun.file(path).text();
  const r = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId });
  events.push(...r.events);
  for (const k of Object.keys(provenance) as (keyof ImportProvenance)[]) provenance[k] += r.provenance[k];
}

const metrics = computeMetrics(events, CARD);
const observedPct = Math.round(metrics.cacheHitRate * 100);
const assumptions = {
  routableFractionsPct: routable,
  targetModel: "claude-haiku-4-5",
  targetCacheHitPct: cacheTargetRaw === undefined ? Math.max(observedPct, 90) : Number(cacheTargetRaw),
};

const report = buildReport({
  metrics,
  simulation: simulate(metrics, CARD, assumptions),
  assumptions,
  provenance,
  card: CARD,
  generatedAt: new Date(),
});

if (flag("json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(report.humanSummary);
  if (report.warnings.length) {
    console.log("\nWarnings:");
    for (const w of report.warnings) console.log(`  ! ${w}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/cli.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit** *(only with go-ahead)*

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat: CLI entry point, the only unit that does I/O"
```

---

## Task 8: Cross-cutting acceptance criteria

The criteria from spec §9 that no single unit owns.

**Files:**
- Create: `tests/acceptance.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything.
- Produces: nothing new.

- [ ] **Step 1: Write the acceptance test**

```ts
// tests/acceptance.test.ts
import { expect, test } from "bun:test";
import { costOfEvent } from "../src/pricing";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import { importClaudeCodeJsonl } from "../src/importers/claudeCode";
import { computeMetrics } from "../src/metrics";

// §9.2 — no float anywhere in the pricing path
test("costOfEvent returns an integer for every rate-card model", () => {
  for (const model of Object.keys(CARD.rates)) {
    const r = costOfEvent({
      idempotencyKey: "k", accountId: "a", projectId: "p", ts: "2026-08-01T00:00:00Z",
      source: "claude_code", model,
      inputTokens: 12_345, cacheReadTokens: 6_789, cacheCreationTokens: 101, outputTokens: 2_345,
    }, CARD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number.isInteger(r.microCents)).toBe(true);
  }
});

// §9.11 — importer A never opens a socket
test("the local importer completes with the network disabled", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("network access attempted"); }) as typeof fetch;
  try {
    const text = await Bun.file(`${import.meta.dir}/../fixtures/mixed.jsonl`).text();
    const r = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId: "demo" });
    expect(r.events.length).toBe(2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// §9.7 — attribution is always populated
test("every priced event has a non-empty accountId and projectId", async () => {
  const text = await Bun.file(`${import.meta.dir}/../fixtures/mixed.jsonl`).text();
  const { events } = importClaudeCodeJsonl(text.split("\n").filter((l) => l.trim() !== ""), { projectId: "demo" });
  for (const e of events) {
    expect(e.accountId.length).toBeGreaterThan(0);
    expect(e.projectId.length).toBeGreaterThan(0);
  }
  const m = computeMetrics(events, CARD);
  expect(Object.values(m.byProject).reduce((a, t) => a + t.microCents, 0)).toBe(m.overall.microCents);
});
```

- [ ] **Step 2: Run the whole suite**

Run: `bun test`
Expected: PASS — all files, ~48 tests

- [ ] **Step 3: Update `README.md`**

```markdown
# token-spread

Read-only usage → cost/savings report. Proves the token-spread margin on real
traffic before any gateway is built. Local-only; reads token-count metadata, never
prompt content.

## Run it

    bun test                                  # full suite, synthetic fixtures only
    bun run src/cli.ts                        # your own transcripts, human summary
    bun run src/cli.ts --json > report.json   # machine-readable

Flags: `--dir <path>` (default `~/.claude/projects`), `--json`,
`--routable 0,25,50,75,100`, `--cache-target 90`.

## Reading the output

Figures tagged `measured` come from your traffic. Figures tagged `operator_set` are
assumptions — currently the routable fraction and the rate card's freshness. Savings
levers **compound and do not add**; quote `savings.combined`, never a sum.

Design: `docs/specs/2026-08-08-savings-report-design.md`
Margin model: `docs/margin-model.html`
Plan: `docs/plans/2026-08-08-savings-report-slice-1.md`
```

- [ ] **Step 4: Smoke-check against real transcripts**

Run: `bun run src/cli.ts`

This is a manual eyeball, not an assertion. Confirm the total is the right order of
magnitude against a known billing period, and that no prompt text appears in the
output. If the number is wildly off, the likely causes in order are: transcripts
covering a different period than you think, retries counted that were never billed,
or a model id absent from the rate card (check `warnings`).

- [ ] **Step 5: Commit** *(only with go-ahead)*

```bash
git add tests/acceptance.test.ts README.md
git commit -m "test: cross-cutting acceptance criteria; docs: README"
```

---

## Self-Review

**Spec coverage.** §3 importer A → Task 3. §4 `UsageEvent` + key derivation → Tasks 1, 3.
§5 privacy → Tasks 3, 7, 8. §6.1 micro-cents → Tasks 1, 2. §6.2 `costOfEvent` → Task 2.
§6.3–6.4 → Task 4. §6.5–6.6 → Task 5. §6.7 attribution → Task 5. §7 architecture → file
structure. §8 auditability → Task 6. §9 criteria 1–11 → Tasks 2, 4, 5, 6, 8. §10 fixtures
→ Task 3. §11.1 register → Task 6.

**Known gaps, deliberate.** Importer B (Admin API) is spec §3B and is *not* in this plan —
it is a later slice, and building it now would put a network call in a slice whose
selling point is that it has none. `fixture_zero` and `fixture_allcache` from spec §10 are
covered by inline events in `tests/metrics.test.ts` rather than by files on disk; the
assertion is the same and the fixture files would carry no extra information.

**Type consistency.** `UsageEvent` field names are identical across Tasks 1, 2, 3, 4, 5, 8.
`microCents` is the unit suffix everywhere; `savedMicroCents` in `simulate.ts` maps to
`saved` in `report.ts` via `money()`. `ImportProvenance` keys are the same in Tasks 3, 6, 7.
`fractionPct` is used in both `simulate.ts` and `report.ts` — never `fraction`.

**Risk to watch during execution.** Task 5's `scale()` rounds each token class
independently, so at fractions that don't divide evenly the routed and unrouted halves
may differ from the whole by a token or two. The fixtures are chosen to divide cleanly.
If a real run shows a cent of drift on the routing curve, that is the cause, and it is
cosmetic — but say so in the report rather than hiding it.
