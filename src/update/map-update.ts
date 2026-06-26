/**
 * map-update.ts — in-app map (PMTiles) refresh.
 *
 *   checkMapUpdate() — compares the served map-version.json against the stored
 *     version marker and decides whether a newer archive is available. Soft on
 *     errors (offline / 404 → "nothing to update").
 *   updateMap()      — streams the new archive into IndexedDB and bumps the
 *     stored version marker. The caller re-registers the stored source and
 *     rebuilds the map style to apply it without a reload.
 *
 * The version marker (`mapVersion` in the kv store) is also written by the
 * first-time downloader (ensureOfflinePackage) so this check has a baseline.
 */

import { AppError } from '../core/errors';
import { getKV, setKV } from '../data/idb';
import { downloadToBlob } from '../offline/downloader';
import { putBlob, blobSize } from '../offline/blobstore';
import { PMTILES_KEY } from '../offline/pmtiles-source';

/** Vite base URL (e.g. "/offline_kabinka/"); "/" outside a Vite build. */
const BASE_URL =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL : '/';

const MAP_VERSION_URL = BASE_URL + 'map/map-version.json';
const MAP_URL = BASE_URL + 'map/minsk.pmtiles';

/** "PMTiles" magic — the first 7 bytes of a valid v3 archive. */
const PMTILES_MAGIC = 'PMTiles';

interface MapVersionManifest {
  version?: string;
}

export interface MapUpdateCheck {
  updateAvailable: boolean;
  version?: string;
}

/** Fetch and parse map-version.json; null on any network/parse/404 failure. */
async function fetchRemoteVersion(): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(MAP_VERSION_URL);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const manifest = (await res.json()) as MapVersionManifest;
    return typeof manifest.version === 'string' ? manifest.version : null;
  } catch {
    return null;
  }
}

/**
 * Decide whether a newer map is available.
 *   • no served version (offline / 404 / bad json) → not available (soft).
 *   • served === stored                            → not available.
 *   • stored empty but a map blob already exists    → adopt the served version
 *     as the current one and report "not available" (don't re-download).
 *   • otherwise                                     → available.
 */
export async function checkMapUpdate(): Promise<MapUpdateCheck> {
  const remote = await fetchRemoteVersion();
  if (!remote) return { updateAvailable: false };

  const stored = await getKV<string | null>('mapVersion');
  if (stored && stored === remote) return { updateAvailable: false };

  // No stored marker (or it was reset to null), but the archive is already in
  // IndexedDB → treat the current download as up to date and record its version.
  if (!stored) {
    const haveMap = (await blobSize(PMTILES_KEY)) > 0;
    if (haveMap) {
      await setKV('mapVersion', remote);
      return { updateAvailable: false };
    }
  }

  return { updateAvailable: true, version: remote };
}

/**
 * Download the current map archive into IndexedDB and record its version.
 *
 * @param onProgress (loaded, total) bytes; `total` is 0 when the server omits
 *   Content-Length. Forwarded straight from downloadToBlob.
 * @throws AppError MAP-01 (download/HTTP), NET-01 (offline), MAP-02 (not a
 *   PMTiles archive).
 */
export async function updateMap(
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  const blob = await downloadToBlob(MAP_URL, onProgress, 'MAP-01');

  // Light sanity check: a real archive starts with the ASCII magic "PMTiles".
  // Guards against a captive-portal HTML page or a truncated download.
  try {
    const head = await blob.slice(0, PMTILES_MAGIC.length).text();
    if (head !== PMTILES_MAGIC) throw new AppError('MAP-02');
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('MAP-02', e);
  }

  await putBlob(PMTILES_KEY, blob);

  // Record the version so future checks know we're current. Best-effort: a
  // missing/404 manifest just leaves the marker unset (next check re-adopts it).
  const remote = await fetchRemoteVersion();
  if (remote) await setKV('mapVersion', remote);
}
