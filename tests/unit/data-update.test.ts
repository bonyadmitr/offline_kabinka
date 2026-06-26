import { afterEach, beforeEach, vi } from 'vitest';
import { updateData } from '../../src/update/data-update';
import { loadLocations, saveLocations } from '../../src/data/repository';
import { setKV } from '../../src/data/idb';
import { AppError } from '../../src/core/errors';
import type { Location } from '../../src/core/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(obj: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(obj),
  } as unknown as Response;
}

function notFound(): Response {
  return { ok: false, status: 404, headers: new Headers() } as unknown as Response;
}

/** A minimal stored Location used as the "old" baseline. */
function baseLoc(id: number, over: Partial<Location> = {}): Location {
  return {
    id,
    title: `Loc ${id}`,
    latitude: 53.9,
    longitude: 27.56,
    layout_type: 'unisex',
    price_type: 'free',
    is_accessible: false,
    is_verified: false,
    tags: [],
    photos: [],
    working_hours: [],
    comments: [],
    ...over,
  };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  // Clear any cached dataset between tests.
  await setKV('locations', undefined);
  await setKV('locationsUpdatedAt', undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── offline ────────────────────────────────────────────────────────────────

test('offline → AppError(NET-01)', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  await expect(updateData(() => {})).rejects.toBeInstanceOf(AppError);
  await expect(updateData(() => {})).rejects.toMatchObject({ code: 'NET-01' });
});

// ── happy path (2 locations) ─────────────────────────────────────────────────

test('two locations: fetches list+detail+comments, diff + save are correct', async () => {
  // Baseline: id=1 exists (will change), id=99 exists (will be removed).
  await saveLocations([baseLoc(1, { title: 'Old title' }), baseLoc(99)]);

  const fetchMock = vi.fn((url: string) => {
    if (url.includes('/locations?')) {
      return Promise.resolve(json({ data: [{ id: 1 }, { id: 2 }] }));
    }
    if (/\/locations\/1\/comments/.test(url)) {
      return Promise.resolve(json({ data: [{ id: 11, location_id: 1, comment_text: 'hi' }] }));
    }
    if (/\/locations\/2\/comments/.test(url)) {
      return Promise.resolve(json({ data: [] }));
    }
    if (/\/locations\/1$/.test(url)) {
      return Promise.resolve(json({ data: { id: 1, title: 'New title', photos_count: 2 } }));
    }
    if (/\/locations\/2$/.test(url)) {
      return Promise.resolve(json({ data: { id: 2, title: 'Brand new' } }));
    }
    throw new Error('unexpected url ' + url);
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

  const phases: Array<[number, number, string]> = [];
  const res = await updateData((done, total, phase) => phases.push([done, total, phase]));

  // id=2 added, id=99 removed, id=1 changed. total = surviving (1,2) = 2.
  expect(res).toEqual({ added: 1, removed: 1, changed: 1, total: 2 });

  // Progress: first the list (0/2), then one tick per processed location.
  expect(phases[0][0]).toBe(0);
  expect(phases[0][1]).toBe(2);
  expect(phases.at(-1)?.[0]).toBe(2);

  // Persisted dataset reflects the merge: id=1 retitled, photos rebuilt, comments inlined.
  const saved = await loadLocations();
  const byId = new Map(saved.map((l) => [l.id, l]));
  expect(byId.has(99)).toBe(false);
  expect(byId.get(1)?.title).toBe('New title');
  expect(byId.get(1)?.photos.length).toBe(2);
  expect(byId.get(1)?.photos[0]).toEqual({
    remote: '/storage/locations/1/photo_0.jpg',
    url: 'photos/1_photo_0.jpg',
    thumb: 'thumbs/1_photo_0.jpg',
  });
  expect(byId.get(1)?.comments.length).toBe(1);
  expect(byId.get(2)?.title).toBe('Brand new');
});

// ── comments failure is non-fatal ────────────────────────────────────────────

test('failed comments for one location → that location keeps comments:[]', async () => {
  await saveLocations([baseLoc(1)]);

  const fetchMock = vi.fn((url: string) => {
    if (url.includes('/locations?')) {
      return Promise.resolve(json({ data: [{ id: 1 }] }));
    }
    if (/\/locations\/1\/comments/.test(url)) {
      // Comments endpoint is down for this location.
      return Promise.resolve(notFound());
    }
    if (/\/locations\/1$/.test(url)) {
      return Promise.resolve(json({ data: { id: 1, title: 'Detailed' } }));
    }
    throw new Error('unexpected url ' + url);
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

  const res = await updateData(() => {});
  expect(res.total).toBe(1);

  const saved = await loadLocations();
  expect(saved[0].title).toBe('Detailed'); // location still merged
  expect(saved[0].comments).toEqual([]); // comments degraded gracefully
});

// ── cancellation persists partial progress (no regression) ───────────────────

test('abort mid-run: saves fetched rows layered over the old dataset', async () => {
  // Old has id=1 (will be refreshed) and id=50 (untouched → must survive).
  await saveLocations([baseLoc(1, { title: 'stale' }), baseLoc(50, { title: 'keep me' })]);

  const controller = new AbortController();
  const fetchMock = vi.fn((url: string) => {
    if (url.includes('/locations?')) {
      return Promise.resolve(json({ data: [{ id: 1 }, { id: 2 }, { id: 3 }] }));
    }
    if (/\/locations\/\d+\/comments/.test(url)) return Promise.resolve(json({ data: [] }));
    if (/\/locations\/1$/.test(url)) {
      return Promise.resolve(json({ data: { id: 1, title: 'fresh' } }));
    }
    // Detail for ids 2,3 would come later, but we abort first.
    return Promise.resolve(json({ data: { id: 2, title: 'late' } }));
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

  // Abort right after the first location is processed.
  const res = await updateData((done) => {
    if (done === 1) controller.abort();
  }, controller.signal);

  const saved = await loadLocations();
  const byId = new Map(saved.map((l) => [l.id, l]));
  // id=1 was refreshed before the abort.
  expect(byId.get(1)?.title).toBe('fresh');
  // id=50 (untouched, not even in the new list) is preserved on abort.
  expect(byId.get(50)?.title).toBe('keep me');
  // Nothing is reported as removed on a cancelled run.
  expect(res.removed).toBe(0);
});

// ── list HTTP error surfaces as API-01 ───────────────────────────────────────

test('list endpoint 404 → AppError(API-01)', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFound()) as unknown as typeof fetch);
  await expect(updateData(() => {})).rejects.toMatchObject({ code: 'API-01' });
});
