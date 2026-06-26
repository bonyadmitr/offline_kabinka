import { ru } from '../../src/i18n/ru';
import { en } from '../../src/i18n/en';
import { t, setLang, getLang } from '../../src/i18n/index';

test('en has all ru keys', () => {
  for (const k of Object.keys(ru)) {
    expect(en).toHaveProperty([k]);
  }
});

test('ru has all en keys (no orphans)', () => {
  for (const k of Object.keys(en)) {
    expect(ru).toHaveProperty([k]);
  }
});

test('t resolves the active language and switches', () => {
  setLang('ru');
  expect(getLang()).toBe('ru');
  expect(t('common.reset')).toBe('Сбросить');
  setLang('en');
  expect(t('common.reset')).toBe('Reset');
  setLang('ru'); // restore default for other tests
});

test('t supports parameterised / plural entries', () => {
  setLang('ru');
  expect(t('list.placesWord', { n: 1 })).toBe('место');
  expect(t('list.placesWord', { n: 3 })).toBe('места');
  expect(t('list.placesWord', { n: 5 })).toBe('мест');
  setLang('en');
  expect(t('list.placesWord', { n: 1 })).toBe('place');
  expect(t('list.placesWord', { n: 5 })).toBe('places');
  setLang('ru');
});
