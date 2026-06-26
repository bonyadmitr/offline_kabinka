// Persisted user preferences (theme + radius + default navigator). The UI
// language lives in the i18n module; these are read back on next launch.

import type { Radius, NavigatorId } from '../ui/settings';
import type { ThemePref } from './theme';

const THEME_KEY = 'offline_kabinka.theme';
const RADIUS_KEY = 'offline_kabinka.radius';
const NAV_KEY = 'offline_kabinka.navigator';

const THEMES: ThemePref[] = ['system', 'light', 'dark'];
const RADII: Radius[] = [1, 2, 5, 20];
const NAVS: NavigatorId[] = ['yandex_maps', 'yandex_navi', 'google', 'apple'];

export function loadTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v && THEMES.includes(v as ThemePref)) return v as ThemePref;
  } catch {
    /* ignore */
  }
  return 'system';
}

export function saveTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* ignore */
  }
}

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
