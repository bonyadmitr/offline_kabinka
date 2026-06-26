import { test, expect, type Page } from '@playwright/test';

// Online e2e flows. The preview server has the service worker active and the
// real dataset precached. These tests use resilient, state-based waits
// (getByText / waitForSelector) rather than fixed sleeps.

/**
 * Dismiss the two transient bottom banners that can appear on first load and
 * intercept clicks: the "download offline package" offer and the iOS install
 * hint. Both are best-effort — absent on most runs (e.g. once the map blob is
 * already in IDB), so failures to find them are ignored.
 */
async function dismissBanners(page: Page): Promise<void> {
  // Offer banner: click "Позже" (later) to remove it without downloading.
  const later = page.locator('.offer-banner .offer-later');
  if (await later.count()) {
    await later.first().click().catch(() => {});
  }
  // Install hint banner: dismiss button.
  const installDismiss = page.locator('.install-banner [aria-label="Закрыть"]');
  if (await installDismiss.count()) {
    await installDismiss.first().click().catch(() => {});
  }
}

/** The list header count number (e.g. "263"). */
function listCount(page: Page) {
  return page.locator('.list-header .list-count');
}

/** Wait for the list to show at least one row, then return the current count. */
async function waitForNonZeroCount(page: Page): Promise<number> {
  await expect
    .poll(async () => Number(await listCount(page).innerText()), { timeout: 30_000 })
    .toBeGreaterThan(0);
  return Number(await listCount(page).innerText());
}

/** Capture the full-set count once and reuse it across assertions in the same test. */
async function expectFullList(page: Page): Promise<void> {
  // Wait until the list renders (at least one row), then verify the label.
  await waitForNonZeroCount(page);
  await expect(page.locator('.list-header .list-count-label')).toContainText('мест');
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  // The list renders as soon as the precached/served data loads.
  await waitForNonZeroCount(page);
  await dismissBanners(page);
});

test('loads: shows the full location count and a map canvas', async ({ page }) => {
  await expectFullList(page);
  await expect(page.locator('#map canvas')).toBeAttached();
});

test('open a card from the list and go back', async ({ page }) => {
  const firstRow = page.locator('.list-row').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();

  // Card is shown: the back bar reads "← Назад". The sheet swaps views by toggling
  // the `hidden` attribute on the list/card containers (renderCard/renderList
  // overwrite the element class to `.card`/`.list`), so assert on that attribute
  // rather than computed visibility.
  const back = page.locator('.card-back');
  await expect(back).toContainText('Назад');
  await expect(page.locator('.sheet-scroll > .card')).toBeAttached();
  await expect(page.locator('.sheet-scroll > .list')).toHaveAttribute('hidden', '');

  // Going back returns to the list: the card container becomes hidden and the
  // list container is shown again.
  await back.click();
  await expect(page.locator('.sheet-scroll > .card')).toHaveAttribute('hidden', '');
  await expect(page.locator('.sheet-scroll > .list')).not.toHaveAttribute('hidden', '');
  await expectFullList(page);
});

test('filters: "Открыто сейчас" narrows the list; reset restores full count', async ({ page }) => {
  // Capture the full count from the already-loaded list.
  const fullCount = await waitForNonZeroCount(page);
  expect(fullCount).toBeGreaterThan(0);

  // Dismiss any lingering banners that could obscure the toolbar.
  await dismissBanners(page);

  // Open the filters modal and toggle "Открыто сейчас".
  await page.locator('[data-act="filters"]').click();
  const modal = page.locator('.modal-overlay .modal');
  await expect(modal).toBeVisible();
  // The real checkbox is visually replaced by a custom switch (a track span over
  // a hidden input). Click the enclosing <label>, which natively toggles the
  // bound checkbox and fires the change handler — robust across both viewports.
  await modal.locator('label.filter-toggle').filter({ has: page.locator('[data-toggle="openNow"]') }).click();

  // Apply.
  await modal.getByRole('button', { name: 'Применить' }).click();
  await expect(modal).toHaveCount(0);

  // The active-filter badge appears on the Filters button.
  await expect(page.locator('[data-act="filters"] .toolbar-badge')).toBeVisible();
  // The count is non-zero and strictly below the full set (some places are closed right now).
  await expect
    .poll(async () => Number(await listCount(page).innerText()), { timeout: 10_000 })
    .toBeGreaterThan(0);
  const filteredCount = Number(await listCount(page).innerText());
  expect(filteredCount).toBeLessThan(fullCount);

  // Reopen → Reset restores everything.
  await page.locator('[data-act="filters"]').click();
  await expect(page.locator('.modal-overlay .modal')).toBeVisible();
  await page.locator('.modal-overlay .modal').getByRole('button', { name: 'Сбросить' }).click();
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
  await expect
    .poll(async () => Number(await listCount(page).innerText()), { timeout: 10_000 })
    .toBe(fullCount);
  await expect(page.locator('[data-act="filters"] .toolbar-badge')).toHaveCount(0);
});

test('settings: selecting dark theme adds theme-dark to <html>', async ({ page }) => {
  const html = page.locator('html');

  await page.locator('[data-act="settings"]').click();
  const modal = page.locator('.modal-overlay .modal');
  await expect(modal).toBeVisible();

  // The theme selector is a 3-way segment control ([data-seg="theme"]) with
  // buttons for system/light/dark. Clicking [data-val="dark"] sets the dark theme.
  const darkBtn = modal.locator('[data-seg="theme"] [data-val="dark"]');
  await darkBtn.click();
  await expect(html).toHaveClass(/theme-dark/);

  // Switch back to system to leave the document in a clean state.
  const systemBtn = modal.locator('[data-seg="theme"] [data-val="system"]');
  await systemBtn.click();
  await expect(html).not.toHaveClass(/theme-dark/);
});

test('search: typing "парк" shrinks the list; clearing restores it', async ({ page }) => {
  const search = page.locator('.search-input');
  await expect(search).toBeVisible();

  const full = await waitForNonZeroCount(page);
  expect(full).toBeGreaterThan(0);

  await search.fill('парк');
  // Debounced (~150ms) → wait for the count to drop below the full set.
  await expect
    .poll(async () => Number(await listCount(page).innerText()), { timeout: 10_000 })
    .toBeLessThan(full);
  const narrowed = Number(await listCount(page).innerText());
  expect(narrowed).toBeGreaterThan(0);

  // Clearing the field via the ✕ button restores the full list.
  await page.locator('.search .search-clear').click();
  await expect
    .poll(async () => Number(await listCount(page).innerText()), { timeout: 10_000 })
    .toBe(full);
});

test('deep link #id=11 opens the location card', async ({ page }) => {
  await page.goto('./#id=11');
  // The card opens for point 11 ("Уличный общественный туалет").
  const back = page.locator('.card-back');
  await expect(back).toBeVisible();
  await expect(page.locator('.card .card-title')).toBeVisible();
});
