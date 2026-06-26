import 'fake-indexeddb/auto';

// Node.js 26 sets globalThis.localStorage = undefined (experimental Web Storage).
// Vitest+jsdom does not override it. We must explicitly redirect to jsdom's localStorage.
if (typeof window !== 'undefined') {
  const jsdomLocalStorage = (window as unknown as { _localStorage: Storage })._localStorage;
  if (jsdomLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: jsdomLocalStorage,
      writable: true,
      configurable: true,
    });
  }
}
