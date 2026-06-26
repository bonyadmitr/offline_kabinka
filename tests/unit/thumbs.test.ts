import { sliceFromIndex } from '../../src/offline/thumbs';

test('slice by index', () => {
  const buf = new Uint8Array([0, 1, 2, 3, 4]).buffer;
  const b = sliceFromIndex(buf, { 'a.jpg': [1, 3] }, 'a.jpg');
  expect(b).not.toBeNull();
  expect(b!.size).toBe(3);
});

test('missing name → null', () => {
  expect(sliceFromIndex(new ArrayBuffer(4), {}, 'x')).toBeNull();
});
