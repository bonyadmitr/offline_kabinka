import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

// jsdom does not implement IntersectionObserver. Provide a no-op stub so any
// code that constructs one (e.g. lazy-thumb) doesn't throw in unit tests.
// Tests that want to exercise intersection behaviour should replace this with
// a controllable mock via vi.stubGlobal / vi.fn inside the test file itself.
if (typeof IntersectionObserver === 'undefined') {
  (globalThis as unknown as Record<string, unknown>)['IntersectionObserver'] = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    constructor(
      _cb: IntersectionObserverCallback,
      _opts?: IntersectionObserverInit,
    ) {}
  };
}

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

// fake-indexeddb clones stored values with the global structuredClone(). jsdom's
// Blob/File are NOT recognised by Node's structuredClone (they round-trip to a
// plain object losing `.size`/`.arrayBuffer()`), which breaks our IDB blob store
// tests. Real browsers preserve Blobs in IndexedDB; restore Node's native
// Blob/File globals (which structuredClone handles) so the test env matches.
Object.defineProperty(globalThis, 'Blob', {
  value: NodeBlob,
  writable: true,
  configurable: true,
});
