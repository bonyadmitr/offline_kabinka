// Minimal ambient declaration for the one Node built-in the test setup needs.
// The project intentionally does not depend on @types/node; we only need Node's
// native Blob (which structuredClone preserves) to make fake-indexeddb round-trip
// Blobs in the IDB blob-store tests. See tests/setup.ts for the rationale.
declare module 'node:buffer' {
  export const Blob: typeof globalThis.Blob;
}
