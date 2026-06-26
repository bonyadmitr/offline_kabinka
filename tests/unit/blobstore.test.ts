import { putBlob, getBlob, blobSize, deleteBlob } from '../../src/offline/blobstore';

test('putBlob → getBlob returns a Blob of the same size', async () => {
  const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const blob = new Blob([data], { type: 'application/octet-stream' });
  await putBlob('map-a', blob);

  const got = await getBlob('map-a');
  expect(got).not.toBeNull();
  expect(got!.size).toBe(blob.size);
});

test('blobSize reports the stored size, 0 when absent', async () => {
  await putBlob('sized', new Blob([new Uint8Array(42)]));
  expect(await blobSize('sized')).toBe(42);
  expect(await blobSize('does-not-exist')).toBe(0);
});

test('deleteBlob removes the entry → getBlob is null', async () => {
  await putBlob('temp', new Blob([new Uint8Array(3)]));
  expect(await blobSize('temp')).toBe(3);

  await deleteBlob('temp');
  expect(await getBlob('temp')).toBeNull();
  expect(await blobSize('temp')).toBe(0);
});
