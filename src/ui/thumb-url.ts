// Resolves a photo thumbnail to a loadable URL.
//
// In `Location.photos[].thumb` the value is stored as "thumbs/{id}_photo_N.jpg".
// We take the basename and prefix it with Vite's BASE_URL so it resolves both in
// dev (served from public/thumbs/) and under the GitHub Pages base path.
//
// WU6 will swap the static public/thumbs/*.jpg for an unpacked binary bundle; this
// helper is the single seam where that change lands.

/** Strip any directory prefix, returning just "{id}_photo_N.jpg". */
export function thumbBasename(thumb: string): string {
  const i = thumb.lastIndexOf('/');
  return i >= 0 ? thumb.slice(i + 1) : thumb;
}

/** Resolve a stored thumb path (e.g. "thumbs/38_photo_0.jpg") to a URL. */
export function thumbUrl(name: string): string {
  return import.meta.env.BASE_URL + 'thumbs/' + thumbBasename(name);
}
