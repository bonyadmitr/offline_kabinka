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

test('changes apply live — each control fires onApply with a fresh FilterState', () => {
  const locs = [L({ tags: [{ id: 1, slug: 'hot-water', name: 'Горячая вода', icon: '🔥' }] })];
  const applied: FilterState[] = [];
  openFilters({ ...defaultFilter(), query: 'keepme' }, (f) => applied.push(f), { locations: locs });

  const overlay = document.querySelector('.modal-overlay');
  expect(overlay).toBeTruthy();

  // There is no "Apply" button — only "Reset" lives in the footer.
  const footerBtns = document.querySelectorAll<HTMLButtonElement>('.modal-footer .btn');
  expect(footerBtns).toHaveLength(1);
  expect(footerBtns[0].textContent).toBe('Сбросить');

  // Toggle openNow → fires immediately.
  document.querySelector<HTMLInputElement>('[data-toggle="openNow"]')!.checked = true;
  document
    .querySelector<HTMLInputElement>('[data-toggle="openNow"]')!
    .dispatchEvent(new Event('change'));
  expect(applied.at(-1)!.openNow).toBe(true);

  // Check a layout box → fires immediately.
  const blockBox = document.querySelector<HTMLInputElement>('[data-check="layout"][value="block"]')!;
  blockBox.checked = true;
  blockBox.dispatchEvent(new Event('change'));
  expect(applied.at(-1)!.layoutTypes.has('block')).toBe(true);

  // Select a tag → fires immediately.
  document.querySelector<HTMLButtonElement>('[data-tag="hot-water"]')!.click();
  expect(applied.at(-1)!.tagSlugs.has('hot-water')).toBe(true);

  // Pick rating 4 → fires immediately.
  document.querySelector<HTMLButtonElement>('[data-rating="4"]')!.click();

  // Four live emissions, each a fresh object; the latest carries every change and
  // preserves the untouched query.
  expect(applied).toHaveLength(4);
  const f = applied.at(-1)!;
  expect(f.openNow).toBe(true);
  expect(f.layoutTypes.has('block')).toBe(true);
  expect(f.tagSlugs.has('hot-water')).toBe(true);
  expect(f.minRating).toBe(4);
  expect(f.query).toBe('keepme'); // query preserved untouched

  // The modal stays open after a live change (no auto-close on apply).
  expect(document.querySelector('.modal-overlay')).toBeTruthy();
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
