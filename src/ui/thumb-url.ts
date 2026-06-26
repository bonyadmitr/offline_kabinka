// Resolves a photo thumbnail to a loadable URL.
//
// In `Location.photos[].thumb` the value is stored as "thumbs/{id}_photo_N.jpg".
// Resolution order (WU7b):
//   1. The packed offline bundle (thumbs.bin in IndexedDB) via getThumbObjectUrl
//      — used whenever the pack has been downloaded/hydrated.
//   2. In dev, the static file under public/thumbs/ (BASE_URL + 'thumbs/' + name).
//   3. Otherwise a temporary online fallback: the full-size original on the API,
//      derived from the basename "{id}_photo_{N}.jpg". The service worker's
//      runtime cache stores it, so it works offline once seen. This bridges the
//      gap before the offline pack is downloaded.

import { getThumbObjectUrl } from '../offline/thumbs';

/** Full-size originals live on the public API. */
const STORAGE_BASE = 'https://kabinka.by/storage/locations';

/**
 * The single source of truth for a full-size photo URL on the public API:
 * "https://kabinka.by/storage/locations/{id}/photo_{N}.jpg". Used by the online
 * thumb fallback here and by the card gallery (ui/gallery.ts), so the scheme is
 * defined once and the two cannot drift.
 */
export function fullPhotoUrl(locationId: number, photoIndex: number): string {
  return `${STORAGE_BASE}/${locationId}/photo_${photoIndex}.jpg`;
}

/** Strip any directory prefix, returning just "{id}_photo_N.jpg". */
export function thumbBasename(thumb: string): string {
  const i = thumb.lastIndexOf('/');
  return i >= 0 ? thumb.slice(i + 1) : thumb;
}

/**
 * Build the online full-size URL from a thumb basename "{id}_photo_{N}.jpg",
 * returning null if the name doesn't match that shape.
 */
function onlineFullUrl(basename: string): string | null {
  const m = /^(\d+)_photo_(\d+)\.jpg$/i.exec(basename);
  if (!m) return null;
  return fullPhotoUrl(Number(m[1]), Number(m[2]));
}

/** Resolve a stored thumb path (e.g. "thumbs/38_photo_0.jpg") to a URL. */
export function thumbUrl(name: string): string {
  const base = thumbBasename(name);

  // 1) Offline pack (object URL) when available.
  const packed = getThumbObjectUrl(base);
  if (packed) return packed;

  // 2) Dev: static file served from public/thumbs/.
  if (import.meta.env.DEV) {
    return import.meta.env.BASE_URL + 'thumbs/' + base;
  }

  // 3) Online full-size fallback (cached by the SW once fetched).
  return onlineFullUrl(base) ?? import.meta.env.BASE_URL + 'thumbs/' + base;
}
