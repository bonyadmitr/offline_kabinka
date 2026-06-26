import { applyFilters, defaultFilter } from '../../src/data/filter';

const L = (o: any) => ({
  id: 1,
  title: 'БЦ Stella',
  address: 'ул. Толстого',
  latitude: 53.9,
  longitude: 27.5,
  layout_type: 'block',
  price_type: 'free',
  is_accessible: true,
  is_verified: true,
  tags: [{ slug: 'hand-dryer', name: 'Сушилка', id: 1 }],
  working_hours: [],
  photos: [],
  comments: [],
  rating_overall: 4.5,
  ...o,
});

test('query matches title ci', () =>
  expect(applyFilters([L({})], { ...defaultFilter(), query: 'stella' }).length).toBe(1));

test('priceType filters out', () =>
  expect(applyFilters([L({ price_type: 'paid' })], { ...defaultFilter(), priceTypes: new Set(['free']) }).length).toBe(0));

test('minRating', () =>
  expect(applyFilters([L({ rating_overall: 3 })], { ...defaultFilter(), minRating: 4 }).length).toBe(0));

test('tag filter', () =>
  expect(applyFilters([L({})], { ...defaultFilter(), tagSlugs: new Set(['hand-dryer']) }).length).toBe(1));

test('accessibleOnly', () =>
  expect(applyFilters([L({ is_accessible: false })], { ...defaultFilter(), accessibleOnly: true }).length).toBe(0));
