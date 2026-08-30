/**
 * Lands sweep 17 — the six-territory expansion (academic papers, inference specialists,
 * edge/CDN caching, enterprise FinOps, cross-industry transplants round 2, Claude Code 2026).
 * Raw adjudicated output: 2026-08-30-sweep-17-raw.json (40 mined, 0 name collisions at mine
 * time, 36 kept after adjudication, 17 claimed passes attacked by two refuters each, 5
 * lowered, the advocate's one upgrade proposal killed by its skeptics).
 *
 * Maintainer decisions applied to the raw file before this script (recorded per entry in
 * crosscheckOverride): Fireworks restored FAIL→CONTRACTUAL_ONLY for category coherence —
 * the batch-nondeterminism argument indicts the whole vendor-asserted-identity class, not
 * one vendor.
 *
 *   bun run docs/research/raw/land-sweep-17.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRegister } from "../../../src/register/load";
import { assignIds, nameCollisions } from "../../../src/register/merge";

const DIR = join(import.meta.dir, "..");
const COHORT = "2026-08-30-sweep-17.json";

const candidates = JSON.parse(readFileSync(join(import.meta.dir, "2026-08-30-sweep-17-raw.json"), "utf8"));
const existing = loadRegister();

const collisions = nameCollisions(existing, candidates);
if (collisions.length) {
  console.error(`name collisions with the register — refusing to land:\n  ${collisions.join("\n  ")}`);
  process.exit(1);
}

const { assigned } = assignIds(existing, candidates);
writeFileSync(join(DIR, COHORT), JSON.stringify(assigned, null, 2) + "\n");

const manifest = JSON.parse(readFileSync(join(DIR, "cohorts.json"), "utf8"));
if (!manifest.includes(COHORT)) {
  manifest.push(COHORT);
  writeFileSync(join(DIR, "cohorts.json"), JSON.stringify(manifest, null, 2) + "\n");
}
console.log(`landed ${assigned.length} entries as ids ${assigned[0].id}-${assigned[assigned.length - 1].id}`);
