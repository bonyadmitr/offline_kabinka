import { afterEach, vi } from 'vitest';
import { watchSystemTheme } from '../../src/core/theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── watchSystemTheme with addEventListener (modern API) ─────────────────────

test('watchSystemTheme: calls cb with "dark" when system flips to dark', () => {
  let capturedHandler: ((e: MediaQueryListEvent) => void) | null = null;
  const removeEventListenerSpy = vi.fn();

  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn((_type: string, handler: (e: MediaQueryListEvent) => void) => {
      capturedHandler = handler;
    }),
    removeEventListener: removeEventListenerSpy,
    addListener: undefined, // force the addEventListener path
  }));

  const cb = vi.fn();
  const dispose = watchSystemTheme(cb);

  // Simulate a system-level change to dark.
  expect(capturedHandler).not.toBeNull();
  capturedHandler!({ matches: true } as MediaQueryListEvent);
  expect(cb).toHaveBeenCalledTimes(1);
  expect(cb).toHaveBeenCalledWith('dark');

  // Simulate a system-level change back to light.
  capturedHandler!({ matches: false } as MediaQueryListEvent);
  expect(cb).toHaveBeenCalledTimes(2);
  expect(cb).toHaveBeenLastCalledWith('light');

  // Disposing removes the listener.
  dispose();
  expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
});

// ─── watchSystemTheme fallback: addListener (legacy Safari) ─────────────────

test('watchSystemTheme: falls back to addListener when addEventListener is missing', () => {
  let capturedHandler: ((e: MediaQueryListEvent) => void) | null = null;
  const removeListenerSpy = vi.fn();

  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    // No addEventListener → triggers the addListener branch.
    addEventListener: undefined,
    addListener: vi.fn((_handler: (e: MediaQueryListEvent) => void) => {
      capturedHandler = _handler;
    }),
    removeListener: removeListenerSpy,
  }));

  const cb = vi.fn();
  const dispose = watchSystemTheme(cb);

  capturedHandler!({ matches: true } as MediaQueryListEvent);
  expect(cb).toHaveBeenCalledWith('dark');

  // Disposing calls removeListener.
  dispose();
  expect(removeListenerSpy).toHaveBeenCalledTimes(1);
});

// ─── no-op when matchMedia is unavailable ───────────────────────────────────

test('watchSystemTheme: returns no-op disposer when matchMedia is absent', () => {
  vi.stubGlobal('matchMedia', undefined);
  const cb = vi.fn();
  const dispose = watchSystemTheme(cb);
  // Should not throw and should return a callable no-op.
  expect(() => dispose()).not.toThrow();
  expect(cb).not.toHaveBeenCalled();
});
