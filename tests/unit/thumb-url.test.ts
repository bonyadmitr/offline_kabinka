import { afterEach, vi } from 'vitest';
import { thumbBasename, thumbUrl } from '../../src/ui/thumb-url';
import { setPack } from '../../src/offline/thumbs';

afterEach(() => {
  vi.unstubAllEnvs();
  // Reset the in-memory pack between tests.
  setPack(new Blob([]), {});
});

test('thumbBasename strips directory prefixes', () => {
  expect(thumbBasename('thumbs/38_photo_0.jpg')).toBe('38_photo_0.jpg');
  expect(thumbBasename('38_photo_0.jpg')).toBe('38_photo_0.jpg');
});

test('thumbUrl prefers the packed bundle when loaded', () => {
  // Pack a tiny bundle (as a Blob, like IndexedDB stores it) whose index has our
  // basename. getThumbObjectUrl slices it lazily — no whole-buffer read.
  const data = new Uint8Array([1, 2, 3, 4]);
  setPack(new Blob([data]), { '38_photo_0.jpg': [0, 4] });

  const url = thumbUrl('thumbs/38_photo_0.jpg');
  // Object URLs look like blob:... in real browsers; jsdom returns blob:nodedata.
  expect(url.startsWith('blob:')).toBe(true);
});

test('thumbUrl falls back to dev static path when DEV and no pack', () => {
  vi.stubEnv('DEV', true);
  setPack(new Blob([]), {}); // empty pack → miss
  const url = thumbUrl('thumbs/38_photo_0.jpg');
  expect(url.endsWith('thumbs/38_photo_0.jpg')).toBe(true);
});

test('thumbUrl falls back to online full-size when not DEV and no pack', () => {
  vi.stubEnv('DEV', false);
  setPack(new Blob([]), {}); // empty pack → miss
  const url = thumbUrl('thumbs/38_photo_2.jpg');
  expect(url).toBe('https://kabinka.by/storage/locations/38/photo_2.jpg');
});

test('thumbUrl online fallback derives id + photo index from basename', () => {
  vi.stubEnv('DEV', false);
  setPack(new Blob([]), {});
  expect(thumbUrl('thumbs/100_photo_0.jpg')).toBe(
    'https://kabinka.by/storage/locations/100/photo_0.jpg',
  );
});
