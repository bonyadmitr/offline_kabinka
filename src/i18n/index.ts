// Tiny runtime i18n. One active language at a time; `t(key, params?)` resolves
// against the current dictionary, falling back to Russian (the complete source
// dictionary) for any key the active language has not translated yet.
//
// Persistence mirrors core/settings: the chosen language is stored under
// `offline_kabinka.uiLang` and read back on next launch. main.ts keeps the
// in-memory store in sync and re-renders on change.

import { ru, type Dict, type RuKey } from './ru';
import { en } from './en';

export type Lang = 'ru' | 'en';
export type I18nKey = RuKey;

const LANG_KEY = 'offline_kabinka.uiLang';
const DICTS: Record<Lang, Dict> = { ru, en };

function loadLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'ru' || v === 'en') return v;
  } catch {
    /* ignore */
  }
  return 'ru';
}

let current: Lang = loadLang();

/** The active language. */
export function getLang(): Lang {
  return current;
}

/** Switch the active language and persist the choice. Re-rendering is the caller's job. */
export function setLang(l: Lang): void {
  current = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* ignore */
  }
}

/**
 * Translate `key` in the current language, with a Russian fallback. `params` feed
 * function-valued entries (plurals, interpolation). Unknown keys return the key
 * itself so a missing string is visible rather than blank.
 */
export function t(key: I18nKey, params: Record<string, unknown> = {}): string {
  const entry = DICTS[current][key] ?? ru[key];
  if (entry == null) return key;
  return typeof entry === 'function' ? entry(params) : entry;
}
