import { beforeEach } from 'vitest';
import {
  estimateUsage,
  deletePackage,
  deleteMapPackage,
  deleteThumbsPackage,
  mapDownloaded,
  thumbsDownloaded,
  formatBytes,
} from '../../src/offline/storage';
import { putBlob, blobSize, deleteBlob } from '../../src/offline/blobstore';
import { getKV, setKV } from '../../src/data/idb';

// jsdom has no Cache Storage, so the photos/shell/data buckets stay 0 here and
// the total reduces to the exact map + thumbs blob sizes — which is precisely
// the point of the rewrite (no padded navigator.storage.estimate().usage).

beforeEach(async () => {
  await deleteBlob('minsk');
  await deleteBlob('thumbs');
});

test('estimateUsage totals the exact blob sizes, not a padded estimate', async () => {
  await putBlob('minsk', new Blob([new Uint8Array(1000)]));
  await putBlob('thumbs', new Blob([new Uint8Array(250)]));

  const u = await estimateUsage();
  expect(u.breakdown.map).toBe(1000);
  expect(u.breakdown.thumbs).toBe(250);
  // No Cache Storage in jsdom → photos/shell/data are 0; total = map + thumbs.
  expect(u.breakdown.photos).toBe(0);
  expect(u.total).toBe(1250);
  expect(u.photosEstimated).toBe(false);
});

test('estimateUsage reports zeros when nothing is stored', async () => {
  const u = await estimateUsage();
  expect(u.total).toBe(0);
  expect(u.breakdown.map).toBe(0);
  expect(u.breakdown.thumbs).toBe(0);
});

test('deletePackage drops both blobs and clears the version markers', async () => {
  await putBlob('minsk', new Blob([new Uint8Array(8)]));
  await putBlob('thumbs', new Blob([new Uint8Array(8)]));
  await setKV('mapVersion', '202606261649');
  await setKV('thumbsIndex', { 'a.jpg': [0, 8] });

  await deletePackage();

  expect(await blobSize('minsk')).toBe(0);
  expect(await blobSize('thumbs')).toBe(0);
  expect(await getKV('mapVersion')).toBeNull();
  expect(await getKV('thumbsIndex')).toBeNull();
});

test('deleteMapPackage removes only the map blob + version, leaving thumbs', async () => {
  await putBlob('minsk', new Blob([new Uint8Array(8)]));
  await putBlob('thumbs', new Blob([new Uint8Array(8)]));
  await setKV('mapVersion', '202606261649');
  await setKV('thumbsIndex', { 'a.jpg': [0, 8] });

  await deleteMapPackage();

  // Map gone + version cleared…
  expect(await blobSize('minsk')).toBe(0);
  expect(await getKV('mapVersion')).toBeNull();
  // …but the thumbnail package is untouched.
  expect(await blobSize('thumbs')).toBe(8);
  expect(await getKV('thumbsIndex')).toEqual({ 'a.jpg': [0, 8] });
});

test('deleteThumbsPackage removes only the thumbs blob + index, leaving the map', async () => {
  await putBlob('minsk', new Blob([new Uint8Array(8)]));
  await putBlob('thumbs', new Blob([new Uint8Array(8)]));
  await setKV('mapVersion', '202606261649');
  await setKV('thumbsIndex', { 'a.jpg': [0, 8] });

  await deleteThumbsPackage();

  // Thumbs gone + index cleared…
  expect(await blobSize('thumbs')).toBe(0);
  expect(await getKV('thumbsIndex')).toBeNull();
  // …but the map package is untouched.
  expect(await blobSize('minsk')).toBe(8);
  expect(await getKV('mapVersion')).toBe('202606261649');
});

test('mapDownloaded / thumbsDownloaded reflect blob presence independently', async () => {
  expect(await mapDownloaded()).toBe(false);
  expect(await thumbsDownloaded()).toBe(false);

  await putBlob('minsk', new Blob([new Uint8Array(4)]));
  expect(await mapDownloaded()).toBe(true);
  expect(await thumbsDownloaded()).toBe(false);

  await putBlob('thumbs', new Blob([new Uint8Array(4)]));
  expect(await thumbsDownloaded()).toBe(true);
});

test('formatBytes renders MB/KB/bytes from the localized units', () => {
  expect(formatBytes(0)).toContain('0');
  expect(formatBytes(2 * 1024 * 1024)).toMatch(/2\.0/);
  expect(formatBytes(3 * 1024)).toMatch(/3/);
});
