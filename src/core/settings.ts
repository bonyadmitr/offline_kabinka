// Persisted user preferences (theme + default navigator). The UI language lives
// in the i18n module; these are read back on next launch.

import type { NavigatorId } from '../ui/settings';
import type { ThemePref } from './theme';

const THEME_KEY = 'offline_kabinka.theme';
const NAV_KEY = 'offline_kabinka.navigator';

const THEMES: ThemePref[] = ['system', 'light', 'dark'];
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

/**
 * Whether the user has explicitly chosen a navigator (via settings or the route
 * picker). When false, the route panel asks once before opening, then persists
 * the choice. loadNavigator() always returns a usable default regardless.
 */
export function hasChosenNavigator(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) != null;
  } catch {
    return false;
  }
}
