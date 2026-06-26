import { buildPickList } from '../../src/map/pick-list';

test('maps feature properties to picker items, preserving order', () => {
  const items = buildPickList([
    { properties: { id: 24, title: 'ТРЦ Palazzo (-1 этаж)', price_type: 'paid' } },
    { properties: { id: 25, title: 'ТРЦ Palazzo (1 этаж)', price_type: 'free' } },
    { properties: { id: 26, title: 'ТРЦ Palazzo (2 этаж)', price_type: 'conditional_free' } },
  ]);
  expect(items).toEqual([
    { id: 24, title: 'ТРЦ Palazzo (-1 этаж)', priceType: 'paid' },
    { id: 25, title: 'ТРЦ Palazzo (1 этаж)', priceType: 'free' },
    { id: 26, title: 'ТРЦ Palazzo (2 этаж)', priceType: 'conditional_free' },
  ]);
});

test('de-dupes by id (a feature can surface twice across queries)', () => {
  const items = buildPickList([
    { properties: { id: 1, title: 'A', price_type: 'free' } },
    { properties: { id: 1, title: 'A', price_type: 'free' } },
    { properties: { id: 2, title: 'B', price_type: 'paid' } },
  ]);
  expect(items.map((i) => i.id)).toEqual([1, 2]);
});

test('coerces string ids and drops features without a finite id', () => {
  const items = buildPickList([
    { properties: { id: '7', title: 'Seven', price_type: 'free' } },
    { properties: { id: undefined, title: 'No id', price_type: 'free' } },
    { properties: {} },
    { properties: null },
  ]);
  expect(items).toEqual([{ id: 7, title: 'Seven', priceType: 'free' }]);
});

test('defaults missing title to empty string and missing price_type to free', () => {
  const items = buildPickList([{ properties: { id: 9 } }]);
  expect(items).toEqual([{ id: 9, title: '', priceType: 'free' }]);
});

test('single feature yields a one-item list (caller opens the card directly)', () => {
  const items = buildPickList([{ properties: { id: 42, title: 'Solo', price_type: 'paid' } }]);
  expect(items).toHaveLength(1);
});
