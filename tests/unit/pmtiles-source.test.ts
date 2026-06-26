import { IDBBlobSource } from '../../src/offline/pmtiles-source';

test('IDBBlobSource.getBytes slices the backing Blob by range', async () => {
  const blob = new Blob([new Uint8Array([10, 11, 12, 13, 14, 15])]);
  const src = new IDBBlobSource(blob, 'k');

  const res = await src.getBytes(2, 3);
  expect(res.data.byteLength).toBe(3);
  expect(Array.from(new Uint8Array(res.data))).toEqual([12, 13, 14]);
});

test('IDBBlobSource.getKey returns the constructor key', () => {
  const src = new IDBBlobSource(new Blob([new Uint8Array([0])]), 'k');
  expect(src.getKey()).toBe('k');
});
