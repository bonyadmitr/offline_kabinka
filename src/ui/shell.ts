import type maplibregl from 'maplibre-gl';
import { registerPmtiles, createMap } from '../map/map';
import { buildStyle } from '../map/style';
import { resolvePmtilesUrl } from '../offline/pmtiles-source';
import { addZoomControls, addGeolocate } from '../map/controls';
import { toUserMessage } from '../core/errors';

// shell.ts — the MapLibre layer. Everything that pulls in the map engine (MapLibre,
// pmtiles, the GL CSS) lives behind this module so it can be code-split into a lazy
// chunk. The DOM chrome (sheet/toolbar/settings/#map container) is built separately
// and synchronously by ui/scaffold.ts; main.ts imports THIS module dynamically,
// after the first list render, to instantiate the map into the scaffold's mapEl.

export interface MapHandle {
  map: maplibregl.Map;
  /**
   * The resolved bare pmtiles source string used for the initial style —
   * either the stored-blob key (`minsk`) or the network URL. main.ts reuses
   * it for style rebuilds (theme/lang swaps) so the source stays consistent.
   */
  pmtilesUrl: string;
}

export interface AttachMapOpts {
  lang: 'ru' | 'en';
  theme: 'light' | 'dark';
  /**
   * Called when the geolocate control fails or is denied (every press, incl.
   * repeats). main.ts wires this to a visible toast; without it the error only
   * reaches the console.
   */
  onGeoError?: (message: string) => void;
}

/**
 * Instantiate the map into an existing `#map` container (built by mountScaffold).
 * The map may render an empty canvas until real PMTiles ship — that is expected
 * and must not throw.
 *
 * Async because it first checks IndexedDB for a stored map blob: if present the
 * map is served from IndexedDB (offline), otherwise from the network URL.
 */
export async function attachMap(
  mapEl: HTMLElement,
  opts: AttachMapOpts,
): Promise<MapHandle> {
  // Resolve the map source: stored IndexedDB blob (offline) if present, else the
  // network URL. registerPmtiles() is also called inside resolvePmtilesUrl when a
  // stored blob is found; call it here too so the network path is registered.
  registerPmtiles();
  const pmtilesUrl = await resolvePmtilesUrl();

  // Create the map. Guard so a missing PMTiles file never crashes the app.
  const map = createMap(mapEl, buildStyle({ lang: opts.lang, theme: opts.theme, pmtilesUrl }));

  // Surface (but do not throw on) map errors — empty tiles in dev are fine.
  map.on('error', (e) => {
    console.warn('[map]', (e as { error?: Error }).error?.message ?? e);
  });

  addZoomControls(map, mapEl);
  addGeolocate(map, {
    onError: (err) => {
      const message = toUserMessage(err);
      console.warn('[geolocate]', message);
      // Surface a visible message (e.g. permission denied) on every press.
      opts.onGeoError?.(message);
    },
  });

  return { map, pmtilesUrl };
}
