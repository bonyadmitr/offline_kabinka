#!/usr/bin/env bash
# Build the app and publish it to GitHub Pages → https://bonyadmitr.github.io/offline_kabinka/
#
# The large offline assets (minsk.pmtiles ~31 MB, thumbs.bin ~8 MB) are NOT committed
# to git. They live in public/ locally (produced by build-map.sh and pack-thumbs.mjs),
# get copied into dist/ by `vite build`, and are pushed only to the gh-pages branch.
# The source branch (main) stays free of big binaries.
#
# Prerequisites:
#   - gh authenticated as the repo owner (bonyadmitr): `gh auth status`
#   - map + thumbs built locally (see skills build-map / the pack-thumbs script)
#   - one-time: repo created and Pages enabled on the gh-pages branch (see README)
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f public/map/minsk.pmtiles ]  || { echo "ERROR: public/map/minsk.pmtiles missing — run: bash scripts/build-map.sh"  >&2; exit 1; }
[ -f public/thumbs/thumbs.bin ]  || { echo "ERROR: public/thumbs/thumbs.bin missing — run: node scripts/pack-thumbs.mjs" >&2; exit 1; }

echo "==> Building production bundle…"
npm run build
touch dist/.nojekyll   # serve files as-is (no Jekyll processing)

echo "==> Publishing dist/ to the gh-pages branch…"
npx --yes gh-pages -d dist -b gh-pages -t -m "deploy $(date '+%Y-%m-%d %H:%M')"

echo "==> Done → https://bonyadmitr.github.io/offline_kabinka/"
