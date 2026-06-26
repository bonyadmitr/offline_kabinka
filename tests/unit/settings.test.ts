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
    setRadius: [],
    setNavigator: [],
  };
  const ctx: SettingsCtx = {
    uiLang: 'ru',
    mapLang: 'ru',
    theme: 'light',
    radius: 2,
    navigator: 'yandex_maps',
    setUiLang: (l) => calls.setUiLang.push(l),
    setMapLang: (l) => calls.setMapLang.push(l),
    setTheme: (t) => calls.setTheme.push(t),
    setRadius: (km) => calls.setRadius.push(km),
    setNavigator: (id) => calls.setNavigator.push(id),
    ...over,
  };
  return { ctx, calls };
}

test('renders all sections incl. device id + version', () => {
  const { ctx } = mockCtx();
  openSettings(ctx);
  const body = document.querySelector('.modal-body')!;
  expect(body.querySelector('[data-seg="uiLang"]')).toBeTruthy();
  expect(body.querySelector('[data-seg="mapLang"]')).toBeTruthy();
  expect(body.querySelector('[data-toggle="theme"]')).toBeTruthy();
  expect(body.querySelector('[data-seg="radius"]')).toBeTruthy();
  expect(body.querySelectorAll('[data-nav]').length).toBe(4);
  // 5 disabled placeholders
  expect(body.querySelectorAll('.set-action[disabled]').length).toBe(5);
  expect(body.querySelector('.set-device-id')?.textContent).toBeTruthy();
});

test('theme toggle calls setTheme(dark)', () => {
  const { ctx, calls } = mockCtx();
  openSettings(ctx);
  const toggle = document.querySelector<HTMLInputElement>('[data-toggle="theme"]')!;
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
  expect(calls.setTheme).toEqual(['dark']);
});

test('map-lang segment calls setMapLang(en)', () => {
  const { ctx, calls } = mockCtx();
  openSettings(ctx);
  const seg = document.querySelector('[data-seg="mapLang"]')!;
  seg.querySelector<HTMLButtonElement>('[data-val="en"]')!.click();
  expect(calls.setMapLang).toEqual(['en']);
});

test('radius segment calls setRadius(5) as a number', () => {
  const { ctx, calls } = mockCtx();
  openSettings(ctx);
  const seg = document.querySelector('[data-seg="radius"]')!;
  seg.querySelector<HTMLButtonElement>('[data-val="5"]')!.click();
  expect(calls.setRadius).toEqual([5]);
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
  const { ctx } = mockCtx({ theme: 'dark', mapLang: 'en', radius: 20, navigator: 'apple' });
  openSettings(ctx);
  expect(document.querySelector<HTMLInputElement>('[data-toggle="theme"]')!.checked).toBe(true);
  expect(
    document.querySelector('[data-seg="mapLang"] [data-val="en"]')!.getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    document.querySelector('[data-seg="radius"] [data-val="20"]')!.getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    document.querySelector<HTMLInputElement>('[data-nav][value="apple"]')!.checked,
  ).toBe(true);
});
