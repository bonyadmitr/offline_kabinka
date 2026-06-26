/**
 * Unit tests for src/ui/lazy-thumb.ts
 *
 * IntersectionObserver is not implemented in jsdom, so we provide a mock that
 * gives fine-grained control over which entries fire and when.
 */

import { vi, afterEach, beforeEach, expect, test } from 'vitest';
import { lazyThumb, resetLazyObserver } from '../../src/ui/lazy-thumb';

// ─── Mock IntersectionObserver ───────────────────────────────────────────────

type IOCallback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;

let observerCallback: IOCallback | null = null;
const observed = new Set<Element>();

// Keep a typed mock reference separate from the global stub so .mock is accessible.
const mockIO = vi.fn(function (
  this: IntersectionObserver,
  cb: IOCallback,
  _opts?: IntersectionObserverInit,
): void {
  observerCallback = cb;
  this.observe = vi.fn((el: Element) => observed.add(el)) as IntersectionObserver['observe'];
  this.unobserve = vi.fn((el: Element) => observed.delete(el)) as IntersectionObserver['unobserve'];
  this.disconnect = vi.fn(() => {
    observed.clear();
    observerCallback = null;
  }) as IntersectionObserver['disconnect'];
  this.takeRecords = vi.fn(() => []) as IntersectionObserver['takeRecords'];
  (this as unknown as { root: null }).root = null;
  (this as unknown as { rootMargin: string }).rootMargin = _opts?.rootMargin ?? '';
  (this as unknown as { thresholds: number[] }).thresholds = [];
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fireIntersecting(imgs: HTMLImageElement[]): void {
  if (!observerCallback) throw new Error('No observer callback registered');
  const entries = imgs.map(
    (img) =>
      ({
        isIntersecting: true,
        target: img,
      }) as unknown as IntersectionObserverEntry,
  );
  observerCallback(entries, {} as IntersectionObserver);
}

function fireNonIntersecting(imgs: HTMLImageElement[]): void {
  if (!observerCallback) throw new Error('No observer callback registered');
  const entries = imgs.map(
    (img) =>
      ({
        isIntersecting: false,
        target: img,
      }) as unknown as IntersectionObserverEntry,
  );
  observerCallback(entries, {} as IntersectionObserver);
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  mockIO.mockClear();
  vi.stubGlobal('IntersectionObserver', mockIO);
  resetLazyObserver(); // ensure a fresh singleton each test
  observed.clear();
  observerCallback = null;
});

afterEach(() => {
  resetLazyObserver();
  vi.unstubAllGlobals();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

test('lazyThumb: image src is empty until intersection fires', () => {
  const img = document.createElement('img');
  lazyThumb(img, 'thumbs/1_photo_0.jpg');

  // Before intersection: src must not be set.
  expect(img.src).toBe('');
  expect(img.dataset['thumb']).toBe('thumbs/1_photo_0.jpg');
});

test('lazyThumb: src is set when the element intersects', () => {
  const img = document.createElement('img');
  lazyThumb(img, 'thumbs/1_photo_0.jpg');

  fireIntersecting([img]);

  // After intersection src should be resolved via thumbUrl.
  // In the test env (DEV=false, no pack) it falls back to the online URL.
  expect(img.src).not.toBe('');
  expect(img.dataset['thumb']).toBeUndefined();
});

test('lazyThumb: non-intersecting entry does not set src', () => {
  const img = document.createElement('img');
  lazyThumb(img, 'thumbs/2_photo_0.jpg');

  fireNonIntersecting([img]);

  expect(img.src).toBe('');
  expect(img.dataset['thumb']).toBe('thumbs/2_photo_0.jpg');
});

test('lazyThumb: element is unobserved after src is set', () => {
  const img = document.createElement('img');
  lazyThumb(img, 'thumbs/3_photo_0.jpg');

  expect(observed.has(img)).toBe(true);
  fireIntersecting([img]);
  expect(observed.has(img)).toBe(false);
});

test('lazyThumb: multiple images share one observer', () => {
  const imgs = [1, 2, 3].map((n) => {
    const img = document.createElement('img');
    lazyThumb(img, `thumbs/${n}_photo_0.jpg`);
    return img;
  });

  // All three should be observed by the same singleton.
  expect(mockIO).toHaveBeenCalledTimes(1);
  expect(observed.size).toBe(3);

  fireIntersecting([imgs[0]!]);
  expect(imgs[0]!.src).not.toBe('');
  // Other images are still pending.
  expect(imgs[1]!.src).toBe('');
  expect(imgs[2]!.src).toBe('');
});

test('lazyThumb: root margin is 200px', () => {
  const img = document.createElement('img');
  lazyThumb(img, 'thumbs/4_photo_0.jpg');

  // Second argument to the constructor is the options object.
  const initOptions = mockIO.mock.calls[0]?.[1] as IntersectionObserverInit | undefined;
  expect(initOptions?.rootMargin).toBe('200px');
});
