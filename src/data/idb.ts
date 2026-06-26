import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

const DB_NAME = 'offline_kabinka';
// v2: added the `blobs` store (large offline binaries: minsk.pmtiles, thumbs.bin).
const DB_VERSION = 2;
const STORE = 'kv';
export const BLOBS_STORE = 'blobs';

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE);
      }
    },
  });
  return _db;
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get(STORE, key) as Promise<T | undefined>;
}

export async function setKV(key: string, val: unknown): Promise<void> {
  const db = await getDB();
  await db.put(STORE, val, key);
}

/**
 * Shared DB accessor for stores other than `kv` (e.g. blobstore.ts).
 * Keeps a single connection + upgrade path for the whole app.
 */
export function getDatabase(): Promise<IDBPDatabase> {
  return getDB();
}
