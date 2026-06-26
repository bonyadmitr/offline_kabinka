import { diffLocations } from '../../src/data/diff';
import type { Location } from '../../src/core/types';

// Minimal location factory — only the fields that matter for diffLocations.
function loc(id: number, overrides: Partial<Location> = {}): Location {
  return {
    id,
    title: 'Place',
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
    ...overrides,
  };
}

// A change limited to distance_meters (a VOLATILE_FIELDS member) must NOT
// appear in `changed` — it's a computed field that varies across devices.
test('volatile-only change (distance_meters) is not reported as changed', () => {
  const old = loc(1, { distance_meters: undefined } as Partial<Location>);
  const updated = loc(1, { distance_meters: 250 } as Partial<Location>);
  const diff = diffLocations([old], [updated]);
  expect(diff.changed).toEqual([]);
  expect(diff.added).toEqual([]);
  expect(diff.removed).toEqual([]);
});

// A stable-field change alongside a volatile change still surfaces as changed.
test('stable-field change alongside volatile change IS reported', () => {
  const old = loc(1, { title: 'Old', distance_meters: 100 } as Partial<Location>);
  const updated = loc(1, { title: 'New', distance_meters: 200 } as Partial<Location>);
  const diff = diffLocations([old], [updated]);
  expect(diff.changed).toEqual([1]);
});
