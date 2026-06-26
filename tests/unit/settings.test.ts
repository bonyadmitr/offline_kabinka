import { openSettings, type SettingsCtx } from '../../src/ui/settings';

afterEach(() => {
  document.querySelectorAll('.modal-overlay').forEach((n) => n.remove());
  document.body.className = '';
});

function mockCtx(over: Partial<SettingsCtx> = {}): {
  ctx: SettingsCtx;
  calls: Record<string, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {
    setUiLang: [],
    setMapLang: [],
    setTheme: [],
    setNavigator: [],
    onDataUpdated: [],
    onMapUpdated: [],
    onPackageRemoved: [],
    onThumbsChanged: [],
  };
  const ctx: SettingsCtx = {
    uiLang: 'ru',
    mapLang: 'ru',
    theme: 'light',
    navigator: 'yandex_maps',
    setUiLang: (l) => calls.setUiLang.push(l),
    setMapLang: (l) => calls.setMapLang.push(l),
    setTheme: (t) => calls.setTheme.push(t),
    setNavigator: (id) => calls.setNavigator.push(id),
    onDataUpdated: () => {
      calls.onDataUpdated.push(true);
    },
    onMapUpdated: () => {
      calls.onMapUpdated.push(true);
    },
    onPackageRemoved: () => {
      calls.onPackageRemoved.push(true);
    },
    onThumbsChanged: () => {
      calls.onThumbsChanged.push(true);
    },
    ...over,
  };
  return { ctx, calls };
}

test('renders all sections incl. theme segment + offline package + version', () => {
  const { ctx } = mockCtx();
  openSettings(ctx);
  const body = document.querySelector('.modal-body')!;
  expect(body.querySelector('[data-seg="uiLang"]')).toBeTruthy();
  expect(body.querySelector('[data-seg="mapLang"]')).toBeTruthy();
  // Theme is now a three-way segment (System / Light / Dark), not a toggle.
  expect(body.querySelector('[data-seg="theme"]')).toBeTruthy();
  expect(body.querySelectorAll('[data-seg="theme"] .seg-btn').length).toBe(3);
  expect(body.querySelector('[data-toggle="theme"]')).toBeFalsy();
  expect(body.querySelectorAll('[data-nav]').length).toBe(4);
  // WU8 activated the update actions; they render enabled (no disabled attr).
  expect(body.querySelector('.set-action[data-act="refresh-data"]')).toBeTruthy();
  expect(body.querySelector('.set-action[data-act="refresh-map"]')).toBeTruthy();
  expect(body.querySelector('.set-action[data-act="refresh-data"][disabled]')).toBeFalsy();
  expect(body.querySelector('.set-action[data-act="refresh-map"][disabled]')).toBeFalsy();
  // Storage usage readout + clear-photo-cache + install help.
  expect(body.querySelector('[data-usage]')).toBeTruthy();
  expect(body.querySelector('.set-action[data-act="clear-cache"]')).toBeTruthy();
  // Reinstall is gone; an offline-package section renders in its place.
  expect(body.querySelector('.set-action[data-act="reinstall"]')).toBeFalsy();
  expect(body.querySelector('[data-package]')).toBeTruthy();
  expect(body.querySelector('[data-install]')).toBeTruthy();
  // Device ID is no longer displayed.
  expect(body.querySelector('.set-device-id')).toBeFalsy();
});

test('offline section renders two independent package rows + the thumbs hint', () => {
  const { ctx } = mockCtx();
  openSettings(ctx);
  const body = document.querySelector('.modal-body')!;
  // Two row hosts are created synchronously (map + photo thumbnails).
  expect(body.querySelector('[data-package] [data-pkg="map"]')).toBeTruthy();
  expect(body.querySelector('[data-package] [data-pkg="thumbs"]')).toBeTruthy();
  // The online-fallback hint sits under the thumbs row.
  expect(body.querySelector('[data-package] .set-hint')).toBeTruthy();
});

test('offline rows resolve to a Download/Delete action button (async render)', async () => {
  const { ctx } = mockCtx();
  openSettings(ctx);
  const body = document.querySelector('.modal-body')!;

  // renderRow awaits blobSize + the (failing → fallback) size probe before it
  // appends the button; poll a few ticks until the async render lands.
  const waitFor = async (sel: string): Promise<Element> => {
    for (let i = 0; i < 50; i++) {
      const el = body.querySelector(sel);
      if (el) return el;
      await new Promise((r) => setTimeout(r, 0));
    }
    throw new Error('timeout waiting for ' + sel);
  };

  // No blobs in jsdom IDB → each row offers Download (not Delete).
  await waitFor('[data-pkg="map"] .set-action[data-act="download-map"]');
  await waitFor('[data-pkg="thumbs"] .set-action[data-act="download-thumbs"]');
  expect(body.querySelector('[data-pkg="map"] .set-action[data-act="delete-map"]')).toBeFalsy();
});

test('theme segment calls setTheme with the chosen preference', () => {
  const { ctx, calls } = mockCtx();
  openSettings(ctx);
  const seg = document.querySelector('[data-seg="theme"]')!;
  seg.querySelector<HTMLButtonElement>('[data-val="dark"]')!.click();
  seg.querySelector<HTMLButtonElement>('[data-val="system"]')!.click();
  expect(calls.setTheme).toEqual(['dark', 'system']);
});

test('map-lang segment calls setMapLang(en)', () => {
  const { ctx, calls } = mockCtx();
  openSettings(ctx);
  const seg = document.querySelector('[data-seg="mapLang"]')!;
  seg.querySelector<HTMLButtonElement>('[data-val="en"]')!.click();
  expect(calls.setMapLang).toEqual(['en']);
});

test('navigator radio calls setNavigator', () => {
  const { ctx, calls } = mockCtx();
  openSettings(ctx);
  const radio = document.querySelector<HTMLInputElement>('[data-nav][value="google"]')!;
  radio.checked = true;
  radio.dispatchEvent(new Event('change'));
  expect(calls.setNavigator).toEqual(['google']);
});

test('current selections are reflected as pressed/checked', () => {
  const { ctx } = mockCtx({ theme: 'dark', mapLang: 'en', navigator: 'apple' });
  openSettings(ctx);
  expect(
    document.querySelector('[data-seg="theme"] [data-val="dark"]')!.getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    document.querySelector('[data-seg="mapLang"] [data-val="en"]')!.getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    document.querySelector<HTMLInputElement>('[data-nav][value="apple"]')!.checked,
  ).toBe(true);
});
