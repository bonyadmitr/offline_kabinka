/**
 * data-update.ts — in-app dataset refresh against the live kabinka.by API.
 *
 * Mirrors scripts/build-data.mjs but runs in the browser with progress
 * reporting, cooperative cancellation (AbortSignal), and partial persistence:
 *
 *   1) GET /locations?…per_page=500            → summary list
 *   2) per location: GET /locations/{id}        → detail  (fatal-per-item)
 *                    GET /locations/{id}/comments → comments (non-fatal → [])
 *   3) merge summary+detail, inline comments, rebuild photos[].{remote,url,thumb}
 *   4) diff against the stored dataset, persist the merged result, report counts
 *
 * On abort the partially-merged locations are still saved (updated rows layered
 * over the previously stored ones), so an interrupted update never regresses.
 */

import type { Location, Comment, Photo } from '../core/types';
import { AppError } from '../core/errors';
import { getDeviceId } from '../core/device';
import { loadLocations, saveLocations } from '../data/repository';
import { diffLocations } from '../data/diff';
import { t } from '../i18n';

/** Live API base. CORS is open; the X-Device-ID header is mandatory. */
const API_BASE = 'https://kabinka.by/api/v1';

/** List query (matches the build script: Minsk centre, wide radius, one page). */
const LIST_QUERY = 'lat=53.9&lng=27.56&radius=50000&per_page=500';

/** Polite gap between per-location requests (ms), so we don't hammer the API. */
const POLITE_DELAY_MS = 70;

export interface DataUpdateResult {
  added: number;
  removed: number;
  changed: number;
  total: number;
}

/** Resolve after `ms`, rejecting early (DOMException AbortError) if aborted. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * GET `path` (relative to the API base) as JSON with the required headers.
 * Network failures → NET-02, non-2xx → API-01, bad JSON → API-02.
 */
async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Device-ID': getDeviceId() },
      signal,
    });
  } catch (e) {
    // Re-throw aborts untouched so callers can treat them as cancellation.
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new AppError('NET-02', e);
  }
  if (!res.ok) throw new AppError('API-01');
  try {
    return (await res.json()) as T;
  } catch (e) {
    throw new AppError('API-02', e);
  }
}

/** Laravel responses wrap payloads in `{ data, meta }`; unwrap to the body. */
interface Wrapped<T> {
  data?: T;
  meta?: { last_page?: number };
}

/**
 * Reconstruct the photos[] array for a location from its detail object, using
 * the same local-path scheme as build-data.mjs:
 *   remote: /storage/locations/{id}/photo_N.jpg
 *   url:    photos/{id}_photo_N.jpg
 *   thumb:  thumbs/{id}_photo_N.jpg
 */
function buildPhotos(id: number, detail: Record<string, unknown>): Photo[] {
  const photoEntry = (n: number | string): Photo => ({
    remote: `/storage/locations/${id}/photo_${n}.jpg`,
    url: `photos/${id}_photo_${n}.jpg`,
    thumb: `thumbs/${id}_photo_${n}.jpg`,
  });

  const raw = detail.photos;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((p) => {
      const remote =
        (p && typeof p === 'object' &&
          ((p as Record<string, unknown>).remote ??
            (p as Record<string, unknown>).url ??
            (p as Record<string, unknown>).path)) ??
        '';
      const m = String(remote).match(/photo_(\d+)(?:\.jpg)?$/i);
      return photoEntry(m ? m[1] : '0');
    });
  }

  const count = Number(detail.photos_count ?? 0);
  return Array.from({ length: count }, (_, n) => photoEntry(n));
}

/** Fetch all comment pages for a location (non-fatal: caller wraps in try). */
async function fetchComments(id: number, signal?: AbortSignal): Promise<Comment[]> {
  const first = await apiGet<Wrapped<Comment[]>>(`/locations/${id}/comments`, signal);
  const comments: Comment[] = [...(first.data ?? [])];
  const lastPage = first.meta?.last_page ?? 1;
  for (let page = 2; page <= lastPage; page++) {
    const next = await apiGet<Wrapped<Comment[]>>(
      `/locations/${id}/comments?per_page=100&page=${page}`,
      signal,
    );
    comments.push(...(next.data ?? []));
  }
  return comments;
}

/**
 * Refresh the full dataset from the live API.
 *
 * @param onProgress (done, total, phase) — `done` is the count of processed
 *   locations (0 after the list lands), `total` the list length, `phase` a
 *   localized label for the overlay.
 * @param signal optional cancellation. On abort the merged-so-far rows are
 *   still persisted over the prior dataset and the resulting diff is returned.
 * @throws AppError('NET-01') when offline; NET-02/API-01/API-02 on list errors.
 */
export async function updateData(
  onProgress: (done: number, total: number, phase: string) => void,
  signal?: AbortSignal,
): Promise<DataUpdateResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AppError('NET-01');
  }

  // ── Step 1: list ──
  const listRes = await apiGet<Wrapped<Location[]>>(`/locations?${LIST_QUERY}`, signal);
  const summaries = listRes.data ?? (listRes as unknown as Location[]);
  if (!Array.isArray(summaries)) throw new AppError('API-02');

  const total = summaries.length;
  onProgress(0, total, t('update.phaseList'));

  // ── Step 2: per-location detail + comments ──
  const old = await loadLocations();
  const oldById = new Map(old.map((l) => [l.id, l]));

  // Freshly-fetched-and-merged locations only. Removals are detected by what is
  // absent here on a *complete* run; on abort we layer this over `old` instead.
  const fetched = new Map<number, Location>();
  const listedIds = new Set<number>();
  let aborted = false;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      aborted = true;
      break;
    }

    const summary = summaries[i] as unknown as Record<string, unknown>;
    const id = Number(summary.id);
    listedIds.add(id);

    try {
      await delay(POLITE_DELAY_MS, signal);

      const detailRes = await apiGet<Wrapped<Record<string, unknown>>>(
        `/locations/${id}`,
        signal,
      );
      const detail = (detailRes.data ?? detailRes) as Record<string, unknown>;

      // Comments are best-effort: a failure here must not drop the location.
      let comments: Comment[] = [];
      try {
        await delay(POLITE_DELAY_MS, signal);
        comments = await fetchComments(id, signal);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        comments = [];
      }

      const photos = buildPhotos(id, detail);
      // detail overrides summary; photos + comments are normalised in.
      const loc = { ...summary, ...detail, photos, comments } as unknown as Location;
      fetched.set(id, loc);
    } catch (e) {
      // Cancellation propagates; any other per-item failure is skipped so one
      // bad location can't abort the whole refresh.
      if (e instanceof DOMException && e.name === 'AbortError') {
        aborted = true;
        break;
      }
      // skip this location, keep going
    }

    onProgress(i + 1, total, t('update.phaseDetails', { i: i + 1, m: total }));
  }

  // ── Step 3: assemble next, diff, persist ──
  // Start from the fresh fetches. A location that is still in the API list but
  // whose detail fetch failed this run keeps its previous row (a transient error
  // must not delete it). On abort, every untouched old row is carried over too,
  // so partial progress never regresses the stored dataset.
  const merged = new Map<number, Location>(fetched);
  for (const [id, loc] of oldById) {
    if (merged.has(id)) continue;
    if (aborted || listedIds.has(id)) merged.set(id, loc);
  }

  const next = [...merged.values()].sort((a, b) => a.id - b.id);
  const diff = diffLocations(old, next);
  await saveLocations(next);

  return {
    added: diff.added.length,
    removed: diff.removed.length,
    changed: diff.changed.length,
    total: next.length,
  };
}
