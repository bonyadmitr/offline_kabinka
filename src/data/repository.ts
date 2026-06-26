import type { Location } from '../core/types';
import { AppError } from '../core/errors';
import { getKV, setKV } from './idb';

/** Load locations: idb cache first, then baseline JSON fetch. */
export async function loadLocations(): Promise<Location[]> {
  try {
    const cached = await getKV<Location[]>('locations');
    if (Array.isArray(cached) && cached.length > 0) return cached;
  } catch (e) {
    // idb read failure — fall through to fetch
  }

  const base = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.BASE_URL
    : '/';
  const res = await fetch(base + 'data/locations.json');
  if (!res.ok) throw new AppError('DATA-01');
  return res.json() as Promise<Location[]>;
}

/** Persist locations to idb. */
export async function saveLocations(arr: Location[], updatedAt = Date.now()): Promise<void> {
  try {
    await setKV('locations', arr);
    await setKV('locationsUpdatedAt', updatedAt);
  } catch (e) {
    throw new AppError('DATA-01', e);
  }
}
