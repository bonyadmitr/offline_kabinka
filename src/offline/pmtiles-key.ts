/**
 * pmtiles-key.ts — the IndexedDB key under which the map archive is stored.
 *
 * Split into its own dependency-free module on purpose: downloader/storage/
 * map-update only need this constant, and importing it must NOT drag in
 * pmtiles-source.ts (which statically imports map/map.ts → maplibre-gl). Keeping
 * the key here lets the whole MapLibre engine stay in a lazy chunk.
 */
export const PMTILES_KEY = 'minsk';
