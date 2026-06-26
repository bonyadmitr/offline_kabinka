/**
 * pmtiles-source.ts — serve the map archive from a Blob held in IndexedDB.
 *
 * pmtiles v4 `Source` interface (node_modules/pmtiles, verified):
 *   interface Source {
 *     getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string)
 *       : Promise<RangeResponse>;   // RangeResponse = { data: ArrayBuffer; etag?; expires?; cacheControl? }
 *     getKey(): string;             // unique archive key
 *   }
 *
 * Protocol.add(pm) registers the archive under `pm.source.getKey()`. The tile/
 * metadata URL `pmtiles://minsk` is parsed by the protocol back to the bare key
 * `minsk`, which must match getKey() so the request resolves to our stored
 * instance instead of a network fetch.
 *
 * IMPORTANT: buildStyle() wraps its `pmtilesUrl` as `pmtiles://${pmtilesUrl}`.
 * So the helpers here return the BARE source string (e.g. `minsk` or the network
 * URL) — never a pre-prefixed `pmtiles://…`.
 */

import { PMTiles } from 'pmtiles';
import type { Source, RangeResponse } from 'pmtiles';
import { registerPmtiles, getProtocol } from '../map/map';
import { getBlob } from './blobstore';
import { PMTILES_KEY } from './pmtiles-key';

/**
 * Default key under which the map archive is stored in IndexedDB / the protocol.
 * Re-exported from the dependency-free pmtiles-key module so importers that only
 * need the constant don't pull this (MapLibre-touching) module into their chunk.
 */
export { PMTILES_KEY };

/**
 * A pmtiles Source backed by a Blob in IndexedDB. Reads are lazy byte ranges:
 * only the requested slice is materialised into an ArrayBuffer.
 */
export class IDBBlobSource implements Source {
  constructor(
    private readonly blob: Blob,
    private readonly key: string,
  ) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const data = await this.blob.slice(offset, offset + length).arrayBuffer();
    return { data };
  }
}

/**
 * If a stored map Blob exists under `key`, register it on the shared pmtiles
 * Protocol and return the bare source string (`<key>`) for buildStyle.
 * Returns null when no stored blob is present (caller falls back to network).
 */
export async function useStoredPmtilesIfPresent(
  key: string = PMTILES_KEY,
): Promise<string | null> {
  const blob = await getBlob(key);
  if (!blob) return null;

  registerPmtiles();
  const protocol = getProtocol();
  // Re-add is harmless: Protocol.add overwrites the entry under the same key.
  protocol.add(new PMTiles(new IDBBlobSource(blob, key)));
  return key;
}

/**
 * Resolve the bare pmtiles source string for buildStyle():
 *   • stored blob present → the bare key (`minsk`), served from IndexedDB;
 *   • otherwise            → the network URL under BASE_URL.
 * buildStyle prepends `pmtiles://` to whatever this returns.
 */
export async function resolvePmtilesUrl(
  key: string = PMTILES_KEY,
): Promise<string> {
  const stored = await useStoredPmtilesIfPresent(key);
  return stored ?? import.meta.env.BASE_URL + 'map/minsk.pmtiles';
}
