import { beforeEach, vi } from 'vitest';
import { loadLocations, saveLocations } from '../../src/data/repository';
import { getKV, setKV } from '../../src/data/idb';

// Minimal valid Location
const loc = {
  id: 1,
  title: 'Test',
  address: 'ул. Тест',
  latitude: 53.9,
  longitude: 27.5,
  layout_type: 'block',
  price_type: 'free',
  is_accessible: true,
  is_verified: true,
  tags: [],
  photos: [],
  working_hours: [],
  comments: [],
};

beforeEach(async () => {
  // Clear the idb store between tests by deleting known keys
  await setKV('locations', undefined);
  await setKV('locationsUpdatedAt', undefined);
  vi.restoreAllMocks();
});

test('when idb empty → loadLocations fetches baseline', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([loc]),
  });
  vi.stubGlobal('fetch', fetchMock);

  const result = await loadLocations();
  expect(result.length).toBeGreaterThan(0);
  expect(fetchMock).toHaveBeenCalled();
});

test('after saveLocations → loadLocations returns saved (no fetch)', async () => {
  const saved = [{ ...loc, id: 42, title: 'Saved' }] as any[];
  await saveLocations(saved);

  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  const result = await loadLocations();
  expect(result[0].id).toBe(42);
  expect(fetchMock).not.toHaveBeenCalled();
});
