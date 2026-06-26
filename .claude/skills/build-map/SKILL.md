---
name: build-map
description: Rebuild the Minsk vector basemap (minsk.pmtiles) from OSM via Planetiler.
---

Build the Minsk-only vector basemap as a single `.pmtiles` archive (OpenMapTiles schema, clipped to the Minsk bbox covering all 263 data points).

Requirement: Java 21+.
```bash
brew install openjdk@21
```
The script looks for `/opt/homebrew/opt/openjdk@21/bin/java`, falls back to `java` on PATH, or honors an explicit `JAVA=...`.

Run it:
```bash
bash scripts/build-map.sh                 # default MAXZOOM=15
MAXZOOM=14 bash scripts/build-map.sh      # smaller file, less building detail
MAXZOOM=16 bash scripts/build-map.sh      # crisper, larger file
```

What it does:
- Downloads the Belarus OSM extract + Natural Earth + water polygons (~1.3 GB, one-time) and caches them under `.osm-cache/sources/` (temp under `.osm-cache/tmp/`, Planetiler jar at `.osm-cache/planetiler.jar`). Re-runs reuse the cache.
- Renders tiles `minzoom=0`..`MAXZOOM` clipped to bbox `27.30,53.78,27.78,54.02`.

Outputs:
- `../minsk_map/minsk.pmtiles` — the archive (OUTSIDE the app repo; never committed).
- `../minsk_map/map-version.json` — `{version,bytes,sha256,maxzoom,bounds}`, consumed by the in-app "update map" check.
- Both are then copied into `public/map/` for local dev and deploy assembly (`public/map/` is gitignored).

After building, check the size and run the app to confirm it renders:
```bash
du -h public/map/minsk.pmtiles
```
See the `optimize-size` skill if the archive is too large, and the `run` skill to view it.
