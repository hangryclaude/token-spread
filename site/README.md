# site/

The Tokens Saved marketing site. Five static pages, **141KB total**, no build step, no
dependencies, no framework.

```bash
python3 -m http.server 8791   # then open http://localhost:8791
```

## What's here

| File | |
|---|---|
| `index.html` | Hero, the silent-failure terminal, ProjectDiscovery's production data, dark CTA band |
| `how.html` | The mechanism, the four ways caching breaks, their real technique, what the audit does |
| `methods.html` | Ship-by-default vs off-unless-you-ask, the full 12-row method table |
| `pricing.html` | Live savings calculator + tiers |
| `404.html` | |
| `assets/style.css` | The whole design system |
| `assets/fx.js` | Reveals and parallax — decorative and fail-soft |
| `assets/orbfield.js` | The depth-of-field disc scatter behind every hero |
| `assets/site.js` | The savings model, shared so pages can't disagree |
| `assets/img/` | 2 fal-generated AVIF visuals (17KB) + the OG card |
| `assets/og-source.html` | Renders the OG card; screenshot at 1200×630 to regenerate |

## Design system

Tokens are Uniswap's real Spore values, read from `Uniswap/interface` source
(`colors.ts`, `borderRadii.ts`, `spacing.ts`, `fonts.ts`) plus two measured captures of
their live pages — not approximated from memory.

**The 2026-08-09 re-measure of `uniswap.org` changed three things this file had wrong.**
Their h1 is 64px at **weight 485**, line-height **1.1875**, letter-spacing **normal** — a
light face with air in it, not the tight heavy display setting that was here before. Their
hero is **centred** and the **product itself is the hero**: a live swap widget sits under
the headline where a marketing site would put a picture. And their background is not
imagery at all — it is flat-colour divs with `filter: blur(5→45px)` and an opacity that
tracks the blur. That last one is reproduced in `orbfield.js`; it costs no bytes, stays
sharp at any DPR, and retired every gradient scrim this stylesheet used to need to keep
hero text legible over a bitmap.

Four rules are load-bearing:

1. **Surfaces separate by fill contrast**, not borders and shadows. Adding a border to a
   card breaks the resemblance more than any colour choice would.
2. **The hero widget runs the same model as `pricing.html`**, off the same defaults
   (`hit 30 / inputShare 70 / batchable 20 / dupRate 5`), imported from `site.js`. Two pages
   quoting different numbers for the same spend is the one bug this site cannot survive.
3. **Nothing on the page animates a published fact.** A count-up used to tick the three spec
   cards from 0 to 4 / 20 / 512, which meant ~1.1s of displaying numbers that were not the
   fact. Gate 3 surfaced it as a run painting none of its own pixels; it is gone.
4. **Contrast is measured, not computed.** Every value was checked against real composited
   pixels. Uniswap's own `neutral3` (2.26:1) and brand pink (3.17:1) *fail* AA as small text
   on white, so neither is used that way. `--acc-fill` takes **dark** text (7.45:1); white on
   it is 2.50:1 and must never ship.

## Before you deploy

Three things are deliberately unset because they aren't known yet:

- [ ] **Contact address** — every page carries a `— to supply —` token. `grep -rn "to supply" .`
- [ ] **Absolute URLs** — `og:image` is relative (crawlers resolve it against the page URL, but
      absolute is safer). Set the real origin in the four `og:image`/`twitter:image` tags,
      `robots.txt`'s sitemap line, and `sitemap.xml`'s `<loc>` paths.
- [ ] **Domain** — `Tokens Saved.com` was checked available on 2026-08-09 but is **not registered**.
- [ ] **Regenerate the OG card** after any hero copy change: serve the site, screenshot
      `assets/og-source.html` at 1200x630, re-encode to `assets/img/og.jpg`. It renders the
      real hero markup and the real orb field, so it cannot drift from the page by accident.

## Gates

Every page passes all three sitecraft gates. Re-run after any change — three separate
times this session, adding content silently broke contrast somewhere non-obvious.

```bash
node ~/.claude/skills/sitecraft/assets/gates/verify.mjs         http://localhost:8791/index.html out/x.png
node ~/.claude/skills/sitecraft/assets/gates/product-check.mjs  http://localhost:8791/index.html out/
node ~/.claude/skills/sitecraft/assets/gates/contrast-check.mjs http://localhost:8791/index.html out/
```

`out/` is gate artefacts and is gitignored.

## Where the claims come from

`../docs/research/2026-08-09-method-register.md` is the source for every lever named on
`methods.html` — 94 methods that survived an adversarial verification pass, sorted into
ship-by-default / byte-identical-only / off-unless-you-ask, plus 47 catalogued dead ends.
The dead-ends table on `methods.html` is drawn straight from it. `2026-08-09-completeness-gaps.md`
is the critic pass: what the sweep still has not answered.

## Honesty rules the copy follows

- Every ProjectDiscovery figure is theirs, published, and linked in place.
- The calculator is labelled a model, never a quote.
- Savings levers compound and are never summed — a summed total overstates the saving.
- "Identical" means *zero quality change by construction* (same model, same input tokens),
  not identical bytes; only an exact-match cache hit is literally byte-for-byte.
- The calculator tells a visitor **not to buy** when the fee would exceed their saving.
