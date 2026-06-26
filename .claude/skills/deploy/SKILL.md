---
name: deploy
description: Build and publish offline_kabinka to GitHub Pages (bonyadmitr.github.io/offline_kabinka).
---

Deploy the PWA to GitHub Pages. The app is served under the base path `/offline_kabinka/`; the target URL is https://bonyadmitr.github.io/offline_kabinka.

Steps:

1. Confirm you are authenticated to GitHub as the `bonyadmitr` account:
   ```bash
   gh auth status
   ```
   The active account must be `bonyadmitr`. If it is not, switch with `gh auth switch --user bonyadmitr` (or `gh auth login`) before continuing.

2. Make sure the large offline assets exist locally (they are NOT in git — they are placed into `dist/` at deploy time):
   - `public/map/minsk.pmtiles` (+ `public/map/map-version.json`) — see the `build-map` skill if missing.
   - `public/thumbs/thumbs.bin` (+ `public/thumbs/thumbs-index.json`) and `public/thumbs/*.jpg` — produced by `node scripts/pack-thumbs.mjs` / the data pipeline.

3. Run the deploy script:
   ```bash
   bash scripts/deploy.sh
   ```
   `scripts/deploy.sh` runs `npm run build`, then publishes `dist/` (with the un-tracked map + thumbnail assets it copies in) to the `gh-pages` branch by copying it into a throwaway temp dir OUTSIDE the repo and doing `git init` + `git add -A -f` + force-push. It deliberately does NOT use `npx gh-pages` — that tool's cache lives under `node_modules` and inherits the repo `.gitignore` (`*.pmtiles`, `dist`), which silently drops the 31 MB map from the deploy. One-time setup (repo `bonyadmitr/offline_kabinka` + Pages on the `gh-pages` branch) is already done.

4. After it finishes, verify the live site loads with the correct base path:
   https://bonyadmitr.github.io/offline_kabinka/

Do not commit `dist/`, `*.pmtiles`, or the thumbnail binaries — they are gitignored and shipped only into the deployed build.
