#!/usr/bin/env bash
# Build the Minsk-only vector basemap (OpenMapTiles schema) as a single .pmtiles.
#
# Pipeline: Planetiler downloads the Belarus OSM extract (+ Natural Earth + water
# polygons, cached) and renders tiles clipped to the Minsk bounding box. Output goes
# to ../minsk_map/ (OUTSIDE the app repo — the binary is never committed, per design)
# and is also copied into public/map/ for local dev and deploy assembly.
#
# Requirements: Java 21+ (brew install openjdk@21). ~1.3 GB one-time source downloads
# (cached in .osm-cache/sources), a few minutes of processing.
#
# Usage:  bash scripts/build-map.sh            # default maxzoom=15
#         MAXZOOM=16 bash scripts/build-map.sh # crisper buildings, larger file
set -euo pipefail
cd "$(dirname "$0")/.."  # → app root

JAVA="${JAVA:-/opt/homebrew/opt/openjdk@21/bin/java}"
CACHE=".osm-cache"
JAR="$CACHE/planetiler.jar"
# Planetiler source downloads (belarus.osm.pbf, water polygons, natural earth, …) —
# ~1.7 GB, kept OUTSIDE the app in ../maps so they are reused across rebuilds.
SRC_DIR="../maps"
OUT_DIR="../minsk_map"
OUT="$OUT_DIR/minsk.pmtiles"
# Minsk bbox with a small margin (all 263 data points fit inside): W,S,E,N
BOUNDS="27.30,53.78,27.78,54.02"
MAXZOOM="${MAXZOOM:-15}"

mkdir -p "$OUT_DIR" "$SRC_DIR" "$CACHE/tmp" public/map

# Resolve Java: prefer the explicit keg path, fall back to PATH java.
if ! "$JAVA" -version >/dev/null 2>&1; then
  if command -v java >/dev/null 2>&1; then JAVA="java"; else
    echo "ERROR: Java 21+ not found. Install with: brew install openjdk@21" >&2; exit 1
  fi
fi

# Fetch Planetiler if missing.
[ -f "$JAR" ] || curl -sL -o "$JAR" \
  https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar

echo "==> Building Minsk basemap (maxzoom=$MAXZOOM, bounds=$BOUNDS)"
"$JAVA" -Xmx8g -jar "$JAR" \
  --download --area=belarus \
  --bounds="$BOUNDS" \
  --minzoom=0 --maxzoom="$MAXZOOM" \
  --download-dir="$SRC_DIR" \
  --tmpdir="$CACHE/tmp" \
  --output="$OUT" --force

# Version manifest (used by the in-app "update map" check).
SHA=$(shasum -a 256 "$OUT" | cut -d' ' -f1)
BYTES=$(stat -f%z "$OUT")
VER=$(date +%Y%m%d%H%M)
printf '{"version":"%s","bytes":%s,"sha256":"%s","maxzoom":%s,"bounds":"%s"}\n' \
  "$VER" "$BYTES" "$SHA" "$MAXZOOM" "$BOUNDS" > "$OUT_DIR/map-version.json"

# Copy into the app for local dev + deploy assembly (public/map/ is gitignored).
cp "$OUT" "$OUT_DIR/map-version.json" public/map/

echo "==> Done: $OUT ($(du -h "$OUT" | cut -f1)), version $VER"
