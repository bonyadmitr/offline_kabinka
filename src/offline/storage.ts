/**
 * storage.ts — measure on-device usage, clear the transient photo cache, and
 * delete the offline package.
 *
 *  • estimateUsage()    → total + a per-bucket breakdown (map, thumbs, data,
 *                         photos, shell), in bytes. Computed from *exact* known
 *                         sizes — NOT navigator.storage.estimate().usage, which
 *                         Chrome pads heavily for cross-origin opaque photo
 *                         responses (the old code reported ~537 MB this way).
 *  • clearTransient()   → drop the runtime "photos" Cache (full-size originals)
 *                         and return the bytes freed. Never touches the blob
 *                         package or the precached shell.
 *  • deletePackage()    → delete the stored binaries + version markers and drop
 *                         the in-memory thumbnail pack. Leaves the photo cache.
 */

import { blobSize, deleteBlob } from './blobstore';
import { setKV } from '../data/idb';
import { PMTILES_KEY } from './pmtiles-source';
import { clearPack } from './thumbs';
import { t } from '../i18n';

const THUMBS_KEY = 'thumbs';
const THUMBS_INDEX_KV = 'thumbsIndex';
const MAP_VERSION_KV = 'mapVersion';
/** Workbox runtime cache holding full-size photos (see vite.config.ts). */
const PHOTOS_CACHE = 'photos';
/**
 * Browsers hide the true byte size of cross-origin *opaque* photo responses, so
 * we estimate the photo cache as (entry count) × this nominal per-photo size.
 * Thumbnails average ~0.11 MB after the Lanczos3/MozJPEG pass.
 */
const NOMINAL_PHOTO_BYTES = 0.11 * 1024 * 1024;
/** Fallback for the dataset when its Cache entry has no readable length. */
const NOMINAL_DATA_BYTES = 0.7 * 1024 * 1024;

export interface UsageBreakdown {
  map: number;
  thumbs: number;
  data: number;
  photos: number;
  shell: number;
}

export interface Usage {
  total: number;
  breakdown: UsageBreakdown;
  /** photos is an estimate (opaque responses hide their real size). */
  photosEstimated: boolean;
}

/**
 * Read the byte size of a single Cache response, preferring the declared
 * Content-Length and falling back to reading the blob. Returns 0 for opaque
 * cross-origin responses whose size the browser hides.
 */
async function responseBytes(res: Response): Promise<number> {
  const len = res.headers.get('Content-Length');
  if (len) return Number(len);
  try {
    return (await res.clone().blob()).size;
  } catch {
    return 0; // opaque/streamed response with no readable length
  }
}

/**
 * Estimate storage usage with a per-bucket breakdown, computed entirely from
 * *exact, known* sizes — deliberately NOT `navigator.storage.estimate().usage`,
 * which Chrome inflates with padding for cross-origin opaque photo responses
 * (that padding is what produced the bogus "537 MB" total).
 *
 *  • map / thumbs → exact Blob sizes from IndexedDB.
 *  • data         → the readable (same-origin) dataset response, or a nominal.
 *  • shell        → sum of readable same-origin Cache responses, excluding the
 *                   photos bucket and the dataset.
 *  • photos       → (entry count in the photos bucket) × a nominal per-photo
 *                   size; flagged as an estimate since the real size is hidden.
 *
 * total = the sum of these components.
 */
export async function estimateUsage(): Promise<Usage> {
  const map = await blobSize(PMTILES_KEY);
  const thumbs = await blobSize(THUMBS_KEY);

  let photos = 0;
  let shell = 0;
  let data = 0;

  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys();
      for (const name of names) {
        const cache = await caches.open(name);
        const reqs = await cache.keys();

        if (name.includes(PHOTOS_CACHE)) {
          // Opaque cross-origin originals: count entries, size nominally.
          photos += reqs.length * NOMINAL_PHOTO_BYTES;
          continue;
        }

        // Precache (and any other same-origin cache): attribute the dataset to
        // `data` and the rest of the readable responses to `shell`.
        for (const req of reqs) {
          const res = await cache.match(req);
          if (!res) continue;
          const size = await responseBytes(res);
          if (req.url.includes('/data/') || req.url.endsWith('locations.json')) {
            data += size || NOMINAL_DATA_BYTES;
          } else {
            shell += size;
          }
        }
      }
    } catch {
      /* Cache Storage unavailable — buckets stay 0 */
    }
  }

  const total = map + thumbs + data + photos + shell;

  return {
    total,
    breakdown: { map, thumbs, data, photos, shell },
    photosEstimated: photos > 0,
  };
}

/**
 * Estimated bytes held by the transient photo cache. The originals are opaque
 * cross-origin responses whose real size the browser hides, so — exactly like
 * estimateUsage's photo bucket — we use (entry count) × a nominal per-photo
 * size rather than reading the (padded / hidden) response sizes.
 */
async function photoCacheBytes(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  let bytes = 0;
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!name.includes(PHOTOS_CACHE)) continue;
      const reqs = await (await caches.open(name)).keys();
      bytes += reqs.length * NOMINAL_PHOTO_BYTES;
    }
  } catch {
    return bytes;
  }
  return bytes;
}

/**
 * Delete the transient photo cache (full-size originals). Returns the estimated
 * number of bytes freed. Leaves the blob package ('minsk', 'thumbs') and the
 * precached shell untouched.
 */
export async function clearTransient(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const freed = await photoCacheBytes();
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!name.includes(PHOTOS_CACHE)) continue;
      await caches.delete(name);
    }
  } catch {
    /* deletion best-effort */
  }
  return freed;
}

/** Estimated bytes in the transient photo cache (for the button label). */
export async function transientBytes(): Promise<number> {
  return photoCacheBytes();
}

/**
 * Delete the offline package: the stored map + thumbnail binaries and their
 * version markers, plus the in-memory thumbnail pack (so thumbnails fall back
 * to the online URL). Leaves the transient photo cache untouched. After this
 * the map must be re-pointed at the network source by the caller.
 */
export async function deletePackage(): Promise<void> {
  await deleteBlob(PMTILES_KEY);
  await deleteBlob(THUMBS_KEY);
  // Reset version markers so a future update check re-evaluates from scratch.
  await setKV(MAP_VERSION_KV, null);
  await setKV(THUMBS_INDEX_KV, null);
  clearPack();
}

/** Human-readable byte size using the localized unit strings. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return t('unit.bytes', { v: 0 });
  const MB = 1024 * 1024;
  const KB = 1024;
  if (bytes >= MB) return t('unit.mb', { v: (bytes / MB).toFixed(1) });
  if (bytes >= KB) return t('unit.kb', { v: Math.round(bytes / KB) });
  return t('unit.bytes', { v: bytes });
}
