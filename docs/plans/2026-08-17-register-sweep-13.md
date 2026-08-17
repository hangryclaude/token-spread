# Register Sweep 13 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the register's published numbers derived rather than typed, recover the thirteen entries sweep 12 stranded, and run sweep 13 across the axes the exhaustion statement left open.

**Architecture:** The cohort JSON files are the source of truth. `docs/media/render.mjs` already derives the film from them; nothing else does. This plan adds `src/register/` as the one loader, a cohort manifest both TypeScript and Node read, and a test that fails when any published sentence disagrees with the verdict files. Then it feeds that machine: first with sweep 12's stranded harvest, then with a fresh sweep.

**Tech Stack:** Bun + TypeScript (strict, no runtime dependencies), `bun test`, Node ESM for the `.mjs` tooling, `jq` for inspection.

## Global Constraints

- **No new runtime dependencies.** The package has none and keeps none. Dev tooling already present (`puppeteer-core` via `~/skills`) is the only exception, and this plan adds nothing to it.
- **Ids are permanent citation handles.** Never reuse an id, never renumber an existing one, even after a withdrawal. New entries take ids one past the highest in use.
- **Corrections are appended, never edited away.** `docs/research/SCHEMA.md` is the contract; the original reasoning stays above any `corrections` entry.
- **A documentation sentence is the provider's word** and caps at `CONTRACTUAL_ONLY`. Only a measurement or a structural argument (no output was generated; no request was ever sent) supports `PASS_ABSOLUTE`.
- **Scope is the hosted-API customer.** Serving-stack internals (vLLM, SGLang, KV-cache offload) are out of scope unless the customer runs the gateway themselves.
- **Research agents are read-only on this repository.** They return data; a human or the orchestrator writes files. An agent with write tools loose in this repo will implement and commit uninvited.
- **Work on branch `feat/register-sweep-13`.** Never commit to `main`.
- **No `ANTHROPIC_API_KEY` is available.** The four items the exhaustion statement files as "only a live account can settle" stay unresolved. Do not downgrade them to a guess.
- Current tally, verified 2026-08-17: **187 total · 67 pass · 28 contractual · 52 rejected · 40 unresolved.**

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `docs/research/cohorts.json` | The list of cohort files. Read by TypeScript and by `.mjs` tooling, so adding a cohort is a one-line change in one place. |
| `src/register/load.ts` | `Entry` type, `cohortFiles()`, `loadRegister()`, `tally()`. The only place the register is read. |
| `src/register/ids.ts` | `nextId()`, `duplicateIds()`. |
| `src/register/merge.ts` | `Candidate` type, `assignIds()`, `nameCollisions()`. |
| `src/register/stale.ts` | `staleness()` — which entries were last verified against a source, and how long ago. |
| `src/register/cli.ts` | `bun run register <stat\|next-id\|stale\|check>`. |
| `tests/registerIds.test.ts` | No duplicate ids; `nextId` is one past the maximum. |
| `tests/registerCounts.test.ts` | Every published number equals the computed tally. The gate. |
| `tests/registerMerge.test.ts` | Id assignment and name-collision detection. |
| `tests/registerStale.test.ts` | Date extraction from `verifiedAgainst`. |
| `docs/research/2026-08-17-sweep-12-recovered.json` | The thirteen entries sweep 12 adjudicated and never merged. |
| `docs/research/2026-08-17-sweep-13.json` | Sweep 13's cohort. |
| `docs/research/2026-08-17-sweep-13.md` | Sweep 13's brief and the revised exhaustion statement. |

**Modify:**

| Path | Change |
|---|---|
| `tests/registerSchema.test.ts:14-19` | Drop the inline `COHORTS` array and the local `Entry`; import from `src/register/load.ts`. |
| `docs/media/render.mjs:47-49` | Read `cohorts.json` instead of the hardcoded two-file list. |
| `package.json` scripts | Add `register`, `register:stat`, `register:stale`. |
| `README.md:51-52, 71, 340` | Numbers, and the two alt texts that say 51 where the register says 52. |
| `site/index.html:348, 356, 358, 361, 363, 368` | Six numbers. |
| `site/methods.html:8, 12, 124, 134-137, 139, 141, 143` | Ten numbers. |
| `site/index-scroll.html:8, 365, 367-370, 372, 468` | Nine numbers. |
| `docs/research/SCHEMA.md:4` | The entry count. |

---

### Task 1: One loader, one cohort manifest

Three places currently decide what "the register" means: the schema test, the film renderer, and prose. They agree today by luck.

**Files:**
- Create: `docs/research/cohorts.json`, `src/register/load.ts`, `src/register/ids.ts`, `tests/registerIds.test.ts`
- Modify: `tests/registerSchema.test.ts:14-19`, `docs/media/render.mjs:47-49`
- Test: `tests/registerIds.test.ts`

**Interfaces:**
- Produces: `Entry`, `StrictVerdict`, `Tally`, `cohortFiles(): string[]`, `loadRegister(): Entry[]`, `tally(entries: Entry[]): Tally`, `nextId(entries: Entry[]): number`, `duplicateIds(entries: Entry[]): number[]`. Every later task consumes these.

- [ ] **Step 1: Branch**

```bash
cd /Users/angus/dev/token-spread
git switch -c feat/register-sweep-13
```

- [ ] **Step 2: Write the failing test**

Create `tests/registerIds.test.ts`:

```ts
import { expect, test } from "bun:test";
import { loadRegister } from "../src/register/load";
import { duplicateIds, nextId } from "../src/register/ids";

/**
 * Sweep 12 stranded thirteen entries because a markdown brief numbered them 185-199 while the
 * verdict files already held 185 and 186. Nothing checked. These two tests are what would have
 * caught it at merge time instead of five days later.
 */

test("no id is used twice across cohorts", () => {
  const dup = duplicateIds(loadRegister());
  expect(dup, `ids used more than once: ${dup.join(", ")}`).toEqual([]);
});

test("nextId is one past the highest id in use", () => {
  const entries = loadRegister();
  expect(nextId(entries)).toBe(Math.max(...entries.map((e) => e.id)) + 1);
});

test("the manifest lists cohort files that exist and parse", () => {
  expect(loadRegister().length).toBeGreaterThan(180);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd /Users/angus/dev/token-spread && bun test tests/registerIds.test.ts`
Expected: FAIL — `Cannot find module '../src/register/load'`.

- [ ] **Step 4: Write the cohort manifest**

Create `docs/research/cohorts.json`:

```json
[
  "2026-08-10-verdicts-final.json",
  "2026-08-12-addendum.json"
]
```

- [ ] **Step 5: Write the loader**

Create `src/register/load.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Where the register lives. One list, so the schema test, the film and the site cannot
 * disagree about what "the register" is — the same reason `cli.ts` keeps one FLAGS array.
 */
export const RESEARCH_DIR = join(import.meta.dir, "..", "..", "docs", "research");

export type StrictVerdict =
  | "PASS_ABSOLUTE" | "PASS_METADATA" | "PASS_SCHEDULING" | "PASS_REPLAY"
  | "CONTRACTUAL_ONLY" | "FAIL" | "INSUFFICIENT_EVIDENCE";

export interface Correction {
  date: string;
  kind: "withdrawn-from-passing" | "verdict-changed" | "source-corrected" | "superseded";
  note: string;
}

/** One adjudicated candidate. `docs/research/SCHEMA.md` is the prose contract for this shape. */
export interface Entry {
  id: number;
  name: string;
  strictVerdict: StrictVerdict;
  reasoning: string;
  savings: string;
  provenance: string;
  telemetrySignal: string;
  providers: string[];
  verifiedAgainst?: string;
  corrections?: Correction[];
  [key: string]: unknown;
}

export function cohortFiles(): string[] {
  return JSON.parse(readFileSync(join(RESEARCH_DIR, "cohorts.json"), "utf8")) as string[];
}

export function loadRegister(): Entry[] {
  return cohortFiles().flatMap(
    (f) => JSON.parse(readFileSync(join(RESEARCH_DIR, f), "utf8")) as Entry[],
  );
}

/** The four buckets the site publishes. Derived here so nothing downstream counts by hand. */
export interface Tally {
  total: number;
  pass: number;
  contractual: number;
  rejected: number;
  unresolved: number;
}

export function tally(entries: Entry[]): Tally {
  const t: Tally = { total: entries.length, pass: 0, contractual: 0, rejected: 0, unresolved: 0 };
  for (const e of entries) {
    if (e.strictVerdict.startsWith("PASS_")) t.pass++;
    else if (e.strictVerdict === "CONTRACTUAL_ONLY") t.contractual++;
    else if (e.strictVerdict === "FAIL") t.rejected++;
    else t.unresolved++;
  }
  return t;
}
```

- [ ] **Step 6: Write the id helpers**

Create `src/register/ids.ts`:

```ts
import type { Entry } from "./load";

/**
 * The next free id. Ids are citation handles: never reused, never renumbered, not even after
 * an entry is withdrawn from the passing column.
 */
export function nextId(entries: Entry[]): number {
  return entries.reduce((max, e) => Math.max(max, e.id), -1) + 1;
}

export function duplicateIds(entries: Entry[]): number[] {
  const seen = new Set<number>();
  const dup = new Set<number>();
  for (const e of entries) (seen.has(e.id) ? dup : seen).add(e.id);
  return [...dup].sort((a, b) => a - b);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd /Users/angus/dev/token-spread && bun test tests/registerIds.test.ts`
Expected: PASS, 3 tests. `loadRegister().length` is 187.

- [ ] **Step 8: Point the schema test at the shared loader**

In `tests/registerSchema.test.ts`, replace lines 14-19 (the `COHORTS` array, the local `type Entry`, and the `entries` construction) with:

```ts
import { loadRegister, type Entry } from "../src/register/load";

const entries: Entry[] = loadRegister();
```

Move that import up with the existing imports at the top of the file.

- [ ] **Step 9: Point the film at the manifest**

In `docs/media/render.mjs`, replace the hardcoded list at lines 47-49:

```js
const COHORTS = JSON.parse(readFileSync(join(ROOT, 'docs/research/cohorts.json'), 'utf8'));
const ENTRIES = COHORTS.flatMap((f) => JSON.parse(readFileSync(join(ROOT, 'docs/research', f), 'utf8')));
```

Keep the existing variable name the file already uses downstream — read the surrounding lines and rename to match rather than introducing `ENTRIES` if the file calls it something else.

- [ ] **Step 10: Run the full suite and the film's drift check**

```bash
cd /Users/angus/dev/token-spread
bun test
bun run typecheck
bun run render:media:check
```
Expected: all tests pass (130+3), typecheck clean, `render:media:check` reports no drift — the film's numbers were already derived, so nothing about it should change.

- [ ] **Step 11: Commit**

```bash
git add docs/research/cohorts.json src/register/load.ts src/register/ids.ts tests/registerIds.test.ts tests/registerSchema.test.ts docs/media/render.mjs
git commit -m "register: one loader and one cohort manifest, so nothing counts by hand"
```

---

### Task 2: The gate — published numbers must equal the register

`site/index.html:350` tells the reader: *"The count below is read from the verdict file, not typed."* It is typed, in 33 places across four published files, and two of them are already wrong — the README's two alt texts say **51 rejected** where the register says **52**. A screen-reader user hears the wrong number today.

This task makes that sentence true.

**Files:**
- Create: `tests/registerCounts.test.ts`
- Modify: `README.md:71`, `README.md:340`
- Test: `tests/registerCounts.test.ts`

**Interfaces:**
- Consumes: `loadRegister()`, `tally()` from Task 1.
- Produces: nothing importable. It is a gate.

- [ ] **Step 1: Write the failing test**

Create `tests/registerCounts.test.ts`:

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRegister, tally, type Tally } from "../src/register/load";

/**
 * site/index.html tells the reader "The count below is read from the verdict file, not typed."
 * It is typed — in every file below. This is what makes the sentence true: the copy stays
 * hand-written, and the numbers inside it are checked against the verdict files on every run.
 *
 * Two tests, doing different jobs. CLAIMS is the strict one: it knows which bucket each
 * sentence is claiming, so it catches a number that moved to the wrong column. The loose scan
 * catches the opposite failure — a number nobody remembered was there at all, in a second meta
 * tag or a sentence added later without a CLAIMS row.
 */

const ROOT = join(import.meta.dir, "..");
const T: Tally = tally(loadRegister());

const fill = (s: string) =>
  s.replace(/\{(total|pass|contractual|rejected|unresolved)\}/g, (_, k) => String(T[k as keyof Tally]));

/** file → the fragments that make a numeric claim, with the bucket each number comes from. */
const CLAIMS: Record<string, string[]> = {
  "README.md": [
    "{total} candidate techniques were adjudicated",
    "**{pass} pass**",
    "**{contractual} pass on",
    "**{rejected} rejected**",
    "**{unresolved} unresolved**",
    "Those four add to {total};",
    "{total} candidates sorting into {pass} that pass the bar, {contractual} that pass on the provider's word alone, {rejected} rejected and {unresolved} unresolved",
    "{total} techniques adjudicated: {pass} pass the bar, {contractual} pass on the provider's word alone, {rejected} rejected outright, {unresolved} unresolved and stated as unresolved.",
  ],
  "site/index.html": [
    "<h2>{total} candidates. {pass} survive the question.</h2>",
    '<div class="card"><h3>{pass} pass</h3>',
    `<div class="card"><h3>{contractual} on the provider's word</h3>`,
    '<div class="card"><h3>{rejected} rejected</h3>',
    '<div class="card"><h3>{unresolved} unresolved</h3>',
    "Those four add to {total}.",
  ],
  "site/methods.html": [
    "{total} techniques adjudicated against one question",
    "{pass} survive.",
    "<h2>{total} techniques. {pass} survive.</h2>",
    "<li><strong>{pass}</strong> pass the bar</li>",
    `<li><strong>{contractual}</strong> pass on the provider's word alone</li>`,
    "<li><strong>{rejected}</strong> rejected outright</li>",
    "<li><strong>{unresolved}</strong> unresolved — stated as unresolved, never counted as savings</li>",
    "Those four add to {total}.",
    "Each of the {pass} is graded",
    "The other {contractual}",
  ],
  "site/index-scroll.html": [
    "{total} techniques adjudicated, {pass} pass.",
    `<figcaption class="reg-t" id="reg-t">{total} candidate techniques, adjudicated</figcaption>`,
    `<div class="reg-row"><dt>pass</dt><dd class="num">{pass}</dd></div>`,
    `<div class="reg-row"><dt>provider's word only</dt><dd class="num">{contractual}</dd></div>`,
    `<div class="reg-row"><dt>rejected</dt><dd class="num">{rejected}</dd></div>`,
    `<div class="reg-row"><dt>unresolved</dt><dd class="num">{unresolved}</dd></div>`,
    "The four add to {total}.",
    `<h2 data-act-reveal="1" id="h-bar">{total} techniques. {pass} survive.</h2>`,
  ],
  "docs/research/SCHEMA.md": ["all {total} entries"],
};

test("every published claim carries the register's own numbers", () => {
  const missing: string[] = [];
  for (const [file, fragments] of Object.entries(CLAIMS)) {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const f of fragments) {
      const want = fill(f);
      if (!text.includes(want)) missing.push(`${file}: expected to contain\n      ${want}`);
    }
  }
  expect(missing, `published copy disagrees with the register:\n  ${missing.join("\n  ")}`).toEqual([]);
});

/** Words that mean the number in front of them is a register count, not a token count. */
const BUCKET_WORD = /(\d{1,4})\s+(candidates?|techniques?|passes?|pass|rejected|unresolved|survives?|survive)\b/gi;

test("no published file carries a register number that is no longer current", () => {
  const live = new Set([T.total, T.pass, T.contractual, T.rejected, T.unresolved]);
  const stale: string[] = [];
  for (const file of Object.keys(CLAIMS)) {
    const text = readFileSync(join(ROOT, file), "utf8").replace(/<[^>]+>/g, " ");
    for (const m of text.matchAll(BUCKET_WORD)) {
      const n = Number(m[1]);
      if (!live.has(n)) stale.push(`${file}: "${m[0]}" — ${n} is not a current bucket count`);
    }
  }
  expect(stale, `stale register numbers in published copy:\n  ${stale.join("\n  ")}`).toEqual([]);
});
```

- [ ] **Step 2: Run it and read the failures**

Run: `cd /Users/angus/dev/token-spread && bun test tests/registerCounts.test.ts`

Expected: FAIL on exactly two CLAIMS fragments — both README alt texts, which say `51 rejected` where the register says `52`.

If any *other* fragment fails, the fragment is a mistranscription of the copy, not a bug in the copy. Open the file, copy the real sentence, and fix the fragment. The published copy is the authority on its own wording; only the numbers inside it are this test's business.

- [ ] **Step 3: Fix the two alt texts**

`README.md:71` — change `51 rejected` to `52 rejected`:

```html
<img src="docs/media/register.gif" alt="The question, then 187 candidates sorting into 67 that pass the bar, 28 that pass on the provider's word alone, 52 rejected and 40 unresolved" width="820">
```

`README.md:340` — change `51 rejected outright` to `52 rejected outright`:

```html
<img src="docs/media/cards/register.jpg" alt="187 techniques adjudicated: 67 pass the bar, 28 pass on the provider's word alone, 52 rejected outright, 40 unresolved and stated as unresolved." width="820">
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/angus/dev/token-spread && bun test tests/registerCounts.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Prove the gate actually gates**

A check that cannot fail is not a check. Temporarily edit `site/index.html:348` to read `<h2>186 candidates.` and run the suite.

```bash
cd /Users/angus/dev/token-spread
sed -i '' 's|<h2>187 candidates\.|<h2>186 candidates.|' site/index.html
bun test tests/registerCounts.test.ts   # expect FAIL on both tests
git checkout site/index.html
bun test tests/registerCounts.test.ts   # expect PASS
```

- [ ] **Step 6: Commit**

```bash
git add tests/registerCounts.test.ts README.md
git commit -m "register: the site said its count was read, not typed — now it is, and two alt texts said 51"
```

---

### Task 3: Merge tooling

Sweep 12's harvest was lost between a markdown brief and the verdict files because merging was a manual retype. This is the tool that makes merging a command.

**Files:**
- Create: `src/register/merge.ts`, `tests/registerMerge.test.ts`
- Test: `tests/registerMerge.test.ts`

**Interfaces:**
- Consumes: `Entry`, `nextId`.
- Produces: `Candidate = Omit<Entry, "id">`, `assignIds(existing: Entry[], candidates: Candidate[]): { firstId: number; assigned: Entry[] }`, `nameCollisions(existing: Entry[], candidates: Candidate[]): { candidate: string; existingId: number }[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/registerMerge.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { Entry } from "../src/register/load";
import { assignIds, nameCollisions, type Candidate } from "../src/register/merge";

const entry = (id: number, name: string): Entry => ({
  id, name, strictVerdict: "FAIL", reasoning: "x", savings: "None",
  provenance: "primary-doc", telemetrySignal: "x", providers: ["anthropic"],
});
const candidate = (name: string): Candidate => ({
  name, strictVerdict: "PASS_ABSOLUTE", reasoning: "x", savings: "None",
  provenance: "primary-doc", telemetrySignal: "x", providers: ["anthropic"],
});

test("ids start one past the highest in use and run in submission order", () => {
  const { firstId, assigned } = assignIds([entry(0, "a"), entry(186, "b")], [candidate("c"), candidate("d")]);
  expect(firstId).toBe(187);
  expect(assigned.map((e) => e.id)).toEqual([187, 188]);
});

test("a gap in the existing ids is not filled", () => {
  const { assigned } = assignIds([entry(0, "a"), entry(9, "b")], [candidate("c")]);
  expect(assigned[0]!.id).toBe(10);
});

test("a resubmitted technique is caught however it is punctuated", () => {
  const existing = [entry(4, "Message Batches API — 50% off")];
  const hits = nameCollisions(existing, [candidate("message batches api: 50% off")]);
  expect(hits).toEqual([{ candidate: "message batches api: 50% off", existingId: 4 }]);
});

test("a genuinely new technique is not flagged", () => {
  expect(nameCollisions([entry(4, "Message Batches API")], [candidate("BullMQ job deduplication")])).toEqual([]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/angus/dev/token-spread && bun test tests/registerMerge.test.ts`
Expected: FAIL — `Cannot find module '../src/register/merge'`.

- [ ] **Step 3: Write the implementation**

Create `src/register/merge.ts`:

```ts
import type { Entry } from "./load";
import { nextId } from "./ids";

/** A candidate as a sweep hands it over: everything an entry needs except the id. */
export type Candidate = Omit<Entry, "id">;

export interface Assignment {
  firstId: number;
  assigned: Entry[];
}

export function assignIds(existing: Entry[], candidates: Candidate[]): Assignment {
  const firstId = nextId(existing);
  return { firstId, assigned: candidates.map((c, i) => ({ ...c, id: firstId + i })) };
}

/**
 * Same technique, different wording. Twelve sweeps have resubmitted the batch API under four
 * names; punctuation and case are not evidence of novelty, so they are stripped before compare.
 */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function nameCollisions(
  existing: Entry[],
  candidates: Candidate[],
): { candidate: string; existingId: number }[] {
  const index = new Map(existing.map((e) => [norm(e.name), e.id]));
  const hits: { candidate: string; existingId: number }[] = [];
  for (const c of candidates) {
    const existingId = index.get(norm(c.name));
    if (existingId !== undefined) hits.push({ candidate: c.name, existingId });
  }
  return hits;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/angus/dev/token-spread && bun test tests/registerMerge.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/register/merge.ts tests/registerMerge.test.ts
git commit -m "register: ids assigned by a tool, and a resubmission caught before it lands twice"
```

---

### Task 4: Staleness report and the `register` CLI

The register's entries cite sources read on a date. Nothing currently reports which of them have gone quiet — a provider can reprice or withdraw a feature and the entry stays confident. Note the honest limit: `verifiedAgainst` is prose, and several entries carry no date at all. Those are reported as unknown, not as fresh.

**Files:**
- Create: `src/register/stale.ts`, `src/register/cli.ts`, `tests/registerStale.test.ts`
- Modify: `package.json` scripts
- Test: `tests/registerStale.test.ts`

**Interfaces:**
- Consumes: `Entry`, `loadRegister`, `tally`, `nextId`, `duplicateIds`.
- Produces: `staleness(entries: Entry[], asOf: string): Staleness[]` where `Staleness = { id: number; name: string; verifiedOn: string | null; ageDays: number | null }`.

- [ ] **Step 1: Write the failing test**

Create `tests/registerStale.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { Entry } from "../src/register/load";
import { staleness } from "../src/register/stale";

const withSource = (id: number, verifiedAgainst?: string): Entry => ({
  id, name: `e${id}`, strictVerdict: "PASS_ABSOLUTE", reasoning: "x", savings: "None",
  provenance: "primary-doc", telemetrySignal: "x", providers: ["anthropic"],
  ...(verifiedAgainst === undefined ? {} : { verifiedAgainst }),
});

test("a date inside prose is found and aged", () => {
  const [r] = staleness([withSource(1, "platform.claude.com/docs/pricing (WebFetch 2026-08-01)")], "2026-08-17");
  expect(r!.verifiedOn).toBe("2026-08-01");
  expect(r!.ageDays).toBe(16);
});

test("an entry with no verifiedAgainst is unknown, not fresh", () => {
  const [r] = staleness([withSource(2)], "2026-08-17");
  expect(r!.verifiedOn).toBeNull();
  expect(r!.ageDays).toBeNull();
});

test("a source with no date in it is unknown, not fresh", () => {
  const [r] = staleness([withSource(3, "github.com/maximhq/bifrost plugins/semanticcache/stream.go")], "2026-08-17");
  expect(r!.verifiedOn).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/angus/dev/token-spread && bun test tests/registerStale.test.ts`
Expected: FAIL — `Cannot find module '../src/register/stale'`.

- [ ] **Step 3: Write the implementation**

Create `src/register/stale.ts`:

```ts
import type { Entry } from "./load";

/**
 * `verifiedAgainst` is prose — "(WebFetch, this session)", a file path, a docs URL with an
 * ms.date in it. A missing date is reported as unknown rather than treated as fresh: this
 * report exists to find entries nobody has re-read, and a silent default of "today" would
 * hide exactly those.
 */
const DATE = /\b20\d{2}-\d{2}-\d{2}\b/;

export interface Staleness {
  id: number;
  name: string;
  verifiedOn: string | null;
  ageDays: number | null;
}

export function staleness(entries: Entry[], asOf: string): Staleness[] {
  const now = Date.parse(asOf);
  return entries.map((e) => {
    const src = typeof e.verifiedAgainst === "string" ? e.verifiedAgainst : "";
    const hit = DATE.exec(src);
    const verifiedOn = hit ? hit[0] : null;
    return {
      id: e.id,
      name: e.name,
      verifiedOn,
      ageDays: verifiedOn === null ? null : Math.floor((now - Date.parse(verifiedOn)) / 86_400_000),
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/angus/dev/token-spread && bun test tests/registerStale.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the CLI**

Create `src/register/cli.ts`. Match `src/cli.ts`'s idiom: one list of verbs so help and dispatch cannot disagree, and a clean one-line refusal with exit 2.

```ts
#!/usr/bin/env bun
import { loadRegister, tally } from "./load";
import { duplicateIds, nextId } from "./ids";
import { staleness } from "./stale";

/** Every verb the program accepts. One list, so --help and dispatch cannot disagree. */
const VERBS = [
  { name: "stat", desc: "the four buckets, as the site publishes them" },
  { name: "next-id", desc: "the id the next entry takes" },
  { name: "stale", desc: "entries by how long since their source was last read" },
  { name: "check", desc: "duplicate ids; exit 1 if any" },
] as const;

const verb = process.argv[2];
const known = new Set(VERBS.map((v) => v.name));

if (verb === undefined || verb === "--help" || !known.has(verb as never)) {
  const width = Math.max(...VERBS.map((v) => v.name.length));
  const lines = VERBS.map((v) => `  ${v.name.padEnd(width)}  ${v.desc}`).join("\n");
  const out = verb === undefined || verb === "--help" ? console.log : console.error;
  out(`usage: bun run register <verb>\n\n${lines}`);
  process.exit(verb === undefined || verb === "--help" ? 0 : 2);
}

const entries = loadRegister();

if (verb === "stat") {
  const t = tally(entries);
  console.log(
    `total ${t.total}\npass ${t.pass}\ncontractual ${t.contractual}\nrejected ${t.rejected}\nunresolved ${t.unresolved}`,
  );
} else if (verb === "next-id") {
  console.log(nextId(entries));
} else if (verb === "stale") {
  const asOf = new Date().toISOString().slice(0, 10);
  const rows = staleness(entries, asOf).sort((a, b) => (b.ageDays ?? Infinity) - (a.ageDays ?? Infinity));
  const unknown = rows.filter((r) => r.ageDays === null).length;
  for (const r of rows) {
    const age = r.ageDays === null ? "  never dated" : `${String(r.ageDays).padStart(6)}d`;
    console.log(`${String(r.id).padStart(4)}  ${age}  ${r.name.slice(0, 78)}`);
  }
  console.error(`\n${rows.length} entries, ${unknown} carrying no readable date`);
} else {
  const dup = duplicateIds(entries);
  if (dup.length > 0) {
    console.error(`ids used more than once: ${dup.join(", ")}`);
    process.exit(1);
  }
  console.log(`${entries.length} entries, no duplicate ids`);
}
```

- [ ] **Step 6: Add the scripts**

In `package.json`, add alongside the existing entries:

```json
"register": "bun run src/register/cli.ts",
"register:stat": "bun run src/register/cli.ts stat",
"register:stale": "bun run src/register/cli.ts stale"
```

- [ ] **Step 7: Run the CLI and check the numbers against the site**

```bash
cd /Users/angus/dev/token-spread
bun run register:stat
```
Expected, before any merge: `total 187 / pass 67 / contractual 28 / rejected 52 / unresolved 40` — identical to what `site/index.html` publishes.

```bash
bun run register:stale | head -20
bun run register -- check
bun test && bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/register/stale.ts src/register/cli.ts tests/registerStale.test.ts package.json
git commit -m "register: a verb for the tally, the next id, and which sources have gone quiet"
```

---

### Task 5: Recover the thirteen entries sweep 12 stranded

`docs/research/2026-08-12-exhaustion-statement.md` adjudicated fifteen entries and numbered them 185-199. Two reached the verdict files under different ids (the TTL flip is id 184, DeepSeek is id 185). Thirteen never landed. This task lands them at ids 187-199 — the research is already done and cited; what is missing is the schema shape and a re-read of each source.

This task is research-shaped, not test-first: the deliverable is data, and the schema test is the gate it must pass.

**Files:**
- Create: `docs/research/2026-08-17-sweep-12-recovered.json`
- Modify: `docs/research/cohorts.json`
- Test: `tests/registerSchema.test.ts`, `tests/registerIds.test.ts`, `tests/registerCounts.test.ts` (all existing)

**Interfaces:**
- Consumes: `Candidate`, `assignIds`, `nameCollisions` from Task 3.
- Produces: thirteen `Entry` objects at ids 187-199.

The thirteen, with the brief's own id and the section it sits in:

| Brief id | Name | Brief's verdict |
|---|---|---|
| 185 | K8s CronJob `concurrencyPolicy: Forbid/Replace` | PASS_ABSOLUTE |
| 186 | BullMQ job deduplication (Simple Mode) | PASS_ABSOLUTE |
| 187 | AWS SQS FIFO `MessageDeduplicationId` | PASS_ABSOLUTE |
| 188 | Reservation amortization (pure accounting) | PASS_ABSOLUTE |
| 189 | gRPC retry throttling (token-bucket retry budget) | PASS_SCHEDULING |
| 191 | Team/Enterprise per-seat pricing as the sanctioned alternative to account sharing | CONTRACTUAL_ONLY |
| 193 | Azure PTU Reservations — exit/cancellation mechanics | CONTRACTUAL_ONLY |
| 194 | AWS Bedrock Provisioned Throughput has no exit | FAIL (REFUTED) |
| 195 | No EC2-RI-Marketplace-style secondary market exists for LLM capacity | FAIL (REFUTED) |
| 196 | Automated/non-human access ban vs Claude Code's API-key carve-out | INSUFFICIENT_EVIDENCE |
| 197 | Moonshot/Kimi cache — no output-invariance statement in their docs | INSUFFICIENT_EVIDENCE |
| 198 | PromptXRay (karminski) — read-only cache-hit diagnostic | INSUFFICIENT_EVIDENCE |
| 199 | Who captures a mid-term list-price decrease on committed-spend/PTU agreements | INSUFFICIENT_EVIDENCE |

- [ ] **Step 1: Re-read each source before trusting the brief's quote**

For each of the thirteen, fetch the cited source and confirm the quote is present and current as of 2026-08-17. The brief's quotes are five days old; the register's standard is to cite what you actually read, with the date you read it.

Where a quote no longer matches, that is a finding, not an obstacle: record it in the entry's `corrections` array with `kind: "source-corrected"`.

- [ ] **Step 2: Write the thirteen entries**

Create `docs/research/2026-08-17-sweep-12-recovered.json` as a JSON array of thirteen objects at ids 187-199 in the table's order. Every object carries all eight required fields from `docs/research/SCHEMA.md`: `id`, `name`, `strictVerdict`, `reasoning`, `savings`, `provenance`, `telemetrySignal`, `providers` — plus `verifiedAgainst` with the 2026-08-17 re-read.

Shape, using the first entry as the worked example:

```json
[
  {
    "id": 187,
    "name": "K8s CronJob concurrencyPolicy: Forbid/Replace — time-overlap suppression of a duplicate run",
    "strictVerdict": "PASS_ABSOLUTE",
    "reasoning": "Structural, not documentary: the skipped run never sends a request, so there is no forward pass to differ. kubernetes.io states \"if it is time for a new Job run and the previous Job run hasn't finished yet, the CronJob skips the new Job run.\" The suppression is on time overlap alone with no content check, so this passes only where the job is independently known idempotent — a long-running job that would have processed different data on its second invocation is not made safe by this setting.",
    "savings": "UNQUANTIFIED — equals the cost of the suppressed runs, which is a property of the customer's schedule and job duration, not of the mechanism.",
    "provenance": "primary-doc",
    "telemetrySignal": "Content-blind and observable: a scheduled workload whose request count is lower than its cron cadence would predict, with no corresponding error rate.",
    "providers": ["kubernetes"],
    "verifiedAgainst": "kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/ (re-read 2026-08-17)"
  }
]
```

Write the remaining twelve to the same standard. The brief's "Maintainer note" asks whether 185-187 should collapse into one row with three citations; keep them separate, matching the register's existing Family E idiom, and say so in the sweep brief.

- [ ] **Step 3: Add the cohort to the manifest**

`docs/research/cohorts.json`:

```json
[
  "2026-08-10-verdicts-final.json",
  "2026-08-12-addendum.json",
  "2026-08-17-sweep-12-recovered.json"
]
```

- [ ] **Step 4: Run the gates and watch the counts test fail**

```bash
cd /Users/angus/dev/token-spread
bun test
```

Expected:
- `registerSchema.test.ts` PASSES — the thirteen are correctly shaped.
- `registerIds.test.ts` PASSES — 187-199 are free.
- `registerCounts.test.ts` **FAILS** — the register now holds 200 and every published file still says 187. This is the gate doing its job.

Record the new tally:

```bash
bun run register:stat
```

- [ ] **Step 5: Update the published numbers**

Update all 33 claim sites listed in `tests/registerCounts.test.ts` under `CLAIMS`, in `README.md`, `site/index.html`, `site/methods.html`, `site/index-scroll.html`, `docs/research/SCHEMA.md`. The test names every fragment it expected and what it expected — work down its failure output.

Also update the two prose sentences the test does not cover:
- `site/index.html:363-365` names "Four arrived here on 2026-08-12, expelled from the pass column" — still true, leave it.
- `docs/research/SCHEMA.md` closing paragraph describes the four corrections — still true, leave it.

- [ ] **Step 6: Run everything, including the film**

```bash
cd /Users/angus/dev/token-spread
bun test && bun run typecheck
bun run render:media:check
```
Expected: tests pass. `render:media:check` **reports drift** — the film's dot count is derived from the cohort files, so 13 new entries change it.

```bash
bun run render:media
bun run render:media:check
```
Expected: regenerated, then clean.

- [ ] **Step 7: Serve the site and run the page checks**

```bash
cd /Users/angus/dev/token-spread/site && python3 -m http.server 8740 &
cd /Users/angus/dev/token-spread
bun run check:page
bun run check:page:self
kill %1
```
Expected: page checks pass; the self-test confirms the checks can fail.

- [ ] **Step 8: Commit**

```bash
git add docs/research/2026-08-17-sweep-12-recovered.json docs/research/cohorts.json README.md site/index.html site/methods.html site/index-scroll.html docs/research/SCHEMA.md docs/media/register.gif docs/media/register.mp4
git commit -m "register: the thirteen entries sweep 12 adjudicated and never merged"
```

---

### Task 6: Sweep 13 — the fan-out

Ten axes. Two are the ones the exhaustion statement calls structurally open; six have never been swept; two extend families that sweep 12 opened and did not finish.

This task produces candidates, not verdicts. It is deliberately not test-first — the deliverable is research, and Task 7 is its adversary.

**Files:**
- Create: `docs/research/2026-08-17-sweep-13-candidates.json` (working file, not a cohort)
- Test: none. Task 7 and the schema test are the gates.

**Interfaces:**
- Produces: an array of `{ name, mechanism, quote, sourceUrl, providers, savings, proposedVerdict, whyNovel }` for Task 7.

**Every agent in this task is read-only on the repository.** It returns JSON. It does not write files, does not edit the register, and does not commit. An agent with write tools in this repo will implement and commit uninvited.

**The dedupe input:** every agent is given `/private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/scratchpad/existing-187.txt` (regenerate it against the post-Task-5 register: `jq -r '.[] | "\(.id)|\(.strictVerdict)|\(.name)"' docs/research/*.json`) and told to propose nothing already on it.

**The bar, given to every agent verbatim:**

> One question decides every candidate: does the model read a different sequence of tokens, does a different model answer, or does a different amount of thinking happen? If yes, it is `FAIL` — a changed product sold as a saving.
> `PASS_ABSOLUTE` = nothing on the wire changed. `PASS_METADATA` = only a field the model never reads changed. `PASS_SCHEDULING` = only *when* the request was sent changed. `PASS_REPLAY` = a stored response hash-matches a byte-identical repeat. `CONTRACTUAL_ONLY` = the provider asserts identity and we cannot verify it. `INSUFFICIENT_EVIDENCE` = we could not settle it.
> A documentation sentence is the provider's word, however clearly it reads, and caps at `CONTRACTUAL_ONLY`. Only a measurement or a structural argument — no output was generated, no request was ever sent — supports `PASS_ABSOLUTE`.
> Scope is the hosted-API customer. Serving-stack internals are out of scope unless the customer runs the gateway.
> Every candidate needs a verbatim quote and a URL. A paraphrase dressed as a quote is the one thing sweep 12 caught and rejected outright.

**The ten axes:**

| # | Axis | Why it is worth a pass |
|---|---|---|
| 1 | Anthropic surfaces changed since 2026-08-12 | The exhaustion statement's own "structurally cannot be dry" axis. Docs, changelog, pricing, release notes. |
| 2 | OpenAI · Google/Vertex · AWS Bedrock · Azure, changed since 2026-08-12 | Same axis, other providers. |
| 3 | Greater China providers | Baidu ERNIE, ByteDance Doubao/Volcengine, Tencent Hunyuan, iFlytek Spark, MiniMax, StepFun, Baichuan, 01.AI, SenseTime. Sweep 12 checked three of dozens. |
| 4 | Rest-of-world providers | Naver HyperCLOVA X, Upstage Solar, LG EXAONE, Sakana, PFN, Sarvam, Krutrim, Mistral, Aleph Alpha, AI21, Cohere, Reka, Yandex, GigaChat. Untouched by construction. |
| 5 | Off-peak and time-of-day pricing as a family | DeepSeek's off-peak discount is real and registered; nobody has asked who else does it. A `PASS_SCHEDULING` family, the register's thinnest bucket at one entry. |
| 6 | Billing and FinOps layer | SLA and outage credits, billing-error dispute paths, credit expiry, tax/VAT/withholding, billing currency, payment rails, marketplace/CSP/reseller channels, AWS EDP/PPA, Azure MACC burn-down, GCP CUD, startup/research credit programmes. Never swept. |
| 7 | Client-SDK waste and double-billing failure modes | Retry and timeout defaults across the official Anthropic SDKs (python, typescript, go, java), streaming-drop handling, connection reuse, what exactly a retry re-bills. The register has one entry on this and it is inferred. |
| 8 | Queue and orchestration enqueue-time dedup | Extends the K8s/BullMQ/SQS family: Temporal, Celery, Sidekiq, Airflow, Dagster, Step Functions, Cloud Tasks, Kafka idempotent producer, Oban, RQ. |
| 9 | Gateway and proxy layer, as shipped today | LiteLLM, Portkey, Helicone, Bifrost, Cloudflare AI Gateway, OpenRouter, Requesty, Kong AI Gateway, Apigee, Envoy AI Gateway, Higress — exact-match dedup, single-flight coalescing, budget guards. The register's existing entries here are up to a year old. |
| 10 | Anthropic product-surface cost mechanics | Claude Code, Agent SDK, Managed Agents, the Admin API's usage and cost endpoints, workspaces and spend limits, the seat/usage-credit boundary. |

- [ ] **Step 1: Regenerate the dedupe list against the post-Task-5 register**

```bash
cd /Users/angus/dev/token-spread
jq -r '.[] | "\(.id)|\(.strictVerdict)|\(.name)"' \
  docs/research/2026-08-10-verdicts-final.json \
  docs/research/2026-08-12-addendum.json \
  docs/research/2026-08-17-sweep-12-recovered.json \
  > /private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/scratchpad/existing-200.txt
wc -l /private/tmp/claude-501/-Users-angus/39e318fe-66fb-410c-a83c-e148db77ba8b/scratchpad/existing-200.txt
```
Expected: 200.

- [ ] **Step 2: Run ten finders, one per axis, in parallel**

Each returns:

```json
{
  "candidates": [
    {
      "name": "one line, the technique",
      "mechanism": "what actually happens, at the level of what the model reads",
      "quote": "verbatim from the source, not paraphrased",
      "sourceUrl": "https://…",
      "providers": ["…"],
      "savings": "the size of the prize, or UNQUANTIFIED, or None",
      "proposedVerdict": "one of the seven",
      "whyNovel": "why this is not any of the 200 entries in the dedupe list"
    }
  ]
}
```

An agent that finds nothing on its axis returns `{"candidates": []}`. That is a result, and the brief will say so — a sweep that reports finding something on every axis is a sweep that is padding.

- [ ] **Step 3: Barrier, then dedupe across axes**

Collect all ten before deduping — cross-axis collisions are certain (off-peak will collide with the regional axes, gateways with queues). One pass marks each candidate `novel`, `duplicate-of-<id>`, or `restatement-of-<id>`.

- [ ] **Step 4: Write the working file**

Write survivors to `docs/research/2026-08-17-sweep-13-candidates.json`. Not a cohort, not in `cohorts.json` — it is the input to Task 7.

- [ ] **Step 5: Commit the working file**

```bash
git add docs/research/2026-08-17-sweep-13-candidates.json
git commit -m "sweep 13: candidates from ten axes, deduped against the standing 200"
```

---

### Task 7: Sweep 13 — adjudication and adversarial verification

The register's value is that its passing column is small and survives attack. Every candidate gets a verdict; every candidate proposed as a pass gets two independent attempts to refute it.

**Files:**
- Create: `docs/research/2026-08-17-sweep-13.json`
- Modify: `docs/research/cohorts.json`
- Test: `tests/registerSchema.test.ts`, `tests/registerIds.test.ts`, `tests/registerCounts.test.ts`

**Interfaces:**
- Consumes: `docs/research/2026-08-17-sweep-13-candidates.json`, `assignIds` from Task 3.
- Produces: a cohort of `Entry` objects starting at id 200.

- [ ] **Step 1: Adjudicate in batches of four**

Each adjudicator gets four candidates and the bar verbatim, and adjudicates each independently — explicitly instructed not to let one candidate's reasoning bleed into the next. It returns the full eight required schema fields plus `verifiedAgainst`, and `settlingExperiment` for anything landing on `INSUFFICIENT_EVIDENCE`.

- [ ] **Step 2: Refute every proposed pass, twice, independently**

For each candidate whose adjudicated verdict starts with `PASS_`, two agents each try to **refute** it, prompted to default to refuted when uncertain:

> Try to refute this verdict. The claim is that [name] leaves the model reading the same bytes. Find the case where it does not. Check specifically: does the mechanism have a content-blind trigger, or does it inspect the request? At temperature > 0, does it collapse independent samples into one frozen sample? Does the cited quote actually say what the reasoning claims, or is it a paraphrase? If you cannot settle it, return refuted: true.

A candidate survives only if both refuters fail to refute it. One refutation demotes it to `CONTRACTUAL_ONLY` or `INSUFFICIENT_EVIDENCE`; two demote it to `FAIL` with the refutation quoted in `reasoning`.

- [ ] **Step 3: Completeness critic**

One agent reads the ten axes, the candidate file, and the final verdicts, and answers: which axis was searched shallowly, which claim rests on a single source, which verdict is the panel's inference rather than a quote. Its findings become either a further round or an explicit paragraph in the brief naming what was not covered. A sweep that reports no gaps has not looked.

- [ ] **Step 4: Write the cohort with tool-assigned ids**

```bash
cd /Users/angus/dev/token-spread
bun run register -- next-id
```
Expected: 200. Write `docs/research/2026-08-17-sweep-13.json` starting at that id, in adjudication order.

- [ ] **Step 5: Add to the manifest and run every gate**

`docs/research/cohorts.json` gains `"2026-08-17-sweep-13.json"`.

```bash
bun test
```
Expected: schema and ids PASS; `registerCounts` FAILS with the new tally. Then update all 33 claim sites from its failure output, exactly as in Task 5 Step 5.

```bash
bun run register:stat
bun test && bun run typecheck
bun run render:media && bun run render:media:check
```

- [ ] **Step 6: Page checks**

```bash
cd /Users/angus/dev/token-spread/site && python3 -m http.server 8740 &
cd /Users/angus/dev/token-spread
bun run check:page && bun run check:page:self
kill %1
```

- [ ] **Step 7: Commit**

```bash
git add docs/research/2026-08-17-sweep-13.json docs/research/cohorts.json README.md site/ docs/research/SCHEMA.md docs/media/register.gif docs/media/register.mp4
git commit -m "sweep 13: adjudicated, refuted twice where it passes, merged"
```

---

### Task 8: The brief, and an exhaustion statement that is honest about sweep 13

**Files:**
- Create: `docs/research/2026-08-17-sweep-13.md`
- Modify: `docs/research/2026-08-12-exhaustion-statement.md` (append a pointer only — corrections are appended, never edited away)

- [ ] **Step 1: Write the brief**

`docs/research/2026-08-17-sweep-13.md`, following `2026-08-12-exhaustion-statement.md`'s structure:

1. **The merge that was missing.** Sweep 12 adjudicated fifteen and landed two; thirteen sat in a markdown brief for five days with ids that collided with the verdict files. What now prevents it: `cohorts.json`, `registerIds.test.ts`, `bun run register -- next-id`.
2. **New entries by tier**, with the id each actually received — never the brief-local numbering that caused this.
3. **Axes that returned nothing**, named individually. This is the section that makes the sweep falsifiable.
4. **What the refuters killed** — candidates that arrived proposed as passes and did not survive. Sweep 12 had none of this section; it is the strongest evidence the bar is real.
5. **The revised exhaustion statement**, replacing 2026-08-12's, and repeating its honest sentence: the newest-surfaces axis is generated by providers' release cadence, not by search effort, so "every method possible" is a snapshot claim with a date on it.
6. **Still needing a live account.** The four items, unchanged, plus anything sweep 13 adds. `ANTHROPIC_API_KEY` is the single blocker.

- [ ] **Step 2: Point the old statement forward**

Append one line to the end of `docs/research/2026-08-12-exhaustion-statement.md`:

```markdown
---

**Superseded 2026-08-17** by [`2026-08-17-sweep-13.md`](2026-08-17-sweep-13.md), which merged the
thirteen entries this brief adjudicated and never landed. This document stays as written; the
numbering it used (185-199) is brief-local and collided with the verdict files — see the successor
for the ids these entries actually carry.
```

- [ ] **Step 3: Full verification**

```bash
cd /Users/angus/dev/token-spread
bun test && bun run typecheck
bun run register -- check
bun run register:stat
bun run render:media:check
cd site && python3 -m http.server 8740 &
cd /Users/angus/dev/token-spread && bun run check:page && bun run check:page:self && bun run shoot:audit:check
kill %1
```

Every one of these must pass before the branch is offered for review. `shoot:audit:check` matters because the audit screenshots are pictures of a generated document — if `src/render/auditHtml.ts` was untouched they should be clean, and if they are not, that is a finding.

- [ ] **Step 4: Commit**

```bash
git add docs/research/2026-08-17-sweep-13.md docs/research/2026-08-12-exhaustion-statement.md
git commit -m "sweep 13: the brief, and what the axes that returned nothing tell us"
```

- [ ] **Step 5: Stop. Do not deploy.**

`deploy.sh` is manual by design. Report the branch, the new tally, and what the refuters killed. Angus runs the deploy.

---

## Self-Review

**Spec coverage.** "Find more" is Tasks 5-7 (thirteen recovered, ten axes swept). "Best system in the world" is Tasks 1-4 — the drift that stranded sweep 12 becomes a test failure, and the site's claim that its count is "read, not typed" becomes true. Task 8 publishes.

**Known gaps, stated rather than hidden:**
- The four live-account items stay unresolved. No `ANTHROPIC_API_KEY`. Sweep 13 cannot settle them and must not pretend to.
- No CI. Every gate here runs on demand; nothing runs them automatically on push. Worth a follow-up, deliberately out of scope — this branch should not also introduce a GitHub Actions surface to a private repo without asking.
- `registerCounts`'s loose scan checks that a number is *a* current bucket count, not the *right* one. The `CLAIMS` table is what enforces per-bucket correctness; the scan only catches numbers nobody remembered were there.
- Task 5's thirteen entries need each source re-read. If a source moved in five days, that is a `corrections` entry, not a reason to skip it.

**Type consistency.** `Entry`, `Tally`, `Candidate`, `Staleness` are defined once in `src/register/` and imported everywhere else. `loadRegister()`, `tally()`, `nextId()`, `duplicateIds()`, `assignIds()`, `nameCollisions()`, `staleness()` are the full surface; no task references a function no task defines.
