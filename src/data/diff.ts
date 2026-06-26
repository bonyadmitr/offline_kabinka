import type { Location } from '../core/types';

export interface DataDiff {
  added: number[];
  removed: number[];
  changed: number[];
}

// Fields that are computed/volatile and should not trigger a "changed" signal
const VOLATILE_FIELDS: Set<string> = new Set(['distance_meters']);

function stableKey(loc: Location): string {
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(loc)) {
    if (!VOLATILE_FIELDS.has(k)) copy[k] = v;
  }
  return JSON.stringify(copy, Object.keys(copy).sort());
}

/**
 * Compare old and new location arrays by id.
 * Returns ids that were added, removed, or changed (stable field diff).
 */
export function diffLocations(oldArr: Location[], newArr: Location[]): DataDiff {
  const oldMap = new Map(oldArr.map(l => [l.id, l]));
  const newMap = new Map(newArr.map(l => [l.id, l]));

  const added: number[] = [];
  const removed: number[] = [];
  const changed: number[] = [];

  for (const [id, newLoc] of newMap) {
    if (!oldMap.has(id)) {
      added.push(id);
    } else {
      if (stableKey(oldMap.get(id)!) !== stableKey(newLoc)) {
        changed.push(id);
      }
    }
  }

  for (const id of oldMap.keys()) {
    if (!newMap.has(id)) removed.push(id);
  }

  return { added, removed, changed };
}
