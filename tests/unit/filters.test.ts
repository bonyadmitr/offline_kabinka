import { openFilters, activeFilterCount, collectTags } from '../../src/ui/filters';
import { defaultFilter } from '../../src/data/filter';
import type { FilterState, Location } from '../../src/core/types';

const L = (o: Partial<Location>): Location =>
  ({
    id: 1,
    title: 'T',
    latitude: 53.9,
    longitude: 27.5,
    layout_type: 'block',
    price_type: 'free',
    is_accessible: false,
    is_verified: false,
    tags: [],
    photos: [],
    working_hours: [],
    comments: [],
    ...o,
  }) as Location;

afterEach(() => {
  document.querySelectorAll('.modal-overlay').forEach((n) => n.remove());
  document.body.className = '';
});

test('activeFilterCount sums every active condition', () => {
  expect(activeFilterCount(defaultFilter())).toBe(0);
  const f: FilterState = {
    ...defaultFilter(),
    openNow: true,
    accessibleOnly: true,
    minRating: 4,
    layoutTypes: new Set(['block', 'unisex']),
    priceTypes: new Set(['free']),
    tagSlugs: new Set(['x']),
  };
  // 1 + 1 + 1 + 2 + 1 + 1 = 7
  expect(activeFilterCount(f)).toBe(7);
});

test('collectTags dedupes by slug and sorts', () => {
  const tags = collectTags([
    L({ id: 1, tags: [{ id: 1, slug: 'b', name: 'Бета' }] }),
    L({ id: 2, tags: [{ id: 1, slug: 'b', name: 'Бета' }, { id: 2, slug: 'a', name: 'Альфа' }] }),
  ]);
  expect(tags.map((t) => t.slug)).toEqual(['a', 'b']);
});

test('opening renders controls and apply collects a fresh FilterState', () => {
  const locs = [L({ tags: [{ id: 1, slug: 'hot-water', name: 'Горячая вода', icon: '🔥' }] })];
  let applied: FilterState | null = null;
  openFilters({ ...defaultFilter(), query: 'keepme' }, (f) => (applied = f), { locations: locs });

  const overlay = document.querySelector('.modal-overlay');
  expect(overlay).toBeTruthy();

  // Toggle openNow, check a layout box, select a tag, pick rating 4.
  document.querySelector<HTMLInputElement>('[data-toggle="openNow"]')!.checked = true;
  document
    .querySelector<HTMLInputElement>('[data-toggle="openNow"]')!
    .dispatchEvent(new Event('change'));

  const blockBox = document.querySelector<HTMLInputElement>('[data-check="layout"][value="block"]')!;
  blockBox.checked = true;
  blockBox.dispatchEvent(new Event('change'));

  document.querySelector<HTMLButtonElement>('[data-tag="hot-water"]')!.click();
  document.querySelector<HTMLButtonElement>('[data-rating="4"]')!.click();

  // Apply (footer second button).
  const buttons = document.querySelectorAll<HTMLButtonElement>('.modal-footer .btn');
  buttons[1].click();

  expect(applied).not.toBeNull();
  const f = applied as unknown as FilterState;
  expect(f.openNow).toBe(true);
  expect(f.layoutTypes.has('block')).toBe(true);
  expect(f.tagSlugs.has('hot-water')).toBe(true);
  expect(f.minRating).toBe(4);
  expect(f.query).toBe('keepme'); // query preserved untouched
});

test('reset emits defaults but preserves query', () => {
  let applied: FilterState | null = null;
  openFilters(
    { ...defaultFilter(), openNow: true, minRating: 5, query: 'stay' },
    (f) => (applied = f),
    { locations: [] },
  );
  // Reset = first footer button.
  document.querySelectorAll<HTMLButtonElement>('.modal-footer .btn')[0].click();
  const f = applied as unknown as FilterState;
  expect(f.openNow).toBe(false);
  expect(f.minRating).toBe(0);
  expect(f.query).toBe('stay');
});

test('Escape closes the modal', () => {
  openFilters(defaultFilter(), () => {}, { locations: [] });
  expect(document.querySelector('.modal-overlay')).toBeTruthy();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  // close() schedules removal via timeout fallback; flush microtask + timers below.
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      expect(document.querySelector('.modal-overlay')).toBeNull();
      resolve();
    }, 300);
  });
});
