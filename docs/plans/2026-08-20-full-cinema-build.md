# Full-Cinema Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `site/index-scroll.html` into the Total Internal Reflection full-cinema page per `docs/specs/2026-08-20-full-cinema-design.md`, with all assets generated on Higgsfield and all sitecraft gates green.

**Architecture:** Asset generation (stills → hand-pick → conditioned video → AVIF post) runs first and in the background; page integration (calculator port, scroll-film hero, act film blocks) proceeds in parallel against placeholder frames; gates run last against the real assets. One rAF clock, one fixed ground, everything ships as AVIF.

**Tech Stack:** Higgsfield CLI (`/opt/homebrew/bin/higgs`), ffmpeg 8.1 (libsvtav1), sitecraft engines at `/Users/angus/.claude/skills/sitecraft/assets/effects/`, vanilla JS/HTML/CSS, gates at `/Users/angus/.claude/skills/sitecraft/assets/gates/`.

## Global Constraints

- Spec is law: `docs/specs/2026-08-20-full-cinema-design.md`. Truth rules override everything.
- **NO git commits, pushes, or branch changes** — working tree only (owner's standing rule; tree already carries uncommitted register-sweep edits — do not revert or "clean up" anything you didn't write).
- No video mimetypes in `site/assets/` — `.avif` only (deploy gate refuses the whole site otherwise).
- One scroll listener: everything joins `mount.js`'s `driven[]`/`tick()`. Never add a second.
- `dprMax: 1.5` on every canvas.
- All engine mounts wrapped so decorative failure leaves a flatter page, never a broken one; `window.__ready = true` in `.finally()`.
- Prompts come verbatim from the spec's Shot list — do not rewrite them.
- Credits: ~330 budgeted of 7,440. Report balance before and after each generation batch.
- Working dir for masters/intermediates: `site/assets/film-src/` (add to deploy.sh rsync excludes in Task 6; masters never ship). Shipped frames: `site/assets/film/`.

---

### Task 1: Pricing probes and generation manifest

**Files:**
- Create: `site/assets/film-src/MANIFEST.md` (job log: id, model, params, credits, output)

**Interfaces:**
- Produces: verified per-asset credit costs; a written go/no-go on conditioning cost.

- [ ] **Step 1:** `higgs account status` — record starting balance in MANIFEST.md.
- [ ] **Step 2:** Generate one throwaway soul_cinematic still (0.12 cr): `higgs generate create soul_cinematic --prompt "single green beam through glass cube, black void" --quality 2k --aspect-ratio 16:9 --wait`. Record job id + output URL.
- [ ] **Step 3:** Price conditioning for real: `higgs generate cost kling3_0_turbo --prompt t --resolution 1080p --duration 8 --start-image <that output or local file>`. Expected: 16 credits (same as unconditioned). If higher, recompute the budget table in MANIFEST.md and flag in the final report.
- [ ] **Step 4:** Verify: MANIFEST.md exists with balance + measured numbers. No entry may say "assumed".

### Task 2: Still plates — generate wide, pick by eye

**Files:**
- Create: `site/assets/film-src/plates/` (act2..act6 candidates, hero-land-start/end, hero-port-start/end, act1-poster)
- Modify: `site/assets/film-src/MANIFEST.md`

**Interfaces:**
- Produces: one chosen conditioning plate per video job, filenames `plate-<slot>-<role>.png`.

- [ ] **Step 1:** For each act 2–6, generate **3 candidates** via soul_cinematic (2k, 16:9), prompt = that act's spec shot description condensed to a single establishing frame. 15 stills ≈ 1.8 cr.
- [ ] **Step 2:** Hero plates via nano_banana_pro 4k: landscape start (beam entering prism, black void), landscape end (interior densely crossed by internally reflected beams, same camera axis), portrait start/end (vertical recomposition), act1 static fallback poster. 5 stills ≈ 20 cr.
- [ ] **Step 3:** Download all candidates into `plates/`, **Read every image** (truth pass #1: no text, no logos, no humans, no readable instruments, true-black surround, subject centred with margin). Reject and regenerate any violator — stills are effectively free; video is not.
- [ ] **Step 4:** Record picks in MANIFEST.md with one line of why per pick.

### Task 3: Video generation — hero ×2 + acts ×5

**Files:**
- Create: `site/assets/film-src/masters/` (hero-land.mp4, hero-port.mp4, act2..act6.mp4)
- Modify: `site/assets/film-src/MANIFEST.md`

**Interfaces:**
- Produces: 7 mp4 masters, named `<slot>.mp4`.

- [ ] **Step 1:** Hero landscape: `higgs generate create kling3_0 --prompt "<spec hero prompt verbatim>" --mode pro --duration 10 --aspect-ratio 16:9 --start-image plate-hero-land-start.png --end-image plate-hero-land-end.png` (25 cr). Fire-and-forget, record job id.
- [ ] **Step 2:** Hero portrait: same, `--aspect-ratio 9:16`, portrait plates (25 cr).
- [ ] **Step 3:** Act shots: `kling3_0_turbo --resolution 1080p --duration 8 --aspect-ratio 16:9 --start-image plate-actN-start.png`, prompts verbatim from spec. **Launch 2 first, confirm both queue and complete, then the remaining 3** (no documented concurrency limit — probe, don't assume). 16 cr each.
- [ ] **Step 4:** `higgs generate wait <id> --timeout 20m` each; download to `masters/`. Watch every master start-to-finish (truth pass #2, same criteria; also: does the hero hold constant-velocity motion — a speed ramp breaks bidirectional scrub). One retry per failed asset is inside budget; a second retry needs a prompt fix first, not a reroll.
- [ ] **Step 5:** MANIFEST.md: job ids, credits spent, balance after.

### Task 4: Post-production — frames and loops

**Files:**
- Create: `site/assets/film/hero/f_000.avif … f_119.avif` (landscape), `site/assets/film/hero-port/f_000.avif …`, `site/assets/film/act2.avif … act6.avif`
- Create: `site/assets/film-src/encode.sh` (the loop below, kept for re-runs)

**Interfaces:**
- Produces: 0-indexed AVIF frame sequences at `assets/film/hero/f_%03d.avif` (and `hero-port/`); five animated AVIFs `assets/film/actN.avif`.

- [ ] **Step 1:** Explode hero masters, every 2nd frame, 0-indexed, black-crushed:
```bash
ffmpeg -i masters/hero-land.mp4 -vf "select='not(mod(n\,2))',colorlevels=rimin=0.06:gimin=0.06:bimin=0.06,scale=1440:-2" -vsync vfr -start_number 0 tmp/hero/f_%03d.png
```
- [ ] **Step 2:** Encode **one ffmpeg process per frame** (never batched `-f image2` — corrupt av1C box):
```bash
for f in tmp/hero/f_*.png; do
  n=$(basename "$f" .png)
  nice -n 15 ffmpeg -y -i "$f" -vf format=yuv420p -threads 2 \
    -c:v libsvtav1 -crf 38 -preset 6 -svtav1-params lp=2 -frames:v 1 \
    "site/assets/film/hero/$n.avif"
done
```
- [ ] **Step 3:** Verify av1C box on 3 sampled frames: `xxd site/assets/film/hero/f_000.avif | grep -m1 av1C` — the box length must read `0000000c`, not `00000008`. Also `node -e` a `createImageBitmap` check via verify.mjs on a test page if in doubt — Chrome is the instrument, not ffprobe.
- [ ] **Step 4:** Same explosion+encode for hero-port at `scale=810:-2`.
- [ ] **Step 5:** Act loops as animated AVIF, 720px, crushed to black:
```bash
nice -n 15 ffmpeg -i masters/act2.mp4 -vf "scale=720:-2,colorlevels=rimin=0.06:gimin=0.06:bimin=0.06,format=yuv420p" -threads 2 -c:v libsvtav1 -crf 40 -preset 6 site/assets/film/act2.avif
```
- [ ] **Step 6:** Weight report: `du -sh site/assets/film/*` in MANIFEST.md. Hero sequence target ≤6MB total; each act loop ≤1.5MB. Over budget → raise crf, don't shrink frame count below 120.

### Task 5: Calculator port — three states in the dark page

**Files:**
- Modify: `site/index-scroll.html` (hero act markup + inline `<style>` additions + inline module)
- Consumes: `site/assets/savings.js` (`modelSavings({spend,hit,inputShare,batchable,dupRate})`, `usd()`) — logic untouched.

**Interfaces:**
- Produces: `#calc-card` (hero card), `#calc-pill` (HUD dock), `#calc-close` (act-6 instance); shared module `initCalc(rootEl)` defined inline in index-scroll.html.

- [ ] **Step 1:** Hero card markup after the marquee block inside `#act-hero`: same two-row structure as index.html's `.meter` (`You spend now` input → `You'd spend` output) rebuilt against index-scroll tokens: `background:var(--panel)`, `border:1px solid rgba(61,220,132,.14)`, mono tabular figures, width `min(420px, calc(100vw - 2.4rem))`. Import savings.js as a module; wire the same caret-preserving spend formatter (copy the function body from index.html's inline module verbatim; it is already framework-free).
- [ ] **Step 2:** Dock behaviour: an IntersectionObserver on `#act-hero` (threshold 0) toggles `body.calc-docked`; CSS shows `#calc-pill` (a capsule-controls-styled button in the existing HUD rail lane, text "Estimate your savings") only when docked. Click toggles `#calc-card` as a fixed overlay (`position:fixed; inset:auto 1.2rem 1.2rem auto`) without scrolling.
- [ ] **Step 3:** Act-6 instance: second `initCalc()` root beside the sample-audit figure, with a mono eyebrow `MODELLED — three-band formula` above it and the existing MEASURED CTA untouched and visually senior (CTA keeps `--acc` fill; calculator card stays panel-ghost).
- [ ] **Step 4:** Test: `python3 -m http.server` from `site/`, run `node /Users/angus/.claude/skills/sitecraft/assets/gates/verify.mjs http://localhost:8000/index-scroll.html out/calc.png` — zero errors, then Read the screenshot: card legible over the ground, values update when spend edited (drive via a quick `javascript_tool`-free check: change value in page devtools is not available — instead assert in-page by adding a temporary `console.assert(document.querySelector('#calc-card [data-out]').textContent.includes('$'))`; remove after).
- [ ] **Step 5:** Reduced-motion + mobile spot-check: 390px viewport screenshot; card must not overlap HUD lanes.

### Task 6: Hero scroll-film + deploy exclusions

**Files:**
- Modify: `site/index-scroll.html` (film canvas markup in `#act-hero`), `site/assets/mount.js` (scroll-film mount), `site/deploy.sh` (rsync `--exclude assets/film-src/`)
- Consumes: `assets/film/hero/f_%03d.avif` (120 frames, 0-indexed), `assets/film/hero-port/`, effect at `/Users/angus/.claude/skills/sitecraft/assets/effects/scroll-film/engine.js` (copy into `site/assets/effects/scroll-film/` like the other eight).

**Interfaces:**
- Produces: scroll-film joined to `driven[]`, progress mapped so the film completes over the hero's own pinned range only.

- [ ] **Step 1:** Copy engine: `cp -R /Users/angus/.claude/skills/sitecraft/assets/effects/scroll-film site/assets/effects/`.
- [ ] **Step 2:** Markup: inside `#act-hero`, a pinned wrapper whose sticky PIN carries `background:#050b08` and the z-index (blend reaches the pin's backdrop, not through it); canvas child gets `mix-blend-mode:screen; pointer-events:none`; marquee, register card and `#calc-card` above it with `pointer-events:auto`.
- [ ] **Step 3:** Mount in mount.js beside the other engines, ZOI-proven values, portrait swap via matchMedia:
```js
const port = matchMedia('(max-aspect-ratio: 3/4)');
const film = safe(() => initScrollFilm(el, {
  frames: 120, path: port.matches ? 'assets/film/hero-port/f_' : 'assets/film/hero/f_',
  pad: 3, ext: 'avif', chase: 0.12, order: 'coarse', concurrency: 6, dprMax: 1.5,
}));
```
  Progress: in `tick()`, map document progress to the hero's own range: `film.setProgress(clamp((scrollY - heroTop) / heroSpan))` using rects measured once per resize — not the global 0..1 (the film must finish before act 2 arrives).
- [ ] **Step 4:** `data-sc-display="plain"` (or `auto:false` + `--sc-dt-ground:#03100a`) on any display-type headline over the film.
- [ ] **Step 5:** deploy.sh: add `--exclude assets/film-src/` beside the existing excludes; run `node tools/publish-manifest.mjs` (from `site/`) — must PASS with the new `.avif` files and refuse nothing.
- [ ] **Step 6:** Gate: verify.mjs — `__ready` fires (scroll-film's first-frame promise joins the awaited set in mountAll), zero errors. Then the spine smoke test: `node /Users/angus/.claude/skills/sitecraft/assets/gates/scroll-shot.mjs http://localhost:8000/index-scroll.html out/spine 12` and Read the act-1→act-2 boundary shots for jank/overlap.

### Task 7: Act film blocks (acts 2–6)

**Files:**
- Modify: `site/index-scroll.html` (five `figure.act-film` blocks + CSS)
- Consumes: `assets/film/act2.avif … act6.avif` (animated AVIFs, loop natively in `<img>`).

**Interfaces:**
- Produces: `figure.act-film > img[src="assets/film/actN.avif"]` + `figcaption` per act, revealed by act-breaks like any content; **no backdrops config touched** (`backdrops:null` stays).

- [ ] **Step 1:** Act 2: block goes in the scrolling copy column (`[data-split-copy]`), NOT the sticky media slot (single-adoptee rule). Below 721px sticky-split doesn't mount — the block renders in normal flow; verify visible on mobile.
- [ ] **Step 2:** Acts 3, 5: new markup — `figure.act-film` between heading and grid; width `min(880px,100%)`, `border:1px solid rgba(61,220,132,.10)`, `border-radius:14px`, `overflow:hidden`, img `display:block;width:100%`. Caption in mono `--ink-3`, one line, stating what the shot depicts (from spec titles) — never a fact claim.
- [ ] **Step 3:** Act 4: block above the `#refusals` grid; the spectrum frame must never sit under the ledger headline — check the composited crop at 1440 and 390.
- [ ] **Step 4:** Act 6: block beside/above the sample-audit `<a.shot>` — the synthetic-sample image and its caption remain distinct and untouched.
- [ ] **Step 5:** Reduced-motion: animated AVIFs keep animating unless we act — add `@media (prefers-reduced-motion: reduce)` swap to each act's poster frame via `<picture>` (first frame exported as `actN-still.avif` in Task 4, add to encode.sh: same single-frame encode command against frame 0). Live query by construction (CSS media query).
- [ ] **Step 6:** verify.mjs green; Read a full-page screenshot; each loop plays; captions legible.

### Task 8: Full gate suite + truth pass

**Files:**
- Create: `site/out/` gate artifacts (never shipped)
- Modify: only fixes surfaced by gates.

- [ ] **Step 1:** `mkdir -p site/out`. Serve from `site/` root.
- [ ] **Step 2:** `verify.mjs http://localhost:8000/index-scroll.html out/final.png` — exit 0.
- [ ] **Step 3:** `product-check.mjs http://localhost:8000/index-scroll.html out/` — desktop + mobile + reduced-motion, exit 0. Read every screenshot it writes.
- [ ] **Step 4:** `contrast-check.mjs http://localhost:8000/index-scroll.html out/` — whole-document walk both viewports, exit 0. Quote the printed scope line verbatim in the report; special attention to Act 4's spectrum region.
- [ ] **Step 5:** Truth pass #3 (final): Read every shipped act loop's poster + 6 sampled hero frames (0, 24, 48, 72, 96, 119). Criteria: no legible text, no logos, no humans/hands, nothing mistakable for a product screenshot. Any violation → regenerate that asset (budget holds), re-run Tasks 4→8 for it.
- [ ] **Step 6:** Memory profile: with the page open in headless Chrome (verify.mjs run), `ps` the Chrome renderer RSS before vs after a full scrub (scroll-shot.mjs forces the ladder). Record MB in MANIFEST.md; >1.5GB → re-encode hero at 1080px wide and re-measure.
- [ ] **Step 7:** Deploy dry-run: `node tools/publish-manifest.mjs` PASS + `grep -c 'to supply' *.html` returns 0 matches in shipped pages.
- [ ] **Step 8:** Independent audit: `node /Users/angus/.claude/skills/sitecraft/assets/gates/independent-audit.mjs http://localhost:8000/index-scroll.html --brief brief.json --out out/` — exit 0 required; exit 3 is not a pass. Address findings or record them as accepted with reasons.
- [ ] **Step 9:** Final report: what was verified (gate outputs quoted) vs what is assumed; credits spent + balance; the one-line deploy command left for the owner (`./deploy.sh <domain>` swaps nothing by itself — promoting index-scroll to index is the owner's call, out of scope).

## Self-review notes

- Spec coverage: hero film (T3/T4/T6), portrait twin (T3/T4/T6), act shots (T3/T4/T7), calculator three states (T5), ground unchanged (no task touches caustic-field — correct), gates 1–8 (T6/T8), deploy safety (T6/T8), truth passes at stills (T2), masters (T3), shipped (T8). Ground-texture slice: intentionally absent (out of scope).
- No placeholders; every command is concrete; the only verbatim-from-spec references are the generation prompts, which the spec carries in full.
- Interface consistency: frame naming `f_%03d.avif` 0-indexed used in T4 and T6; `initCalc` defined T5, reused T5-step3; plate filenames defined T2, consumed T3.
