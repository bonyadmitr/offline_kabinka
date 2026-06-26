import { afterEach, beforeEach, vi } from 'vitest';
import { downloadToBlob } from '../../src/offline/downloader';
import { AppError } from '../../src/core/errors';

beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── NET-02: abort during fetch (before headers arrive) ──────────────────────
//
// Simulate the stall-timeout path: fetch rejects with an AbortError.
// We cannot easily drive the internal timer in unit tests without fake timers,
// but we can inject an AbortError directly — that is the code path the timer
// ultimately takes.

test('downloadToBlob: AbortError during fetch → NET-02', async () => {
  const abortError = new DOMException('The operation was aborted', 'AbortError');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

  await expect(downloadToBlob('/x', () => {})).rejects.toMatchObject({ code: 'NET-02' });
});

// ─── NET-02: abort while streaming body ──────────────────────────────────────
//
// The response arrives but the body reader throws AbortError mid-stream.

test('downloadToBlob: AbortError in body stream → NET-02', async () => {
  const abortError = new DOMException('aborted', 'AbortError');
  const fakeResponse = {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Length': '1000' }),
    body: {
      getReader() {
        return {
          read: () => Promise.reject(abortError),
        };
      },
    },
  } as unknown as Response;

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse));

  const err = await downloadToBlob('/x', () => {}).catch((e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe('NET-02');
});

// ─── NET-01: generic network failure (not AbortError) ────────────────────────

test('downloadToBlob: non-abort network error during fetch → NET-01', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(downloadToBlob('/x', () => {})).rejects.toMatchObject({ code: 'NET-01' });
});
