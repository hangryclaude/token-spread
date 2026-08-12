#!/usr/bin/env node
/**
 * Generates the backdrop art for the README explainer cards, via fal.
 *
 * The division of labour is the point. A diffusion model cannot be trusted with a number, a label
 * or a word — it will render "66" as "6б" and the repo's entire claim is that it does not state
 * things it cannot support. So fal produces ABSTRACT BACKDROPS ONLY, carrying no text and no data,
 * and every figure and sentence on the finished card is real HTML rendered by cards.mjs on top.
 * If a prompt here ever asks for text, that is a bug.
 *
 * Provenance is written next to the images: model, prompt and returned seed for each file, so a
 * card can be regenerated or challenged later. Same reason the rate card carries a capture date.
 *
 *   node docs/media/fal.mjs            # generate anything missing
 *   node docs/media/fal.mjs --force    # regenerate everything (costs money)
 *
 * FAL_KEY is read from ~/.ai.env and never printed.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "art");
const MANIFEST = join(OUT, "provenance.json");

const MODEL = "fal-ai/flux/dev";

/** Shared vocabulary, so the four cards read as one set rather than four stock images. */
const HOUSE = "abstract non-representational technical illustration, no text, no letters, no numbers, "
  + "no logos, no user interface, deep near-black background #0b0f0d, a single restrained emerald "
  + "green accent #0a7d45, fine hairline geometry, generous empty space, matte, calm, editorial, "
  + "flat depth, no lens flare, no 3d render sheen";

const CARDS = [
  {
    slug: "bar",
    prompt: `${HOUSE}, two identical parallel horizontal lines held in perfect register against a dark field, one faint vertical measure between them, the composition of a comparison that finds no difference`,
  },
  {
    slug: "register",
    prompt: `${HOUSE}, a dense field of small uniform marks sorted into four unequal vertical bands of differing density, the largest band sparse and the smallest dense, an act of adjudication seen from above`,
  },
  {
    slug: "reads",
    prompt: `${HOUSE}, a stream of small particles passing through a narrow aperture where almost all of them are turned away and only a thin filtered remainder continues, restraint rather than capture`,
  },
  {
    slug: "gate",
    prompt: `${HOUSE}, a single closed horizontal barrier across an otherwise empty field with one mark stopped hard against it, the emerald accent used only at the point of contact`,
  },
  {
    slug: "bands",
    prompt: `${HOUSE}, three broad horizontal strata of visibly different particle density stacked in one dark field, the sparsest at the top and the densest at the bottom, a thin hairline separating each, geological and calm`,
  },
];

const env = Object.fromEntries(
  readFileSync(join(homedir(), ".ai.env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).replace(/^export\s+/, "").trim(),
                 l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const KEY = env.FAL_KEY;
if (!KEY) {
  console.error("no FAL_KEY in ~/.ai.env — nothing generated, and no placeholder written either");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const force = process.argv.includes("--force");
const provenance = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};

for (const card of CARDS) {
  const file = join(OUT, `${card.slug}.jpg`);
  if (existsSync(file) && !force) {
    console.log(`skip ${card.slug} — already generated (--force to redo)`);
    continue;
  }

  const res = await fetch(`https://fal.run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: card.prompt,
      image_size: { width: 1280, height: 720 },
      num_images: 1,
      num_inference_steps: 34,
      guidance_scale: 3.5,
      enable_safety_checker: true,
    }),
  });

  // No try/except around this on purpose: a failed generation must stop the run loudly rather
  // than leave a card silently composed over yesterday's art.
  if (!res.ok) {
    console.error(`fal returned ${res.status} for ${card.slug}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const body = await res.json();
  const img = body.images?.[0];
  if (!img?.url) {
    console.error(`fal returned no image for ${card.slug}: ${JSON.stringify(body).slice(0, 300)}`);
    process.exit(1);
  }

  writeFileSync(file, Buffer.from(await (await fetch(img.url)).arrayBuffer()));
  provenance[card.slug] = { model: MODEL, prompt: card.prompt, seed: body.seed ?? null,
                            width: img.width, height: img.height };
  console.log(`wrote ${card.slug}.jpg  seed=${body.seed}`);
}

writeFileSync(MANIFEST, JSON.stringify(provenance, null, 2) + "\n");
console.log(`provenance → ${MANIFEST}`);
