import { openModal } from './modal';
import { getDeviceId } from '../core/device';
import { esc } from './format';
import { t } from '../i18n';
import {
  estimateUsage,
  transientBytes,
  clearTransient,
  reinstallPackage,
  formatBytes,
  type UsageBreakdown,
} from '../offline/storage';
import { renderInstallHelp } from './install-hint';
import { progressOverlay, toast } from './toast';
import { toUserMessage } from '../core/errors';

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

// Built per-open so labels reflect the active language.
const navOptions = (): Array<{ id: NavigatorId; label: string }> => [
  { id: 'yandex_maps', label: t('settings.navYandexMaps') },
  { id: 'yandex_navi', label: t('settings.navYandexNavi') },
  { id: 'google', label: t('settings.navGoogle') },
  { id: 'apple', label: t('settings.navApple') },
];

const RADIUS_OPTIONS: Radius[] = [1, 2, 5, 20];

/** Data/map refresh remain placeholders until WU8. */
const placeholders = (): Array<{ act: string; label: string }> => [
  { act: 'refresh-data', label: t('settings.refreshData') },
  { act: 'refresh-map', label: t('settings.refreshMap') },
];

export function openSettings(ctx: SettingsCtx): void {
  const modal = openModal({ title: t('settings.title') });

  modal.body.innerHTML = `
    <div class="set-group">
      <div class="set-label">${esc(t('settings.uiLanguage'))}</div>
      ${segment('uiLang', [
        { value: 'ru', label: 'RU' },
        { value: 'en', label: 'EN' },
      ], ctx.uiLang)}
    </div>

    <div class="set-group">
      <div class="set-label">${esc(t('settings.mapLanguage'))}</div>
      ${segment('mapLang', [
        { value: 'ru', label: 'RU' },
        { value: 'en', label: 'EN' },
      ], ctx.mapLang)}
    </div>

    <div class="set-group">
      <label class="filter-toggle">
        <span class="filter-toggle-label"><span aria-hidden="true">🌙</span> ${esc(t('settings.darkTheme'))}</span>
        <span class="switch">
          <input type="checkbox" data-toggle="theme" ${ctx.theme === 'dark' ? 'checked' : ''} />
          <span class="switch-track" aria-hidden="true"></span>
        </span>
      </label>
    </div>

    <div class="set-group">
      <div class="set-label">${esc(t('settings.listRadius'))}</div>
      ${segment(
        'radius',
        RADIUS_OPTIONS.map((km) => ({ value: String(km), label: t('settings.radiusKm', { km }) })),
        String(ctx.radius),
      )}
    </div>

    <div class="set-group">
      <div class="set-label">${esc(t('settings.defaultNavigator'))}</div>
      <div class="set-radio-list" role="radiogroup" aria-label="${esc(t('settings.defaultNavigator'))}">
        ${navOptions().map(
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
      <div class="set-label">${esc(t('settings.appSizeTitle'))}</div>
      <div class="set-usage" data-usage>
        <div class="set-usage-total">
          <span class="set-meta-key">${esc(t('settings.appSizeTotal'))}</span>
          <span data-usage-total>${esc(t('settings.appSizeMeasuring'))}</span>
        </div>
        <div class="set-usage-bars" data-usage-bars></div>
      </div>
      <div class="set-actions">
        <button type="button" class="set-action" data-act="clear-cache">
          <span data-clear-label>${esc(t('settings.clearCache'))}</span>
        </button>
        <button type="button" class="set-action" data-act="reinstall">
          <span>${esc(t('settings.reinstall'))}</span>
        </button>
      </div>
    </div>

    <div class="set-group">
      <div class="set-label">${esc(t('settings.installTitle'))}</div>
      <div class="set-install" data-install></div>
    </div>

    <div class="set-group">
      <div class="set-label">${esc(t('settings.soonGroup'))}</div>
      <div class="set-actions">
        ${placeholders().map(
          (p) => `
          <button type="button" class="set-action" data-act="${esc(p.act)}" disabled>
            <span>${esc(p.label)}</span>
            <span class="set-soon">${esc(t('common.soon'))}</span>
          </button>`,
        ).join('')}
      </div>
    </div>

    <div class="set-group set-about">
      <div class="set-meta">
        <span class="set-meta-key">${esc(t('settings.deviceId'))}</span>
        <code class="set-device-id">${esc(getDeviceId())}</code>
      </div>
      <div class="set-meta">
        <span class="set-meta-key">${esc(t('settings.version'))}</span>
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

  // ── Install help ──
  const installHost = body.querySelector<HTMLElement>('[data-install]');
  if (installHost) renderInstallHelp(installHost);

  // ── Storage: usage readout, clear cache, reinstall ──
  wireStorage(body);
}

/** Render the usage breakdown bars + total. */
function renderUsage(
  body: HTMLElement,
  data: { total: number; breakdown: UsageBreakdown },
): void {
  const totalEl = body.querySelector<HTMLElement>('[data-usage-total]');
  if (totalEl) totalEl.textContent = formatBytes(data.total);

  const bars = body.querySelector<HTMLElement>('[data-usage-bars]');
  if (!bars) return;

  const rows: Array<{ key: keyof UsageBreakdown; label: string }> = [
    { key: 'map', label: t('settings.appSizeMap') },
    { key: 'thumbs', label: t('settings.appSizeThumbs') },
    { key: 'data', label: t('settings.appSizeData') },
    { key: 'photos', label: t('settings.appSizePhotos') },
    { key: 'shell', label: t('settings.appSizeShell') },
  ];
  const max = Math.max(1, ...rows.map((r) => data.breakdown[r.key]));

  bars.replaceChildren();
  for (const r of rows) {
    const bytes = data.breakdown[r.key];
    const row = document.createElement('div');
    row.className = 'set-usage-row';
    const pct = Math.round((bytes / max) * 100);
    row.innerHTML = `
      <span class="set-usage-name">${esc(r.label)}</span>
      <span class="set-usage-track"><span class="set-usage-bar" style="width:${pct}%"></span></span>
      <span class="set-usage-val">${esc(formatBytes(bytes))}</span>`;
    bars.appendChild(row);
  }
}

/** Wire the usage readout + clear-cache + reinstall actions. */
function wireStorage(body: HTMLElement): void {
  const clearBtn = body.querySelector<HTMLButtonElement>('[data-act="clear-cache"]');
  const clearLabel = body.querySelector<HTMLElement>('[data-clear-label]');
  const reinstallBtn = body.querySelector<HTMLButtonElement>('[data-act="reinstall"]');

  const refresh = (): void => {
    void estimateUsage()
      .then((u) => renderUsage(body, u))
      .catch(() => {
        const totalEl = body.querySelector<HTMLElement>('[data-usage-total]');
        if (totalEl) totalEl.textContent = '—';
      });
    void transientBytes().then((bytes) => {
      if (!clearLabel) return;
      clearLabel.textContent =
        bytes > 0 ? t('settings.clearCacheBtn', { x: formatBytes(bytes) }) : t('settings.clearCache');
      if (clearBtn) clearBtn.disabled = bytes <= 0;
    });
  };
  refresh();

  clearBtn?.addEventListener('click', () => {
    clearBtn.disabled = true;
    void clearTransient()
      .then((freed) => {
        toast(freed > 0 ? t('settings.cleared', { x: formatBytes(freed) }) : t('settings.clearCacheEmpty'));
        refresh();
      })
      .catch((e) => {
        toast(toUserMessage(e), { type: 'error' });
        refresh();
      });
  });

  reinstallBtn?.addEventListener('click', () => {
    const overlay = progressOverlay(t('settings.reinstalling'));
    const start = (): void => {
      reinstallPackage((p, label) => overlay.update(p, label))
        .then(() => {
          overlay.close();
          toast(t('settings.reinstalled'));
          refresh();
        })
        .catch((e) => {
          overlay.error(toUserMessage(e), { onRetry: start });
        });
    };
    start();
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
