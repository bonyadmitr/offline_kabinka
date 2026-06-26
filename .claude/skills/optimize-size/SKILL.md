---
name: optimize-size
description: Checklist + commands to shrink the offline_kabinka payload (map, thumbnails, JS) for faster install.
---

The install size is dominated by the offline map (~31 MB) and the thumbnail pack (~8.5 MB); the JS bundle is secondary. Work down this list, measuring before and after each change.

## Measure first
```bash
du -h public/map/minsk.pmtiles public/thumbs/thumbs.bin public/data/locations.json
npm run build        # read the printed JS/CSS sizes (gzip column) + the PWA precache total
```
`vite build` prints each asset's raw + gzip size (e.g. `dist/assets/index-*.js … gzip: …`) and the PWA line `precache N entries (… KiB)`.

## 1. Map (biggest lever)
- Lower the max zoom — the file shrinks sharply per level:
  ```bash
  MAXZOOM=14 bash scripts/build-map.sh    # vs default 15
  du -h public/map/minsk.pmtiles
  ```
- Tighten the bbox in `scripts/build-map.sh` (`BOUNDS`) if coverage can be smaller (must still contain all data points).
- Drop unused layers from the map style so fewer features are requested/rendered: see `src/map/style.ts` (trim layers you don't show; this reduces tile decode/paint cost — pair with a smaller maxzoom for file savings).

## 2. Thumbnails
- Re-compress source thumbs at lower quality/scale before packing. The reusable compressor lives at `../tools/imgcompress` (Lanczos3 + MozJPEG); the current `public/thumbs/` were made at 50% scale / quality 75. Try a smaller scale or lower quality, then repack:
  ```bash
  node scripts/pack-thumbs.mjs
  du -h public/thumbs/thumbs.bin
  ```

## 3. JavaScript bundle
- MapLibre dominates the JS. Code-split it with a dynamic `import('maplibre-gl')` so it loads after first paint, shrinking the initial chunk (the build currently warns the main chunk is >500 kB). Re-measure with `npm run build`.
- Confirm tree-shaking: avoid `import * as` for large libs.

## 4. Transport
- Serve Brotli/gzip on GitHub Pages where possible (Pages compresses common text types automatically; the large `.pmtiles`/`.bin` are already binary and stream into IndexedDB, so focus compression on JS/CSS/JSON).

After any change: rebuild, re-measure with the commands above, then run the app (`run` skill) and the suites (`test` skill) to confirm nothing regressed.
