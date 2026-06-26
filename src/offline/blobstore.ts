/**
 * blobstore.ts — large offline binaries stored as Blobs in IndexedDB.
 *
 * Architecture decision (see project memory): the map (`minsk.pmtiles`) and the
 * packed thumbnails (`thumbs.bin`) are kept as Blobs in IndexedDB and read by
 * range via `blob.slice(offset, len).arrayBuffer()`. This is lazy (only the
 * requested bytes are decoded), needs no Web Worker, and avoids the iOS Safari
 * OPFS sync-handle bugs. Installed PWAs are not subject to the 7-day eviction
 * rule, so persistence holds.
 *
 * Uses the shared `offline_kabinka` DB (store `blobs`) from data/idb.ts.
 */

import { getDatabase, BLOBS_STORE } from '../data/idb';
import { AppError } from '../core/errors';

/**
 * Store a Blob under `key`, replacing any existing one.
 * Quota/storage failures surface as AppError('DATA-01').
 */
export async function putBlob(key: string, blob: Blob): Promise<void> {
  try {
    const db = await getDatabase();
    await db.put(BLOBS_STORE, blob, key);
  } catch (e) {
    throw new AppError('DATA-01', e);
  }
}

/** Read the Blob stored under `key`, or null if absent. */
export async function getBlob(key: string): Promise<Blob | null> {
  try {
    const db = await getDatabase();
    const blob = (await db.get(BLOBS_STORE, key)) as Blob | undefined;
    return blob ?? null;
  } catch (e) {
    throw new AppError('STOR-01', e);
  }
}

/** Byte size of the stored Blob, or 0 if absent. */
export async function blobSize(key: string): Promise<number> {
  const blob = await getBlob(key);
  return blob ? blob.size : 0;
}

/** Delete the Blob stored under `key` (no-op if absent). */
export async function deleteBlob(key: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.delete(BLOBS_STORE, key);
  } catch (e) {
    throw new AppError('STOR-01', e);
  }
}
