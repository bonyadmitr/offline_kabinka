/**
 * thumbs.ts — offline thumb loader: slice from packed binary bundle.
 *
 * The binary pack (thumbs.bin) is a raw concatenation of all thumbnail JPEGs.
 * The index (thumbs-index.json) maps basename → [offset, length].
 *
 * WU7 will call setPack() once the bundle is loaded from OPFS/fetch;
 * until then all calls return null and the UI falls back to dev URLs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThumbIndex = Record<string, [number, number]>;

// ---------------------------------------------------------------------------
// Core slice function (pure, easily testable)
// ---------------------------------------------------------------------------

/**
 * Slice a single JPEG out of the packed ArrayBuffer using the index entry.
 * Returns null if the name is not present in the index.
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
// Pack state (WU7 integration point)
// ---------------------------------------------------------------------------

let pack: { buf: ArrayBuffer; idx: ThumbIndex } | null = null;

/** Object URL cache: name → URL string */
const urlCache = new Map<string, string>();

/**
 * Register the loaded pack. Called by WU7 after fetching/reading thumbs.bin.
 */
export function setPack(buf: ArrayBuffer, idx: ThumbIndex): void {
  pack = { buf, idx };
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
 */
export function getThumbObjectUrl(name: string): string | null {
  if (!pack) return null;

  const cached = urlCache.get(name);
  if (cached) return cached;

  const blob = sliceFromIndex(pack.buf, pack.idx, name);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  urlCache.set(name, url);
  return url;
}
