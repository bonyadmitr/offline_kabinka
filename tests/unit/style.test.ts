import { buildStyle } from '../../src/map/style';

test('style has sources and layers', () => {
  const s = buildStyle({ lang: 'ru', theme: 'light', pmtilesUrl: 'x.pmtiles' });
  expect((s.layers as unknown[]).length).toBeGreaterThan(3);
  expect((s.sources as Record<string, unknown>).openmaptiles).toBeTruthy();
});

test('ru label uses name:ru with fallback', () => {
  const s = buildStyle({ lang: 'ru', theme: 'light', pmtilesUrl: 'x' });
  const lab = (s.layers as unknown[]).find((l) => (l as { type: string }).type === 'symbol');
  expect(JSON.stringify((lab as { layout: { 'text-field': unknown } }).layout['text-field'])).toContain('name:ru');
});

test('dark theme differs', () => {
  const a = JSON.stringify(buildStyle({ lang: 'ru', theme: 'light', pmtilesUrl: 'x' }));
  const b = JSON.stringify(buildStyle({ lang: 'ru', theme: 'dark', pmtilesUrl: 'x' }));
  expect(a).not.toBe(b);
});
