#!/usr/bin/env node
/**
 * Renders docs/img/banner.html to docs/img/banner.png (2x) with every number computed at
 * render time. The template ships em-dash placeholders in its stat row on purpose: 66/123
 * sat there hand-typed for weeks while the register moved to 335 and the suite to 276 —
 * the same defect publishedCounts.test.ts exists to catch, in a picture where no test
 * could see it. Now the picture is a function of the data, like the cards and the film.
 *
 *   node docs/media/banner.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire("/Users/angus/skills/package.json");
const puppeteer = require("puppeteer-core");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const entries = JSON.parse(readFileSync(join(ROOT, "docs/research/cohorts.json"), "utf8"))
  .flatMap((f) => JSON.parse(readFileSync(join(ROOT, "docs/research", f), "utf8")));
const pass = entries.filter((e) => /^PASS_/.test(e.strictVerdict)).length;

// Same instrument as tests/publishedTestCount.test.ts: run the suite, read bun's own tally.
const out = execSync("bun test 2>&1 | grep -E '^ *[0-9]+ pass$'", { cwd: ROOT, encoding: "utf8" });
const tests = Number(out.trim().split(" ")[0]);
if (!tests || !entries.length) throw new Error("refusing to render a banner with empty numbers");

let html = readFileSync(join(ROOT, "docs/img/banner.html"), "utf8");
// Inline assets so the rendered page has no file dependencies.
const b64 = (p, mime) => `data:${mime};base64,${readFileSync(join(ROOT, p)).toString("base64")}`;
html = html
  .replace("data-backdrop alt=\"\"", `data-backdrop alt="" src="${b64("docs/media/art/hero.jpg", "image/jpeg")}"`)
  .replace("../../site/assets/fonts/plex-sans-var.woff2", b64("site/assets/fonts/plex-sans-var.woff2", "font/woff2"))
  .replace("../../site/assets/fonts/plex-mono-400.woff2", b64("site/assets/fonts/plex-mono-400.woff2", "font/woff2"))
  .replace("../../site/assets/fonts/plex-mono-600.woff2", b64("site/assets/fonts/plex-mono-600.woff2", "font/woff2"));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 640, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "networkidle0" });
await page.evaluate((n) => {
  for (const [k, v] of Object.entries(n)) {
    document.querySelector(`[data-live="${k}"]`).textContent = String(v);
  }
}, { total: entries.length, pass, tests });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(ROOT, "docs/img/banner.png") });
await browser.close();
console.log(`banner.png rendered: total=${entries.length} pass=${pass} tests=${tests}`);
