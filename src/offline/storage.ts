/**
 * storage.ts — measure on-device usage, clear the transient photo cache, and
 * reinstall the offline package.
 *
 *  • estimateUsage()    → total + a per-bucket breakdown (map, thumbs, data,
 *                         photos, shell), in bytes.
 *  • clearTransient()   → drop the runtime "photos" Cache (full-size originals)
 *                         and return the bytes freed. Never touches the blob
 *                         package or the precached shell.
 *  • reinstallPackage() → delete the stored binaries + version markers, then
 *                         re-run ensureOfflinePackage().
 */

import { blobSize, deleteBlob } from './blobstore';
import { setKV } from '../data/idb';
import { PMTILES_KEY } from './pmtiles-source';
import { ensureOfflinePackage } from './downloader';
import { t } from '../i18n';

const THUMBS_KEY = 'thumbs';
/** Workbox runtime cache holding full-size photos (see vite.config.ts). */
const PHOTOS_CACHE = 'photos';

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
}

/** Sum the byte sizes of every response in a Cache. */
async function cacheBytes(cache: Cache): Promise<number> {
  const reqs = await cache.keys();
  let bytes = 0;
  for (const req of reqs) {
    const res = await cache.match(req);
    if (!res) continue;
    // Prefer the declared length; fall back to reading the blob.
    const len = res.headers.get('Content-Length');
    if (len) {
      bytes += Number(len);
    } else {
      try {
        bytes += (await res.clone().blob()).size;
      } catch {
        /* opaque/streamed response with no length — skip */
      }
    }
  }
  return bytes;
}

/**
 * Estimate storage usage with a per-bucket breakdown. `map`/`thumbs` come from
 * the blob store; `photos`/`shell`/`data` are summed from Cache Storage (the
 * precached shell includes data/locations.json, so we attribute that file to
 * `data` and the rest of the precache to `shell`). `total` prefers the browser's
 * own estimate, falling back to the bucket sum.
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
        if (name.includes(PHOTOS_CACHE)) {
          photos += await cacheBytes(cache);
          continue;
        }
        // Precache (and any other): split out the dataset from the shell.
        const reqs = await cache.keys();
        for (const req of reqs) {
          const res = await cache.match(req);
          if (!res) continue;
          let size = 0;
          const len = res.headers.get('Content-Length');
          if (len) size = Number(len);
          else {
            try {
              size = (await res.clone().blob()).size;
            } catch {
              size = 0;
            }
          }
          if (req.url.includes('/data/') || req.url.endsWith('.json')) data += size;
          else shell += size;
        }
      }
    } catch {
      /* Cache Storage unavailable — buckets stay 0 */
    }
  }

  const sum = map + thumbs + data + photos + shell;

  let total = sum;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number' && est.usage > 0) total = est.usage;
    } catch {
      /* keep the bucket sum */
    }
  }

  return { total, breakdown: { map, thumbs, data, photos, shell } };
}

/**
 * Delete the transient photo cache (full-size originals). Returns the number of
 * bytes freed. Leaves the blob package ('minsk', 'thumbs') and the precached
 * shell untouched.
 */
export async function clearTransient(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  let freed = 0;
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!name.includes(PHOTOS_CACHE)) continue;
      const cache = await caches.open(name);
      freed += await cacheBytes(cache);
      await caches.delete(name);
    }
  } catch {
    return freed;
  }
  return freed;
}

/** Bytes currently held by the transient photo cache (for the button label). */
export async function transientBytes(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  let bytes = 0;
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!name.includes(PHOTOS_CACHE)) continue;
      bytes += await cacheBytes(await caches.open(name));
    }
  } catch {
    return bytes;
  }
  return bytes;
}

/**
 * Remove the stored offline binaries + version markers, then re-download the
 * package. Progress is forwarded to `onProgress`.
 */
export async function reinstallPackage(
  onProgress: (overall: number, label: string) => void = () => {},
): Promise<void> {
  await deleteBlob(PMTILES_KEY);
  await deleteBlob(THUMBS_KEY);
  // Reset version markers so a future WU8 update check re-evaluates from scratch.
  await setKV('mapVersion', null);
  await setKV('thumbsIndex', null);
  await ensureOfflinePackage(onProgress);
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
