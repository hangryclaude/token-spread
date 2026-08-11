#!/bin/bash
# Deploy the Tokens Saved site to Cloudflare Pages.
#
#   ./deploy.sh <domain> [project-name]
#
# Stamps the real origin into the places that need an absolute URL, publishes the
# static files, and leaves the working tree exactly as it found it — the stamping
# happens in a copy under /tmp, never in the repo, so a failed deploy can't leave
# half-rewritten meta tags behind.
set -euo pipefail

DOMAIN="${1:?usage: ./deploy.sh <domain> [project-name]}"
PROJECT="${2:-tokenssaved}"
ORIGIN="https://${DOMAIN}"
SRC="$(cd "$(dirname "$0")" && pwd)"
STAGE="$(mktemp -d)/site"

trap 'rm -rf "$(dirname "$STAGE")"' EXIT

# Refuse to publish anything that is not a page, an asset, or a crawler file. This reads the
# --exclude list below and holds whatever survives it against an allowlist, so the two can't
# drift: widen the excludes without meaning to and this stops the deploy instead of the buyer.
node "$SRC/tools/publish-manifest.mjs" || {
  echo "REFUSING TO DEPLOY — see above."
  exit 1
}

mkdir -p "$STAGE"
# Ship the pages and their assets, and nothing else. The .md excludes are not housekeeping:
# BRIEF.md and ACTS.md describe how the site was built, and a buyer doing diligence finds them
# by typing the filename. tools/ is the verification harness; og-source.html renders the share
# card; out/ is gate screenshots. publish-manifest.mjs below is what noticed these were missing.
rsync -a --quiet \
  --exclude '*.md' \
  --exclude '*.d.ts' \
  --exclude 'brief.json' \
  --exclude 'deploy.sh' \
  --exclude 'tools/' \
  --exclude 'out/' \
  --exclude 'assets/og-source.html' \
  "$SRC"/ "$STAGE"/

# Absolute URLs. Crawlers resolve a relative og:image against the page, but Slack,
# iMessage and several link unfurlers do not — they want the full URL.
/usr/bin/sed -i '' "s|content=\"assets/img/og.jpg\"|content=\"${ORIGIN}/assets/img/og.jpg\"|g" "$STAGE"/*.html
/usr/bin/sed -i '' "s|# Sitemap: https://<domain>/sitemap.xml  (set at deploy)|Sitemap: ${ORIGIN}/sitemap.xml|" "$STAGE"/robots.txt

# Cloudflare Pages serves `how.html` at `/how` and 308s the .html form to it, so the
# canonical URL is extensionless and every page is reachable at two addresses. The
# source keeps .html because `python3 -m http.server` and the sitecraft gates need a
# real file on disk; the canonical tag and the sitemap are corrected here instead.
/usr/bin/sed -i '' "s|rel=\"canonical\" href=\"index.html\"|rel=\"canonical\" href=\"${ORIGIN}/\"|" "$STAGE"/*.html
for page in how methods pricing; do
  /usr/bin/sed -i '' "s|rel=\"canonical\" href=\"${page}.html\"|rel=\"canonical\" href=\"${ORIGIN}/${page}\"|" "$STAGE"/*.html
done
/usr/bin/sed -i '' -e "s|<loc>/index.html</loc>|<loc>${ORIGIN}/</loc>|" \
                   -e "s|<loc>/\([a-z]*\).html</loc>|<loc>${ORIGIN}/\1</loc>|" "$STAGE"/sitemap.xml

echo "── staged for ${ORIGIN}"
grep -h 'og:image' "$STAGE"/index.html
grep    'Sitemap'  "$STAGE"/robots.txt
echo

# Refuse to publish a page still carrying an unfilled content slot.
if grep -rq 'to supply' "$STAGE"; then
  echo "REFUSING TO DEPLOY — a '— to supply —' slot is still on a page:"
  grep -rn 'to supply' "$STAGE" | sed 's|'"$STAGE"'/||'
  exit 1
fi

echo "── publishing to Cloudflare Pages project '${PROJECT}'"
npx --yes wrangler@latest pages deploy "$STAGE" \
  --project-name="$PROJECT" \
  --branch=main \
  --commit-dirty=true
