import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

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
