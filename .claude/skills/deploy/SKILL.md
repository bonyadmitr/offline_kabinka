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
   NOTE: `scripts/deploy.sh` is created in WU10 and may not exist yet. If it is missing, that work is still pending — do not hand-roll a deploy. The script is expected to: run `npm run build`, copy the un-tracked map + thumbnail assets into `dist/`, and push `dist/` to the `gh-pages` branch (or publish via the Pages action) for `bonyadmitr.github.io/offline_kabinka`.

4. After it finishes, verify the live site loads with the correct base path:
   https://bonyadmitr.github.io/offline_kabinka/

Do not commit `dist/`, `*.pmtiles`, or the thumbnail binaries — they are gitignored and shipped only into the deployed build.
