#!/usr/bin/env bash
# Build the app and publish it to GitHub Pages → https://bonyadmitr.github.io/offline_kabinka/
#
# The large offline assets (minsk.pmtiles ~31 MB, thumbs.bin ~8 MB) are NOT committed
# to the source branch. They live in public/ locally (produced by build-map.sh and
# pack-thumbs.mjs), get copied into dist/ by `vite build`, and are pushed only to the
# gh-pages branch. The source branch (main) stays free of big binaries.
#
# We publish from a throwaway temp dir OUTSIDE the repo and `git add -f` so the repo's
# .gitignore (which lists *.pmtiles, dist, public/map …) can't silently drop the map
# from the deploy — the exact bug that loses the basemap if you use `npx gh-pages`,
# whose cache lives under node_modules and inherits those ignore rules. Each deploy is
# a fresh single-commit force-push, so gh-pages never accumulates old 31 MB blobs.
#
# Prerequisites:
#   - gh authenticated as the repo owner (bonyadmitr): `gh auth status`
#   - git credential helper set up for github.com (done by `gh auth login`)
#   - map + thumbs built locally (skills: build-map; script: pack-thumbs.mjs)
#   - one-time: repo created and Pages enabled on the gh-pages branch (see README)
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_URL="https://github.com/bonyadmitr/offline_kabinka.git"

[ -f public/map/minsk.pmtiles ] || { echo "ERROR: public/map/minsk.pmtiles missing — run: bash scripts/build-map.sh"  >&2; exit 1; }
[ -f public/thumbs/thumbs.bin ] || { echo "ERROR: public/thumbs/thumbs.bin missing — run: node scripts/pack-thumbs.mjs" >&2; exit 1; }

echo "==> Building production bundle…"
npm run build

echo "==> Publishing dist/ to the gh-pages branch…"
TMP="$(mktemp -d)"
cp -R dist/. "$TMP/"
touch "$TMP/.nojekyll"   # serve files as-is (no Jekyll processing)
(
  cd "$TMP"
  git init -q
  git checkout -q -b gh-pages
  git add -A -f .          # -f: force past any inherited .gitignore (keeps minsk.pmtiles)
  git -c user.name=deploy -c user.email=deploy@local commit -qm "deploy $(date '+%Y-%m-%d %H:%M')"
  # Large (~40 MB) one-shot push: bump postBuffer so the RPC isn't cut ("curl 55
  # broken pipe"); retry a couple times for transient disconnects.
  git config http.postBuffer 524288000
  n=0; until git push -f "$REPO_URL" gh-pages; do
    n=$((n+1)); [ "$n" -ge 3 ] && { echo "ERROR: gh-pages push failed after $n attempts" >&2; exit 1; }
    echo "push failed, retry $n…" >&2
  done
)
rm -rf "$TMP"

echo "==> Done → https://bonyadmitr.github.io/offline_kabinka/"
