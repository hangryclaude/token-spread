# site/

The idemlayer marketing site. Five static pages, **216KB total**, no build step, no
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
| `assets/fx.js` | Reveals, count-ups, parallax — all decorative and fail-soft |
| `assets/site.js` | The savings model, shared so pages can't disagree |
| `assets/img/` | 3 generated AVIF visuals (64KB) + the OG card |
| `assets/og-source.html` | Renders the OG card; screenshot at 1200×630 to regenerate |

## Design system

Tokens are Uniswap's real Spore values, read from `Uniswap/interface` source
(`colors.ts`, `borderRadii.ts`, `spacing.ts`, `fonts.ts`) plus a measured capture of
app.uniswap.org — not approximated from memory. Two rules are load-bearing:

1. **Surfaces separate by fill contrast**, not borders and shadows. Adding a border to a
   card breaks the resemblance more than any colour choice would.
2. **Contrast is measured, not computed.** Every value was checked against real composited
   pixels. Uniswap's own `neutral3` (2.26:1) and brand pink (3.17:1) *fail* AA as small text
   on white, so neither is used that way. `--acc-fill` takes **dark** text (7.45:1); white on
   it is 2.50:1 and must never ship.

## Before you deploy

Three things are deliberately unset because they aren't known yet:

- [ ] **Contact address** — every page carries a `— to supply —` token. `grep -rn "to supply" .`
- [ ] **Absolute URLs** — `og:image` is relative (crawlers resolve it against the page URL, but
      absolute is safer). Set the real origin in the four `og:image`/`twitter:image` tags,
      `robots.txt`'s sitemap line, and `sitemap.xml`'s `<loc>` paths.
- [ ] **Domain** — `idemlayer.com` was checked available on 2026-08-09 but is **not registered**.

## Gates

Every page passes all three sitecraft gates. Re-run after any change — three separate
times this session, adding content silently broke contrast somewhere non-obvious.

```bash
node ~/.claude/skills/sitecraft/assets/gates/verify.mjs         http://localhost:8791/index.html out/x.png
node ~/.claude/skills/sitecraft/assets/gates/product-check.mjs  http://localhost:8791/index.html out/
node ~/.claude/skills/sitecraft/assets/gates/contrast-check.mjs http://localhost:8791/index.html out/
```

`out/` is gate artefacts and is gitignored.

## Honesty rules the copy follows

- Every ProjectDiscovery figure is theirs, published, and linked in place.
- The calculator is labelled a model, never a quote.
- Savings levers compound and are never summed — a summed total overstates the saving.
- "Identical" means *zero quality change by construction* (same model, same input tokens),
  not identical bytes; only an exact-match cache hit is literally byte-for-byte.
- The calculator tells a visitor **not to buy** when the fee would exceed their saving.
