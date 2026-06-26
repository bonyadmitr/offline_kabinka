import { afterEach, beforeEach, vi } from 'vitest';
import { checkMapUpdate, updateMap } from '../../src/update/map-update';
import { putBlob, deleteBlob, blobSize } from '../../src/offline/blobstore';
import { getKV, setKV } from '../../src/data/idb';
import { AppError } from '../../src/core/errors';

// ── Helpers ──────────────────────────────────────────────────────────────────

function versionJson(version: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({ version, bytes: 10, sha256: 'x' }),
  } as unknown as Response;
}

function notFound(): Response {
  return { ok: false, status: 404, headers: new Headers() } as unknown as Response;
}

/** A non-streamed Response whose blob() yields the given bytes (downloadToBlob
 *  falls back to res.blob() when there is no readable body). */
function blobResponse(bytes: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    blob: () => Promise.resolve(new Blob([bytes] as BlobPart[])),
  } as unknown as Response;
}

/** Bytes that start with the ASCII "PMTiles" magic. */
function pmtilesBytes(): Uint8Array {
  const magic = new TextEncoder().encode('PMTiles');
  const out = new Uint8Array(magic.length + 8);
  out.set(magic, 0);
  return out;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  await deleteBlob('minsk');
  await setKV('mapVersion', undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── checkMapUpdate ────────────────────────────────────────────────────────────

test('checkMapUpdate: stored === served → not available', async () => {
  await setKV('mapVersion', '202601010000');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(versionJson('202601010000')));
  await expect(checkMapUpdate()).resolves.toEqual({ updateAvailable: false });
});

test('checkMapUpdate: newer served version → available', async () => {
  await setKV('mapVersion', '202601010000');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(versionJson('202602020000')));
  await expect(checkMapUpdate()).resolves.toEqual({
    updateAvailable: true,
    version: '202602020000',
  });
});

test('checkMapUpdate: manifest 404 → not available (soft)', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFound()));
  await expect(checkMapUpdate()).resolves.toEqual({ updateAvailable: false });
});

test('checkMapUpdate: no stored version but map blob present → adopt + not available', async () => {
  await putBlob('minsk', new Blob([pmtilesBytes()] as BlobPart[]));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(versionJson('202603030000')));

  await expect(checkMapUpdate()).resolves.toEqual({ updateAvailable: false });
  // The served version is adopted as current so the next check is stable.
  expect(await getKV('mapVersion')).toBe('202603030000');
});

// ── updateMap ─────────────────────────────────────────────────────────────────

test('updateMap: stores the blob and records the version', async () => {
  const fetchMock = vi.fn((url: string) => {
    if (url.includes('map-version.json')) return Promise.resolve(versionJson('202604040000'));
    if (url.includes('minsk.pmtiles')) return Promise.resolve(blobResponse(pmtilesBytes()));
    throw new Error('unexpected url ' + url);
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

  await updateMap(() => {});

  expect(await blobSize('minsk')).toBeGreaterThan(0);
  expect(await getKV('mapVersion')).toBe('202604040000');
});

test('updateMap: non-PMTiles payload → AppError(MAP-02)', async () => {
  const fetchMock = vi.fn((url: string) => {
    if (url.includes('map-version.json')) return Promise.resolve(versionJson('x'));
    // An HTML captive-portal page instead of an archive.
    if (url.includes('minsk.pmtiles')) {
      return Promise.resolve(blobResponse(new TextEncoder().encode('<!DOCTYPE html>')));
    }
    throw new Error('unexpected url ' + url);
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

  await expect(updateMap(() => {})).rejects.toMatchObject({ code: 'MAP-02' });
  // The bad blob must not have overwritten the stored map.
  expect(await blobSize('minsk')).toBe(0);
});

test('updateMap: offline → AppError(NET-01)', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  await expect(updateMap(() => {})).rejects.toBeInstanceOf(AppError);
  await expect(updateMap(() => {})).rejects.toMatchObject({ code: 'NET-01' });
});
