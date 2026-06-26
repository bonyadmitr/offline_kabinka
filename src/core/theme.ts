/**
 * theme.ts — theme preference ('system' | 'light' | 'dark') and its resolution
 * to an *effective* theme ('light' | 'dark').
 *
 *  • 'system'  → follow `matchMedia('(prefers-color-scheme: dark)')`.
 *  • 'light'/'dark' → fixed.
 *
 * The effective theme drives both the `theme-dark` class on <html> and the map
 * style. When the preference is 'system', callers can subscribe to OS-level
 * changes via watchSystemTheme() and re-apply live.
 */

export type ThemePref = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

/** True when the OS currently prefers a dark colour scheme. */
export function systemPrefersDark(): boolean {
  if (typeof matchMedia !== 'function') return false;
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/** Resolve a stored preference to the theme that should actually be applied. */
export function effectiveTheme(pref: ThemePref): EffectiveTheme {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return pref;
}

/**
 * Subscribe to OS colour-scheme changes. Calls `cb` with the new effective
 * theme whenever the system preference flips. Returns an unsubscribe function.
 * No-op (returns a no-op disposer) where matchMedia is unavailable.
 */
export function watchSystemTheme(cb: (eff: EffectiveTheme) => void): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  let mql: MediaQueryList;
  try {
    mql = matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return () => {};
  }
  const handler = (e: MediaQueryListEvent): void => cb(e.matches ? 'dark' : 'light');
  // addEventListener is the modern API; older Safari only has addListener.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  mql.addListener(handler);
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return () => mql.removeListener(handler);
}
