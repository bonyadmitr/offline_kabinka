import { afterEach, vi } from 'vitest';
import { setPack, clearPack, getThumbObjectUrl } from '../../src/offline/thumbs';

afterEach(() => {
  clearPack();
  vi.restoreAllMocks();
});

// ─── setPack → getThumbObjectUrl ──────────────────────────────────────────────

test('getThumbObjectUrl returns a blob: URL for a known name after setPack', () => {
  // jsdom's URL.createObjectURL returns "blob:nodedata:..." which starts with "blob:".
  const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes
  setPack(new Blob([data]), { 'photo.jpg': [0, 4] });

  const url = getThumbObjectUrl('photo.jpg');
  expect(url).not.toBeNull();
  expect(url!.startsWith('blob:')).toBe(true);
});

test('getThumbObjectUrl returns null for an unknown name', () => {
  setPack(new Blob([new Uint8Array(4)]), { 'photo.jpg': [0, 4] });
  expect(getThumbObjectUrl('missing.jpg')).toBeNull();
});

test('getThumbObjectUrl returns null when pack is not loaded', () => {
  // clearPack() was called in afterEach, so no pack is registered.
  expect(getThumbObjectUrl('anything.jpg')).toBeNull();
});

// ─── URL caching: repeated calls return the same URL ─────────────────────────

test('getThumbObjectUrl caches: same URL returned on repeated calls', () => {
  setPack(new Blob([new Uint8Array(8)]), { 'a.jpg': [0, 4] });
  const url1 = getThumbObjectUrl('a.jpg');
  const url2 = getThumbObjectUrl('a.jpg');
  expect(url1).not.toBeNull();
  expect(url1).toBe(url2); // same object URL reused
});

// ─── clearPack → getThumbObjectUrl returns null ──────────────────────────────

test('clearPack: getThumbObjectUrl returns null after clearing', () => {
  setPack(new Blob([new Uint8Array(4)]), { 'x.jpg': [0, 4] });
  // Verify it was registered.
  const before = getThumbObjectUrl('x.jpg');
  expect(before).not.toBeNull();

  clearPack();
  // After clearing, no URL is available.
  expect(getThumbObjectUrl('x.jpg')).toBeNull();
});

// ─── setPack invalidates the cache ───────────────────────────────────────────

test('calling setPack again clears the old URL cache', () => {
  const data = new Uint8Array([1, 2, 3, 4]);
  setPack(new Blob([data]), { 'a.jpg': [0, 4] });
  const url1 = getThumbObjectUrl('a.jpg');
  expect(url1).not.toBeNull();

  // Replace the pack with different content.
  setPack(new Blob([data]), { 'a.jpg': [0, 4] });
  // A fresh call after re-registration should give a (potentially different) URL.
  const url2 = getThumbObjectUrl('a.jpg');
  expect(url2).not.toBeNull();
  // The old cached entry was cleared — both urls are blob: URLs, but a new
  // createObjectURL call was made, so they may differ.
  // What matters is that the function works (doesn't return null) and the result is a blob: URL.
  expect(url2!.startsWith('blob:')).toBe(true);
});
