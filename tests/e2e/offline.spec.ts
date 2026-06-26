import { test, expect, type Page } from '@playwright/test';

// REAL offline test — the core value of the PWA.
//
// Flow: load online → wait for the service worker → download the offline package
// (31 MB map + thumb pack streamed into IndexedDB) → go offline → reload → assert
// the app still works entirely offline:
//   • the shell is served by the SW (no browser offline error),
//   • the data (263 places) comes from the SW precache,
//   • the map canvas is present (tiles read from the IDB blob),
//   • at least one list thumbnail is a `blob:` URL (decoded from the IDB pack) —
//     proving offline thumbnails come from the downloaded bundle, not the network.
//
// Run with a single worker (see playwright.config.ts): the large download + a
// context-wide offline toggle don't parallelise cleanly.

/** Read the byte sizes of the two offline blobs from IndexedDB (0 if absent). */
async function blobSizes(page: Page): Promise<{ minsk: number; thumbs: number }> {
  return page.evaluate(
    () =>
      new Promise<{ minsk: number; thumbs: number }>((resolve, reject) => {
        const req = indexedDB.open('offline_kabinka');
        req.onerror = () => reject(new Error('idb open failed'));
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('blobs')) {
            db.close();
            resolve({ minsk: 0, thumbs: 0 });
            return;
          }
          const tx = db.transaction('blobs', 'readonly');
          const store = tx.objectStore('blobs');
          const out = { minsk: 0, thumbs: 0 };
          const read = (key: 'minsk' | 'thumbs') =>
            new Promise<void>((res) => {
              const g = store.get(key);
              g.onsuccess = () => {
                const v = g.result as Blob | undefined;
                if (v && typeof v.size === 'number') out[key] = v.size;
                res();
              };
              g.onerror = () => res();
            });
          Promise.all([read('minsk'), read('thumbs')]).then(() => {
            db.close();
            resolve(out);
          });
        };
      }),
  );
}

test('app works fully offline after downloading the package', async ({ page, context }) => {
  test.slow(); // 3x timeout: a real ~40 MB download into IDB.

  // ── 1) Load online and wait for the service worker to take control ──
  await page.goto('./');
  // Header renders "263" + "места" in two adjacent spans (no whitespace between
  // them in the DOM), so assert on the count span directly.
  await expect(page.locator('.list-header .list-count')).toHaveText('263');
  await page.evaluate(() => navigator.serviceWorker.ready);

  // ── 2) Download the offline package (skip if already present in IDB) ──
  let sizes = await blobSizes(page);
  if (sizes.minsk === 0 || sizes.thumbs === 0) {
    const accept = page.locator('.offer-banner .offer-accept');
    // The offer banner only shows when the map blob isn't stored yet. If it's
    // missing for any other reason, fail loudly — we can't prove offline without it.
    await expect(accept, 'offline package "Скачать" button should be present').toBeVisible({
      timeout: 20_000,
    });
    await accept.click();

    // Poll IDB until both blobs are present and non-empty. The map is ~31 MB
    // but served from the local preview, so this is fast.
    await expect
      .poll(async () => (await blobSizes(page)).minsk, { timeout: 120_000, intervals: [1000] })
      .toBeGreaterThan(0);
    await expect
      .poll(async () => (await blobSizes(page)).thumbs, { timeout: 60_000, intervals: [1000] })
      .toBeGreaterThan(0);
    sizes = await blobSizes(page);
  }
  expect(sizes.minsk).toBeGreaterThan(0);
  expect(sizes.thumbs).toBeGreaterThan(0);

  // ── 3) Go offline and reload ──
  await context.setOffline(true);
  await page.reload();

  // ── 4) Offline assertions ──
  // No browser offline error page: our shell rendered the toolbar + list.
  // Data comes from the SW precache.
  await expect(page.locator('.list-header .list-count')).toHaveText('263', { timeout: 30_000 });
  await expect(page.locator('#map canvas')).toBeAttached();

  // At least one list thumbnail resolves from the IDB pack as a blob: URL.
  // Allow time for the pack to hydrate and the list to re-render.
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLImageElement>('.list-row img')).some((img) =>
            img.src.startsWith('blob:'),
          ),
        ),
      { timeout: 30_000, intervals: [500] },
    )
    .toBe(true);

  // ── 5) Restore online for any following work ──
  await context.setOffline(false);
});
