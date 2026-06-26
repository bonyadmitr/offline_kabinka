import { openModal } from './modal';
import { getDeviceId } from '../core/device';
import { esc } from './format';

export type Lang = 'ru' | 'en';
export type Theme = 'light' | 'dark';
export type Radius = 1 | 2 | 5 | 20;
export type NavigatorId = 'yandex_maps' | 'yandex_navi' | 'google' | 'apple';

const APP_VERSION = '1.0.0';

/** State + setters the settings modal needs. Provided by main.ts. */
export interface SettingsCtx {
  uiLang: Lang;
  mapLang: Lang;
  theme: Theme;
  radius: Radius;
  navigator: NavigatorId;
  setUiLang(l: Lang): void;
  setMapLang(l: Lang): void;
  setTheme(t: Theme): void;
  setRadius(km: Radius): void;
  setNavigator(id: NavigatorId): void;
}

const NAV_OPTIONS: Array<{ id: NavigatorId; label: string }> = [
  { id: 'yandex_maps', label: 'Яндекс Карты' },
  { id: 'yandex_navi', label: 'Яндекс Навигатор' },
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
];

const RADIUS_OPTIONS: Radius[] = [1, 2, 5, 20];

/** Placeholder actions activated in WU7/WU8. */
const PLACEHOLDERS: Array<{ act: string; label: string }> = [
  { act: 'refresh-data', label: 'Обновить данные' },
  { act: 'refresh-map', label: 'Обновить карту' },
  { act: 'app-size', label: 'Размер приложения' },
  { act: 'clear-cache', label: 'Очистить кеш' },
  { act: 'install', label: 'Как установить приложение' },
];

export function openSettings(ctx: SettingsCtx): void {
  const modal = openModal({ title: 'Настройки' });

  modal.body.innerHTML = `
    <div class="set-group">
      <div class="set-label">Язык интерфейса</div>
      ${segment('uiLang', [
        { value: 'ru', label: 'RU' },
        { value: 'en', label: 'EN' },
      ], ctx.uiLang)}
    </div>

    <div class="set-group">
      <div class="set-label">Язык карты</div>
      ${segment('mapLang', [
        { value: 'ru', label: 'RU' },
        { value: 'en', label: 'EN' },
      ], ctx.mapLang)}
    </div>

    <div class="set-group">
      <label class="filter-toggle">
        <span class="filter-toggle-label"><span aria-hidden="true">🌙</span> Тёмная тема</span>
        <span class="switch">
          <input type="checkbox" data-toggle="theme" ${ctx.theme === 'dark' ? 'checked' : ''} />
          <span class="switch-track" aria-hidden="true"></span>
        </span>
      </label>
    </div>

    <div class="set-group">
      <div class="set-label">Радиус списка</div>
      ${segment(
        'radius',
        RADIUS_OPTIONS.map((km) => ({ value: String(km), label: `${km} км` })),
        String(ctx.radius),
      )}
    </div>

    <div class="set-group">
      <div class="set-label">Навигатор по умолчанию</div>
      <div class="set-radio-list" role="radiogroup" aria-label="Навигатор по умолчанию">
        ${NAV_OPTIONS.map(
          (o) => `
          <label class="set-radio">
            <input type="radio" name="set-navigator" value="${esc(o.id)}" data-nav ${
              ctx.navigator === o.id ? 'checked' : ''
            } />
            <span class="set-radio-dot" aria-hidden="true"></span>
            <span>${esc(o.label)}</span>
          </label>`,
        ).join('')}
      </div>
    </div>

    <div class="set-group">
      <div class="set-label">Скоро</div>
      <div class="set-actions">
        ${PLACEHOLDERS.map(
          (p) => `
          <button type="button" class="set-action" data-act="${esc(p.act)}" disabled>
            <span>${esc(p.label)}</span>
            <span class="set-soon">скоро</span>
          </button>`,
        ).join('')}
      </div>
    </div>

    <div class="set-group set-about">
      <div class="set-meta">
        <span class="set-meta-key">Device ID</span>
        <code class="set-device-id">${esc(getDeviceId())}</code>
      </div>
      <div class="set-meta">
        <span class="set-meta-key">Версия</span>
        <span>${esc(APP_VERSION)}</span>
      </div>
    </div>
  `;

  const body = modal.body;

  // ── Segments ──
  wireSegment(body, 'uiLang', (v) => ctx.setUiLang(v as Lang));
  wireSegment(body, 'mapLang', (v) => ctx.setMapLang(v as Lang));
  wireSegment(body, 'radius', (v) => ctx.setRadius(Number(v) as Radius));

  // ── Theme toggle ──
  body.querySelector<HTMLInputElement>('[data-toggle="theme"]')?.addEventListener('change', (e) => {
    ctx.setTheme((e.target as HTMLInputElement).checked ? 'dark' : 'light');
  });

  // ── Navigator radios ──
  body.querySelectorAll<HTMLInputElement>('[data-nav]').forEach((el) => {
    el.addEventListener('change', () => {
      if (el.checked) ctx.setNavigator(el.value as NavigatorId);
    });
  });
}

function segment(
  key: string,
  options: Array<{ value: string; label: string }>,
  current: string,
): string {
  return `
    <div class="set-segment" data-seg="${esc(key)}" role="group">
      ${options
        .map(
          (o) =>
            `<button type="button" class="seg-btn${
              o.value === current ? ' is-on' : ''
            }" data-val="${esc(o.value)}" aria-pressed="${o.value === current}">${esc(
              o.label,
            )}</button>`,
        )
        .join('')}
    </div>`;
}

function wireSegment(root: HTMLElement, key: string, onPick: (value: string) => void): void {
  const seg = root.querySelector<HTMLElement>(`[data-seg="${key}"]`);
  if (!seg) return;
  const btns = seg.querySelectorAll<HTMLButtonElement>('.seg-btn');
  btns.forEach((el) => {
    el.addEventListener('click', () => {
      btns.forEach((b) => {
        const on = b === el;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      onPick(el.dataset.val!);
    });
  });
}
