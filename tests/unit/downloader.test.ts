import { afterEach, beforeEach, vi } from 'vitest';
import {
  downloadToBlob,
  ensureOfflinePackage,
  loadThumbsPackFromIDB,
} from '../../src/offline/downloader';
import { putBlob, deleteBlob, blobSize } from '../../src/offline/blobstore';
import { setKV } from '../../src/data/idb';
import { AppError } from '../../src/core/errors';

// ── Helpers ────────────────────────────────────────────────────────────────

/** A streamed Response that yields `bytes` across `chunks` equal reads. */
function streamResponse(bytes: number, withLength = true, chunks = 4): Response {
  const headers = new Headers();
  if (withLength) headers.set('Content-Length', String(bytes));
  const per = Math.ceil(bytes / chunks);
  let emitted = 0;
  return {
    ok: true,
    status: 200,
    headers,
    body: {
      getReader() {
        return {
          read() {
            if (emitted >= bytes) return Promise.resolve({ done: true, value: undefined });
            const size = Math.min(per, bytes - emitted);
            emitted += size;
            return Promise.resolve({ done: false, value: new Uint8Array(size) });
          },
        };
      },
    },
    blob: () => Promise.resolve(new Blob([new Uint8Array(bytes)])),
  } as unknown as Response;
}

/** A JSON Response (for thumbs-index.json). */
function jsonResponse(obj: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(obj),
  } as unknown as Response;
}

beforeEach(async () => {
  await deleteBlob('minsk');
  await deleteBlob('thumbs');
  await setKV('thumbsIndex', undefined);
  vi.restoreAllMocks();
  // jsdom marks navigator.onLine true by default; ensure it.
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── downloadToBlob ───────────────────────────────────────────────────────────

test('downloadToBlob: offline → NET-01', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  await expect(downloadToBlob('/x', () => {})).rejects.toMatchObject({ code: 'NET-01' });
});

test('downloadToBlob: !ok → the supplied code', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: false, status: 404, headers: new Headers() }),
  );
  await expect(downloadToBlob('/x', () => {}, 'MAP-01')).rejects.toMatchObject({ code: 'MAP-01' });
  await expect(downloadToBlob('/y', () => {}, 'API-01')).rejects.toMatchObject({ code: 'API-01' });
});

test('downloadToBlob: streams progress up to total, returns a Blob', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(1000)));
  const seen: Array<[number, number]> = [];
  const blob = await downloadToBlob('/m', (loaded, total) => seen.push([loaded, total]));
  expect(blob.size).toBe(1000);
  expect(seen.at(-1)).toEqual([1000, 1000]);
});

// ── ensureOfflinePackage ─────────────────────────────────────────────────────

test('ensureOfflinePackage: weighted overall progress is monotonic 0→1', async () => {
  // Map is the larger asset; thumbs smaller. Content-Length drives the weights.
  const fetchMock = vi.fn((url: string) => {
    if (url.includes('minsk.pmtiles')) return Promise.resolve(streamResponse(9000));
    if (url.includes('thumbs.bin')) return Promise.resolve(streamResponse(1000));
    if (url.includes('thumbs-index.json')) return Promise.resolve(jsonResponse({ 'a.jpg': [0, 10] }));
    throw new Error('unexpected url ' + url);
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

  const progress: number[] = [];
  await ensureOfflinePackage((p) => progress.push(p));

  // Monotonic non-decreasing and ends at 1.
  for (let i = 1; i < progress.length; i++) {
    expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
  }
  expect(progress.at(-1)).toBeCloseTo(1, 5);

  // Both binaries landed in IndexedDB.
  expect(await blobSize('minsk')).toBe(9000);
  expect(await blobSize('thumbs')).toBe(1000);

  // Once both Content-Lengths are known (map done, thumbs streaming), the
  // 9000:1000 weighting means the bar crosses ~0.9 before completing.
  const high = progress.filter((p) => p < 0.999).reduce((m, p) => Math.max(m, p), 0);
  expect(high).toBeGreaterThanOrEqual(0.85);
});

test('ensureOfflinePackage: skips assets already present', async () => {
  await putBlob('minsk', new Blob([new Uint8Array(5)]));
  await putBlob('thumbs', new Blob([new Uint8Array(5)]));
  await setKV('thumbsIndex', { 'a.jpg': [0, 5] });

  const fetchMock = vi.fn((url: string) => {
    // Only the index hydrate path may fetch (it won't here — index is in KV).
    if (url.includes('thumbs-index.json')) return Promise.resolve(jsonResponse({}));
    throw new Error('should not download ' + url);
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

  const progress: number[] = [];
  await ensureOfflinePackage((p) => progress.push(p));

  // No pmtiles/thumbs.bin fetches happened.
  const urls = fetchMock.mock.calls.map((c) => c[0] as string);
  expect(urls.some((u) => u.includes('minsk.pmtiles'))).toBe(false);
  expect(urls.some((u) => u.includes('thumbs.bin'))).toBe(false);
  // Finishes at 1 (nothing to do).
  expect(progress.at(-1)).toBe(1);
});

test('loadThumbsPackFromIDB: no-op when no thumbs blob', async () => {
  await expect(loadThumbsPackFromIDB()).resolves.toBeUndefined();
});

test('AppError code is preserved through downloadToBlob', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  const err = await downloadToBlob('/x', () => {}).catch((e) => e);
  expect(err).toBeInstanceOf(AppError);
});
