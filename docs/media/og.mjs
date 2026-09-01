#!/usr/bin/env node
/**
 * Renders the GitHub social-preview image (1280x640, <1MB) to docs/img/gh-og-share-image.jpg
 * over the Higgsfield og backdrop (docs/media/art/og.jpg, provenance.json). Register numbers
 * are computed at render time, same discipline as banner.mjs — GitHub has no upload API, so
 * the one manual step is Settings > Social preview > Upload.
 *
 *   node docs/media/og.mjs
 */
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
if (!entries.length) throw new Error("refusing to render with an empty register");

const b64 = (p, mime) => `data:${mime};base64,${readFileSync(join(ROOT, p)).toString("base64")}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'IBM Plex Sans';src:url('${b64("site/assets/fonts/plex-sans-var.woff2", "font/woff2")}') format('woff2');font-weight:400 700}
@font-face{font-family:'IBM Plex Mono';src:url('${b64("site/assets/fonts/plex-mono-400.woff2", "font/woff2")}') format('woff2');font-weight:400}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1280px;height:640px;background:#0c1110;color:#eef3f1;position:relative;overflow:hidden;
  font-family:'IBM Plex Sans',sans-serif;-webkit-font-smoothing:antialiased;
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.veil{position:absolute;inset:0;background:radial-gradient(90% 80% at 50% 45%,rgba(12,17,16,.55) 0%,rgba(12,17,16,.88) 100%)}
.top{display:flex;align-items:center;gap:14px;margin-bottom:30px;position:relative}
.dot{width:14px;height:14px;border-radius:50%;background:#3ddc84;box-shadow:0 0 0 7px rgba(61,220,132,.13)}
.name{font-family:'IBM Plex Mono',monospace;font-size:21px;letter-spacing:.03em;color:#9fb2ab}
h1{font-size:64px;line-height:1.08;letter-spacing:-.03em;font-weight:700;position:relative}
h1 em{font-style:normal;color:#3ddc84}
.strip{margin-top:40px;display:flex;gap:0;border:1px solid #26302e;border-radius:12px;overflow:hidden;position:relative}
.s{padding:16px 30px;border-right:1px solid #26302e;background:rgba(20,27,25,.82)}
.s:last-child{border-right:none}
.s b{display:block;font-family:'IBM Plex Mono',monospace;font-size:26px;font-weight:600;font-variant-numeric:tabular-nums}
.s b.acc{color:#3ddc84}
.s span{display:block;font-size:11.5px;letter-spacing:.11em;text-transform:uppercase;color:#6d817a;margin-top:5px}
</style></head><body>
  <img class="bg" src="${b64("docs/media/art/og.jpg", "image/jpeg")}">
  <div class="veil"></div>
  <div class="top"><div class="dot"></div><div class="name">angusbuilds/token-spread</div></div>
  <h1>The same request.<br>The same model.<br><em>A smaller bill.</em></h1>
  <div class="strip">
    <div class="s"><b class="acc">${entries.length}</b><span>techniques adjudicated</span></div>
    <div class="s"><b>${pass}</b><span>pass the identity bar</span></div>
    <div class="s"><b>0</b><span>bytes written</span></div>
  </div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 640, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "networkidle0" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(ROOT, "docs/img/gh-og-share-image.jpg"), type: "jpeg", quality: 92 });
await browser.close();
console.log(`og image rendered: total=${entries.length} pass=${pass}`);
