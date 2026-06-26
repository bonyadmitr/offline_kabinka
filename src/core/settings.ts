// Persisted user preferences (radius + default navigator). Theme/language live
// in the in-memory store for now; these two are read back on next launch.

import type { Radius, NavigatorId } from '../ui/settings';

const RADIUS_KEY = 'offline_kabinka.radius';
const NAV_KEY = 'offline_kabinka.navigator';

const RADII: Radius[] = [1, 2, 5, 20];
const NAVS: NavigatorId[] = ['yandex_maps', 'yandex_navi', 'google', 'apple'];

export function loadRadius(): Radius {
  try {
    const v = Number(localStorage.getItem(RADIUS_KEY));
    if (RADII.includes(v as Radius)) return v as Radius;
  } catch {
    /* ignore */
  }
  return 2;
}

export function saveRadius(km: Radius): void {
  try {
    localStorage.setItem(RADIUS_KEY, String(km));
  } catch {
    /* ignore */
  }
}

export function loadNavigator(): NavigatorId {
  try {
    const v = localStorage.getItem(NAV_KEY);
    if (v && NAVS.includes(v as NavigatorId)) return v as NavigatorId;
  } catch {
    /* ignore */
  }
  return 'yandex_maps';
}

export function saveNavigator(id: NavigatorId): void {
  try {
    localStorage.setItem(NAV_KEY, id);
  } catch {
    /* ignore */
  }
}
