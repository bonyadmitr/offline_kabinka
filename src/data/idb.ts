import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

const DB_NAME = 'offline_kabinka';
const DB_VERSION = 1;
const STORE = 'kv';

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
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
