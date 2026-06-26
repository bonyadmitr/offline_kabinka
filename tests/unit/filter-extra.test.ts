import { applyFilters, defaultFilter } from '../../src/data/filter';
import type { Location } from '../../src/core/types';

// Minimal location factory
function loc(overrides: Partial<Location> = {}): Location {
  return {
    id: 1,
    title: 'Test',
    address: 'ул. Тестовая',
    latitude: 53.9,
    longitude: 27.5,
    layout_type: 'block',
    price_type: 'free',
    is_accessible: true,
    is_verified: true,
    tags: [{ id: 1, slug: 'hand-dryer', name: 'Сушилка' }],
    working_hours: [],
    photos: [],
    comments: [],
    rating_overall: 4.5,
    ...overrides,
  };
}

// ─── Multi-condition: price + accessible + tag together ───────────────────────

test('multi-filter: paid + accessible + tag all match → included', () => {
  const result = applyFilters(
    [loc({ price_type: 'paid', is_accessible: true })],
    {
      ...defaultFilter(),
      priceTypes: new Set(['paid']),
      accessibleOnly: true,
      tagSlugs: new Set(['hand-dryer']),
    },
  );
  expect(result.length).toBe(1);
});

test('multi-filter: price matches but tag misses → excluded', () => {
  const result = applyFilters(
    [loc({ price_type: 'paid', is_accessible: true })],
    {
      ...defaultFilter(),
      priceTypes: new Set(['paid']),
      accessibleOnly: true,
      tagSlugs: new Set(['hot-water']), // not present on this loc
    },
  );
  expect(result.length).toBe(0);
});

test('multi-filter: all match but accessibleOnly blocks → excluded', () => {
  const result = applyFilters(
    [loc({ price_type: 'paid', is_accessible: false })],
    {
      ...defaultFilter(),
      priceTypes: new Set(['paid']),
      accessibleOnly: true,
      tagSlugs: new Set(['hand-dryer']),
    },
  );
  expect(result.length).toBe(0);
});

// ─── openNow with fixed "now" ─────────────────────────────────────────────────
// applyFilters calls isOpenNow(loc.working_hours) without an explicit "now",
// so we use a location that is either always-open or always-closed to get
// deterministic outcomes without mocking the clock.

test('openNow: 24h location (00:00–00:00) is always open', () => {
  const always = loc({
    working_hours: [{ day: 1, open: '00:00', close: '00:00', is_closed: false },
                    { day: 2, open: '00:00', close: '00:00', is_closed: false },
                    { day: 3, open: '00:00', close: '00:00', is_closed: false },
                    { day: 4, open: '00:00', close: '00:00', is_closed: false },
                    { day: 5, open: '00:00', close: '00:00', is_closed: false },
                    { day: 6, open: '00:00', close: '00:00', is_closed: false },
                    { day: 7, open: '00:00', close: '00:00', is_closed: false }],
  });
  const result = applyFilters([always], { ...defaultFilter(), openNow: true });
  expect(result.length).toBe(1);
});

test('openNow: is_closed=true every day → always filtered out', () => {
  const closed = loc({
    working_hours: [{ day: 1, open: null, close: null, is_closed: true },
                    { day: 2, open: null, close: null, is_closed: true },
                    { day: 3, open: null, close: null, is_closed: true },
                    { day: 4, open: null, close: null, is_closed: true },
                    { day: 5, open: null, close: null, is_closed: true },
                    { day: 6, open: null, close: null, is_closed: true },
                    { day: 7, open: null, close: null, is_closed: true }],
  });
  const result = applyFilters([closed], { ...defaultFilter(), openNow: true });
  expect(result.length).toBe(0);
});

test('openNow: false → does not filter by hours at all', () => {
  const closed = loc({
    working_hours: [{ day: 1, open: null, close: null, is_closed: true }],
  });
  const result = applyFilters([closed], { ...defaultFilter(), openNow: false });
  expect(result.length).toBe(1);
});
