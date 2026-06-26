/**
 * thumbs.ts — offline thumb loader: slice from packed binary bundle.
 *
 * The binary pack (thumbs.bin) is a raw concatenation of all thumbnail JPEGs.
 * The index (thumbs-index.json) maps basename → [offset, length].
 *
 * The pack is held as the *Blob* straight out of IndexedDB — never read into an
 * ArrayBuffer — so the ~8.3 MB never sits in the JS heap for the whole session
 * (matters on iOS). `Blob.slice(offset, len)` is lazy: it returns a view that
 * only materialises its bytes when read (e.g. by `URL.createObjectURL`).
 *
 * Until setPack() runs (no offline pack downloaded yet) all calls return null
 * and the UI falls back to dev/online URLs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThumbIndex = Record<string, [number, number]>;

// ---------------------------------------------------------------------------
// Core slice function (pure, easily testable)
// ---------------------------------------------------------------------------

/**
 * Slice a single JPEG out of the packed buffer using the index entry. Returns
 * null if the name is not present in the index. Pure helper kept for the unit
 * test; the runtime path uses `Blob.slice` (see getThumbObjectUrl) so the full
 * pack is never read into memory.
 */
export function sliceFromIndex(
  buffer: ArrayBuffer,
  index: ThumbIndex,
  name: string,
): Blob | null {
  const entry = index[name];
  if (!entry) return null;
  const [offset, length] = entry;
  return new Blob([buffer.slice(offset, offset + length)], { type: 'image/jpeg' });
}

// ---------------------------------------------------------------------------
// Pack state (offline integration point)
// ---------------------------------------------------------------------------

let pack: { blob: Blob; idx: ThumbIndex } | null = null;

/** Object URL cache: name → URL string */
const urlCache = new Map<string, string>();

/**
 * Register the loaded pack. `blob` is the thumbs.bin Blob (kept as-is from
 * IndexedDB — not read into memory); `idx` maps basename → [offset, length].
 */
export function setPack(blob: Blob, idx: ThumbIndex): void {
  pack = { blob, idx };
  // Invalidate cache when pack changes
  urlCache.clear();
}

/**
 * Drop the in-memory pack and revoke any object URLs it produced. Called when
 * the offline package is deleted so list/card thumbnails fall back to the
 * online URL (or the gallery placeholder when offline) instead of pointing at
 * freed blobs.
 */
export function clearPack(): void {
  pack = null;
  for (const url of urlCache.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  urlCache.clear();
}

/**
 * Get an object URL for the named thumbnail from the loaded pack.
 * Returns null if the pack is not loaded yet or the name is absent —
 * the UI then falls back to the dev URL from src/ui/thumb-url.ts.
 *
 * Uses `Blob.slice`, which is lazy: the slice references the parent Blob's
 * bytes without copying them, so we never materialise the whole ~8.3 MB pack.
 */
export function getThumbObjectUrl(name: string): string | null {
  if (!pack) return null;

  const cached = urlCache.get(name);
  if (cached) return cached;

  const entry = pack.idx[name];
  if (!entry) return null;
  const [offset, length] = entry;

  const part = pack.blob.slice(offset, offset + length, 'image/jpeg');
  const url = URL.createObjectURL(part);
  urlCache.set(name, url);
  return url;
}
