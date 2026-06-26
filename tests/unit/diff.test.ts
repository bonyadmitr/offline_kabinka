import { diffLocations } from '../../src/data/diff';

const L = (id: number, t = 'a') => ({ id, title: t } as any);

test('added/removed/changed', () => {
  const d = diffLocations([L(1), L(2, 'x')], [L(2, 'y'), L(3)]);
  expect(d.added).toEqual([3]);
  expect(d.removed).toEqual([1]);
  expect(d.changed).toEqual([2]);
});

test('no changes', () => {
  const d = diffLocations([L(1)], [L(1)]);
  expect(d.added.length + d.removed.length + d.changed.length).toBe(0);
});
