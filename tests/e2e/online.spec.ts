import { test, expect, type Page } from '@playwright/test';

// Online e2e flows. The preview server has the service worker active and the
// real dataset (263 locations) precached. These tests use resilient,
// state-based waits (getByText / waitForSelector) rather than fixed sleeps.

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

/** The list header count number ("263"). */
function listCount(page: Page) {
  return page.locator('.list-header .list-count');
}

// The header renders the number and the plural word in two adjacent <span>s
// ("263" + "места") with no whitespace between them in the DOM, so getByText
// with a space wouldn't match — assert on the count span directly.
async function expectFullList(page: Page): Promise<void> {
  await expect(listCount(page)).toHaveText('263');
  await expect(page.locator('.list-header .list-count-label')).toHaveText('места');
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  // The list renders as soon as the precached/served data loads.
  await expectFullList(page);
  await dismissBanners(page);
});

test('loads: shows "263 места" and a map canvas', async ({ page }) => {
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

test('filters: "Открыто сейчас" narrows the list; reset restores 263', async ({ page }) => {
  await expect(listCount(page)).toHaveText('263');

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
  // The count drops below 263 (some places are closed right now).
  await expect(listCount(page)).not.toHaveText('263');

  // Reopen → Reset restores everything.
  await page.locator('[data-act="filters"]').click();
  await expect(page.locator('.modal-overlay .modal')).toBeVisible();
  await page.locator('.modal-overlay .modal').getByRole('button', { name: 'Сбросить' }).click();
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
  await expect(listCount(page)).toHaveText('263');
  await expect(page.locator('[data-act="filters"] .toolbar-badge')).toHaveCount(0);
});

test('settings: toggling dark theme adds theme-dark to <html>', async ({ page }) => {
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/theme-dark/);

  await page.locator('[data-act="settings"]').click();
  const modal = page.locator('.modal-overlay .modal');
  await expect(modal).toBeVisible();

  // Click the dark-theme switch's <label> (the visible control); the hidden
  // checkbox is toggled natively and fires the change handler.
  const themeToggle = modal
    .locator('label.filter-toggle')
    .filter({ has: page.locator('[data-toggle="theme"]') });
  await themeToggle.click();
  await expect(html).toHaveClass(/theme-dark/);

  // Toggle back off to leave the document clean.
  await themeToggle.click();
  await expect(html).not.toHaveClass(/theme-dark/);
});

test('search: typing "парк" shrinks the list; clearing restores it', async ({ page }) => {
  const search = page.locator('.search-input');
  await expect(search).toBeVisible();

  const full = Number(await listCount(page).innerText());
  expect(full).toBe(263);

  await search.fill('парк');
  // Debounced (~150ms) → wait for the count to drop below the full set.
  await expect
    .poll(async () => Number(await listCount(page).innerText()), { timeout: 10_000 })
    .toBeLessThan(full);
  const narrowed = Number(await listCount(page).innerText());
  expect(narrowed).toBeGreaterThan(0);

  // Clearing the field via the ✕ button restores the full list.
  await page.locator('.search .search-clear').click();
  await expect(listCount(page)).toHaveText('263');
});

test('deep link #id=11 opens the location card', async ({ page }) => {
  await page.goto('./#id=11');
  // The card opens for point 11 ("Уличный общественный туалет").
  const back = page.locator('.card-back');
  await expect(back).toBeVisible();
  await expect(page.locator('.card .card-title')).toBeVisible();
});
