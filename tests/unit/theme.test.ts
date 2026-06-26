import { afterEach, vi } from 'vitest';
import { effectiveTheme, systemPrefersDark } from '../../src/core/theme';
import { loadTheme, saveTheme } from '../../src/core/settings';

afterEach(() => {
  vi.unstubAllGlobals();
  try {
    localStorage.removeItem('offline_kabinka.theme');
  } catch {
    /* ignore */
  }
});

/** Stub matchMedia('(prefers-color-scheme: dark)') to a fixed result. */
function stubPrefersDark(dark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: dark,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

test('effectiveTheme passes through explicit light/dark', () => {
  expect(effectiveTheme('light')).toBe('light');
  expect(effectiveTheme('dark')).toBe('dark');
});

test('effectiveTheme("system") follows the OS preference', () => {
  stubPrefersDark(true);
  expect(systemPrefersDark()).toBe(true);
  expect(effectiveTheme('system')).toBe('dark');

  stubPrefersDark(false);
  expect(effectiveTheme('system')).toBe('light');
});

test('theme preference persists and defaults to "system"', () => {
  expect(loadTheme()).toBe('system'); // nothing stored yet
  saveTheme('dark');
  expect(loadTheme()).toBe('dark');
  saveTheme('system');
  expect(loadTheme()).toBe('system');
});
