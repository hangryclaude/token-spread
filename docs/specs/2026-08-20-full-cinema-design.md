# Tokens Saved — full-cinema homepage: design spec

2026-08-20. Owner-approved in session (base page → scroll version; depth → full cinema;
direction → Total Internal Reflection with grafts; budget → ~330 of 7,440 Higgsfield credits).
Derived from a 12-agent design workflow: 5 recon reports, 4 competing directions, 3 judge lenses.
Judge totals: TIR 23.1 · Foundry 22.5 · Ledger 20.2 · Cold Cache 18.5.

## What this is

`site/index-scroll.html` — the six-act dark scroll page — becomes a graded macro-cinema film:
one scroll-scrubbed hero film, one self-contained looping shot per act (2–6), the live savings
calculator restaged inside the cinema, everything generated on Higgsfield and shipped as AVIF.
The reference to beat is app.uniswap.org's widget-as-hero; its DNA (a live working thing in the
first screen) is kept and exceeded.

## The direction: Total Internal Reflection

One physical phenomenon through six acts: light trapped inside glass instead of leaking out.
Macro cinematography, absolute black void, no lab, no logo, no human, no readable instrument.
The cast is one beam.

- **Palette**: the site's own tokens only. Signal green `#3ddc84` family; the single second hue
  is `#ff6b57`-adjacent coral (`--stop`, already semantically "uncached/expensive") in Act 2's
  leak. One sanctioned multi-hue moment: Act 4's spectrum, spent on the 187→67 triage.
- **Ground**: caustic-field ships byte-identical — same stops, speed .055, scale 1.2,
  grain .045, dprMax 1.5. Film content never touches the fixed layer. ("Film texture in the
  ground" = follow-up slice via texture2D sampling inside the existing shader; own gate; not
  in this build.)
- **Truth rule for the metaphor** (from the truth judge, binding): copy and internal docs never
  describe the imagery as how light actually behaves. The footage is set dressing; the hero
  depicts real total internal reflection (beam trapped, bouncing internally, escaping when
  reversed) — never light "stored" as a glowing core, which is fake physics.

## Acts

| Act | Existing content (unchanged) | Cinema added |
|---|---|---|
| 1 Hero | kinetic-marquee headline, register card | scrubbed prism film (~120 AVIF frames) + live calculator |
| 2 Problem | sticky-split argument (≥721px) | loop: fibre leaks coral light through unbroken cladding |
| 3 Proof | twin terminals (twin.js) | loop: beamsplitter — two paths, one identical arrival |
| 4 The bar | card-grammar 187→67 ledgers | loop: slit stack — spectrum in, one green ray out |
| 5 Findings | findings grid | loop: held light + two disagreeing measurements |
| 6 Close | audit CTA + synthetic sample | loop: beam resolves to a still mark on a plate |

Only the hero scrubs. Acts 2–6 are self-contained loops in normal document flow (new
`figure.act-film` blocks; `act-breaks` reveals them like any other content; **no** per-act
backdrops — that is the seam trap `act-breaks` was configured with `backdrops:null` to avoid).
Spine ruling: scroll-film owns only the hero's pinned range; sticky-split owns only Act 2;
nothing else pins. This per-section reading is a judgment call not licensed by catalogue.md —
it gets a dedicated smoke test at the act-1/act-2 boundary before the full frame bake.

## The widget (Uniswap DNA)

`savings.js` logic untouched (pure, portable). Three states:

1. **Hero**: live interactive card, ~420px, centred under the marquee — first-screen, usable.
   New markup/CSS against index-scroll's dark tokens (`--panel`/`--line`/`--acc`/`#050b08`);
   style.css's Spore tokens are not imported.
2. **Docked, Acts 2–5**: collapses into a capsule-controls pill ("Estimate your savings")
   riding the existing fixed-hud chrome. Tap re-expands in place as an overlay.
3. **Act 6**: re-expands beside the sample audit, labelled **MODELLED** on its face, using
   BRIEF.md's three-band formula — subordinate sibling to the **MEASURED** CTA
   ("send the file, get the audit"). The calculator never replaces the measurement.

## Shot list

All prompts share: absolute black void studio, true (0,0,0) background at every frame, subject
centred with generous black margin (text lives in the margins; survives 9:16 cover-fit), no
text, no numbers, no UI, no logos, no humans, no lens-flare artifacts, IBM-Plex-adjacent
restraint. Grade: deep black, one saturated green accent, near-white highlights on glass only.

### Hero — "The prism: trapped and released" (kling3_0, mode=pro, 10s, 16:9, start+end conditioned)

> Macro cinematography, absolute black void studio, no floor or walls visible. A single tight
> collimated beam of cool white-green light (#3ddc84 family core, faint emerald cast) enters
> frame from upper-left and strikes a large suspended optical prism — a flawless faceted glass
> polyhedron, no visible rig. Camera on a slow continuous constant-velocity dolly-orbit at
> constant distance, shallow depth of field, gentle rack focus between beam and facets. As the
> orbit continues, the beam enters the prism past the critical angle and becomes trapped by
> total internal reflection — reflecting again and again off the inner faces, its path folding
> and densening inside the glass, the interior gradually crossed by more and more internally
> reflected light while the surrounding void stays black. No glowing core forms: the light
> stays a beam, only ever more folded. Continuous unbroken take, constant-velocity motion
> throughout so the sequence plays correctly in either direction. Extremely subtle volumetric
> haze, just enough to render beam paths visible. True pure black (0,0,0) background at every
> frame.

Scrubbed forward: capture. Scrubbed backward: the beam unfolds and escapes the way it came.
Both physically true. Bright activity confined to the prism's fixed screen region for the whole
take (Cold Cache graft, verified as a check, not assumed): text-safe margins stay text-safe on
every frame.

Portrait twin (Cold Cache graft): same prompt recomposed vertical, kling3_0 9:16, own
nano_banana_pro portrait plates — a dedicated mobile sequence, not a crop. Plus one 4K
nano_banana_pro still as Act-1 static fallback poster.

### Act shots (kling3_0_turbo, 1080p, 8s, 16:9, start-conditioned from soul_cinematic plates)

- **Act 2 — the fibre that leaks without breaking.** A glass optical fibre glowing steady green
  along its core; at one point, with no visible crack or damage, thin threads of warm
  coral-salmon light leak sideways through the cladding in soft wisps; the core dims only a
  fraction, never dark. Near-static camera, imperceptible push-in. Opening and closing frames
  read as the same steady leak — loops because nothing resolves.
- **Act 3 — two paths, one arrival.** A green beam strikes a small glass beamsplitter cube and
  exits as two beams of identical colour, width, brightness. Upper beam runs straight through
  black space; lower beam threads a tight glass delay coil and re-emerges on the same
  trajectory, arriving with its twin — same instant, same colour, same intensity. Static
  symmetrical camera. The equivalence is the shot.
- **Act 4 — the slit stack.** A wide fan of pure white light passes through five thin etched
  glass plates in depth. At the first plate it disperses into a real controlled spectrum — the
  page's only rainbow. Each subsequent plate absorbs most of it; by the last, a single thin
  saturated green ray survives, undiminished, off-frame right. Static side-on camera, slow rack
  focus following the survivor.
- **Act 5 — held too long, measured twice.** One continuous slow lateral pan across two
  vignettes: a sealed glass tube holding a slow-pulsing sphere of green light, contained longer
  than its glow needs; then a green beam through two overlaid frosted plates casting two
  slightly offset marks that do not quite agree. Cooler, bluer, lower saturation — a finding,
  not a failure.
- **Act 6 — the mark that holds.** A steady green beam travels toward camera and resolves onto
  a motionless vertical glass plate; a calm luminous mark forms and holds — arriving and
  staying. Slow push-in that ends in stillness: the only shot that deliberately stops moving.

## Asset pipeline

Models and prices are MEASURED via `higgs generate cost` (recon 2026-08-20) except where marked.

| Asset | Model / params | Credits |
|---|---|---|
| Hero film 16:9 | kling3_0, mode=pro, duration=10, start+end image | 25 |
| Hero film 9:16 | kling3_0, mode=pro, duration=10, 9:16 | ~25 |
| 6 act shots | kling3_0_turbo, 1080p, duration=8, start image | 96 (16×6) |
| Hero plates ×4 (2 landscape, 2 portrait) | nano_banana_pro, 4k, 16:9 / 9:16 | 16 |
| Act plates ×6 (plus spares — effectively free) | soul_cinematic, 2k | ~1 |
| **Raw total** | | **~163** |
| **With 2× retry headroom** | | **~330** |

Step 0, before any batch: one real `generate cost` call with an actual local conditioning image
(conditioning-is-free is inferred from ~90 sweep calls, never measured). Generate several
soul_cinematic candidates per act (0.12 cr each) and hand-pick before any video spend.
`generate create --wait --wait-timeout 20m` for linear steps; test 2–3 concurrent creates
before fanning out all six acts (no documented rate limit). Do not use minimax_hailuo (CLI
resolution flag is broken); do not pay kling3_0 mode=4k (upscale later if frames need it —
price topaz_video once with a cheap real clip first; UNMEASURED).

Post-production (ZOI-proven, every rule measured):

- Hero mp4 → extract every 2nd frame → ~120 frames (release range 120–240), `-start_number 0`
  forced (scroll-film indexes from 0; ffmpeg from 1).
- Background crushed to exact (0,0,0) via colorlevels before encode.
- **One ffmpeg process per frame** to libsvtav1 AVIF (`-svtav1-params lp=2`); a batched
  `-f image2` run silently emits a corrupt 8-byte `av1C` box Chrome rejects while ffprobe reads
  fine. Verify the box hex, not the exit code.
- Act loops ship as **animated AVIF** files — `.avif` passes publish-manifest.mjs's allowlist;
  `.mp4`/`.webm` make deploy.sh refuse the entire site. No video mimetypes ship, ever.
- On page: canvas carries `mix-blend-mode:screen`; the sticky pin itself holds the ground's
  background colour and z-index; `pointer-events:none` on film, restored on content.
  scroll-film config = ZOI's proven values (chase .12, order 'coarse', concurrency 6,
  dprMax 1.5). No new tuning without a track record.

## Integration notes (from the site recon)

- Acts 3 and 5 have no media containers today — the `figure.act-film` blocks are new markup.
  Act 2's shot may NOT sit beside the usage-pair in sticky-split's media slot (single-adoptee
  rule); it lives in the copy column flow instead. sticky-split doesn't mount <721px, so Act
  2's loop must stand alone on mobile.
- display-type over canvas: `data-sc-display="plain"` or `auto:false` + manual `--sc-dt-ground`
  pinned to `#03100a` family — `tonal()` solves against a computed background-color that does
  not exist over WebGL.
- One rAF clock: everything joins mount.js's existing `driven[]`/`tick()` dispatch. No second
  scroll listener, anywhere.
- `window.__ready` stays on mount.js's `.finally()` after fonts; scroll-film's first-frame
  resolve joins the awaited set.
- fixed-hud/capsule-controls lane reservations (occlusion-derived CSS) must stay clear of any
  new full-bleed layer.
- WebGL context budget: caustic-field + scroll-film canvas coexist; destroy eagerly anything
  else; Chrome's ~16-context ceiling evicts silently.

## Gates — all must pass before "done" is claimed

1. `verify.mjs` — zero console/page errors, `__ready` fires (7s budget).
2. `product-check.mjs` — desktop + mobile, each also reduced-motion (live query, not
   load-time branch).
3. `contrast-check.mjs` — whole-document walk, both viewports; re-run on this exact build; a
   green run is reported as its printed scope, not as "the text is readable". Act 4's spectrum
   frame gets specific attention.
4. **Truth pass**: a human-eyes review (Read) of every shipped frame/loop against BRIEF.md —
   models hallucinate text, logos, hands regardless of negative prompting. An accidental fake
   screenshot or human figure is a hard violation.
5. Memory profile of the hero frame stack on real hardware (ZOI measured ~1.9GB at 180 frames;
   no eviction policy exists). Budget or shrink before shipping, not after.
6. Spine smoke test: scrub jank at the act-1/act-2 (scroll-film → sticky-split) boundary.
7. Deploy dry-run: publish-manifest passes; final "— to supply —" grep passes.
8. Independent audit (`independent-audit.mjs`, codex) before any deploy to the live URL.

## Out of scope

- Ground texture2D slice (Foundry graft) — follow-up, own gate.
- how/methods/pricing pages — untouched.
- Swapping index.html → index-scroll.html as the deployed homepage — build and gate first;
  the swap is a one-line deploy decision the owner makes after seeing it.
- No git commits, pushes, or branch surgery — working tree only; the tree already carries
  uncommitted register-sweep edits that this work layers on top of.

## Risks, stated

- Spine coexistence is untested composition (mitigated: acts are loops; smoke test).
- Mobile cover-fit discards ~78% of 16:9 width (mitigated: dedicated portrait bake).
- Generative drift vs truth rules (mitigated: gate 4, cheap still iteration before video).
- contrast-check historical coverage gap (mitigated: fresh full-walk run, read the scope line).
- Act 1 depends on the hero film (mitigated: 4K static fallback poster, ~4 cr).
