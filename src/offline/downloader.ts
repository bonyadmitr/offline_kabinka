/**
 * downloader.ts — fetch the large offline binaries and stash them in IndexedDB.
 *
 * Architecture (see project memory): the map (`minsk.pmtiles`) and packed
 * thumbnails (`thumbs.bin`) are stored as Blobs in IndexedDB; ranges are read
 * later via blob.slice(). The dataset itself (locations.json, thumbs-index.json)
 * is served by the service-worker precache, so we do NOT download it here — we
 * only fetch the thumbs index to register the in-memory pack.
 *
 * Progress for ensureOfflinePackage() is a single 0..1 fraction weighted by the
 * two downloads' byte sizes (discovered from Content-Length as each starts).
 */

import { AppError } from '../core/errors';
import { putBlob, getBlob, blobSize } from './blobstore';
import { setKV, getKV } from '../data/idb';
import { setPack, type ThumbIndex } from './thumbs';
import { PMTILES_KEY } from './pmtiles-source';
import { t, type I18nKey } from '../i18n';

/** Vite base URL (e.g. "/offline_kabinka/"); "/" outside a Vite build. */
const BASE_URL =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.BASE_URL
    : '/';

const MAP_URL = BASE_URL + 'map/minsk.pmtiles';
const MAP_VERSION_URL = BASE_URL + 'map/map-version.json';
const THUMBS_BIN_URL = BASE_URL + 'thumbs/thumbs.bin';
const THUMBS_INDEX_URL = BASE_URL + 'thumbs/thumbs-index.json';

const THUMBS_KEY = 'thumbs';
const THUMBS_INDEX_KV = 'thumbsIndex';

/** Fallback weight (bytes) for the map when its Content-Length is unknown. */
const MAP_FALLBACK_BYTES = 12 * 1024 * 1024;
/** Packed thumbnails are ~8.3 MB; used when Content-Length is missing. */
const THUMBS_FALLBACK_BYTES = 8.3 * 1024 * 1024;

const DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * Stream `url` into a Blob, reporting (loaded, total) as bytes arrive. `total`
 * is 0 when the server omits Content-Length (indeterminate). The error code
 * reflects the failure: NET-01 offline, NET-02 timeout, otherwise `notOkCode`.
 */
export async function downloadToBlob(
  url: string,
  onProgress: (loaded: number, total: number) => void,
  notOkCode: 'MAP-01' | 'API-01' = 'MAP-01',
): Promise<Blob> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AppError('NET-01');
  }

  // A *stall* timeout: abort only if no progress (headers, then chunks) arrives
  // within the window. Reset on each chunk so a slow-but-steady large download
  // (the 12 MB map on mobile) is not killed mid-transfer; a truly unresponsive
  // server still trips NET-02.
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const resetTimer = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  };

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new AppError('NET-02', e);
    }
    // Network-layer failure (DNS, offline, CORS) → treat as no connection.
    throw new AppError('NET-01', e);
  }

  if (!res.ok) {
    clearTimeout(timer);
    throw new AppError(notOkCode);
  }

  const lenHeader = res.headers.get('Content-Length');
  const total = lenHeader ? Number(lenHeader) : 0;

  // No streaming body (older engines / mocked fetch): fall back to blob().
  if (!res.body || typeof res.body.getReader !== 'function') {
    clearTimeout(timer);
    const blob = await res.blob();
    onProgress(blob.size, total || blob.size);
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        resetTimer();
        chunks.push(value);
        loaded += value.byteLength;
        onProgress(loaded, total);
      }
    }
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new AppError('NET-02', e);
    }
    throw new AppError('NET-01', e);
  }
  clearTimeout(timer);

  // Blob ctor accepts ArrayBufferView[]; type kept generic for binary payloads.
  return new Blob(chunks as BlobPart[], { type: 'application/octet-stream' });
}

/**
 * Ensure both offline binaries are present in IndexedDB, skipping any already
 * downloaded, and load the thumbnail pack into memory. `onProgress(overall,
 * label)` reports a size-weighted 0..1 fraction and the current stage label.
 *
 * Steps (in order): 1) map, 2) thumbs.bin + index, 3) hydrate the in-memory
 * pack. The dataset is precached separately, so it is not fetched here.
 */
export async function ensureOfflinePackage(
  onProgress: (overall: number, label: string) => void,
): Promise<void> {
  const haveMap = (await blobSize(PMTILES_KEY)) > 0;
  const haveThumbs = (await blobSize(THUMBS_KEY)) > 0;

  // Per-stage weights: skipped stages contribute 0 so the bar reflects only the
  // remaining work. Use fallbacks until a real Content-Length is observed.
  const weights = {
    map: haveMap ? 0 : MAP_FALLBACK_BYTES,
    thumbs: haveThumbs ? 0 : THUMBS_FALLBACK_BYTES,
  };
  const loadedFrac = { map: haveMap ? 1 : 0, thumbs: haveThumbs ? 1 : 0 };

  const report = (labelKey: I18nKey): void => {
    const label = t(labelKey);
    const totalW = weights.map + weights.thumbs;
    if (totalW <= 0) {
      onProgress(1, label);
      return;
    }
    const done = loadedFrac.map * weights.map + loadedFrac.thumbs * weights.thumbs;
    onProgress(Math.max(0, Math.min(1, done / totalW)), label);
  };

  // ── 1) Map ──
  if (!haveMap) {
    report('offline.stageMap');
    const blob = await downloadToBlob(
      MAP_URL,
      (loaded, total) => {
        if (total > 0) weights.map = total;
        loadedFrac.map = total > 0 ? loaded / total : 0;
        report('offline.stageMap');
      },
      'MAP-01',
    );
    await putBlob(PMTILES_KEY, blob);
    loadedFrac.map = 1;
    // Record the map version so the in-app "update map" check has a baseline and
    // can correctly report "nothing to update". Best-effort: a missing/404
    // manifest (common in dev) just leaves the marker unset.
    await recordMapVersion();
  }

  // ── 2) Thumbnails: binary pack + index ──
  if (!haveThumbs) {
    report('offline.stageThumbs');
    const blob = await downloadToBlob(
      THUMBS_BIN_URL,
      (loaded, total) => {
        if (total > 0) weights.thumbs = total;
        loadedFrac.thumbs = total > 0 ? loaded / total : 0;
        report('offline.stageThumbs');
      },
      'API-01',
    );
    await putBlob(THUMBS_KEY, blob);
    loadedFrac.thumbs = 1;

    const index = await fetchThumbsIndex();
    await setKV(THUMBS_INDEX_KV, index);
  }

  // ── 3) Hydrate the in-memory pack so thumbs resolve from the bundle ──
  report('offline.stageFinalize');
  await loadThumbsPackFromIDB();
  report('offline.done');
}

/**
 * Fetch map-version.json and stash its `version` under the `mapVersion` kv key.
 * Soft: any network/parse/404 failure is swallowed (the version check re-adopts
 * the served version later when a stored blob is present).
 */
async function recordMapVersion(): Promise<void> {
  try {
    const res = await fetch(MAP_VERSION_URL);
    if (!res.ok) return;
    const manifest = (await res.json()) as { version?: string };
    if (typeof manifest.version === 'string') {
      await setKV('mapVersion', manifest.version);
    }
  } catch {
    // best-effort; ignore
  }
}

/** Fetch and parse the thumbnail index JSON. */
async function fetchThumbsIndex(): Promise<ThumbIndex> {
  let res: Response;
  try {
    res = await fetch(THUMBS_INDEX_URL);
  } catch (e) {
    throw new AppError('NET-01', e);
  }
  if (!res.ok) throw new AppError('API-01');
  try {
    return (await res.json()) as ThumbIndex;
  } catch (e) {
    throw new AppError('API-02', e);
  }
}

/**
 * On startup: if the thumbs blob is present in IndexedDB, read it plus the
 * stored index and register the in-memory pack so thumbnails are served offline
 * from the bundle. No-op when the pack has not been downloaded yet.
 */
export async function loadThumbsPackFromIDB(): Promise<void> {
  const blob = await getBlob(THUMBS_KEY);
  if (!blob) return;

  let index = await getKV<ThumbIndex>(THUMBS_INDEX_KV);
  // Index missing (e.g. downloaded before this code shipped): refetch it.
  if (!index) {
    try {
      index = await fetchThumbsIndex();
      await setKV(THUMBS_INDEX_KV, index);
    } catch {
      return; // can't register the pack without an index
    }
  }

  const buf = await blob.arrayBuffer();
  setPack(buf, index);
}

/**
 * Rough size of the not-yet-downloaded part of the offline package, in bytes,
 * for the install offer ("~N MB"). Uses fallbacks; no network probe.
 */
export async function pendingPackageBytes(): Promise<number> {
  let bytes = 0;
  if ((await blobSize(PMTILES_KEY)) === 0) bytes += MAP_FALLBACK_BYTES;
  if ((await blobSize(THUMBS_KEY)) === 0) bytes += THUMBS_FALLBACK_BYTES;
  return bytes;
}
