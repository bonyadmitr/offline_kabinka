import { openModal } from './modal';
import { esc } from './format';
import { t } from '../i18n';
import {
  estimateUsage,
  transientBytes,
  clearTransient,
  mapDownloaded,
  thumbsDownloaded,
  deleteMapPackage,
  deleteThumbsPackage,
  formatBytes,
  type UsageBreakdown,
} from '../offline/storage';
import {
  downloadMapPackage,
  downloadThumbsPackage,
  mapPackageBytes,
  thumbsPackageBytes,
} from '../offline/downloader';
import { renderInstallHelp } from './install-hint';
import { progressOverlay, toast } from './toast';
import { toUserMessage } from '../core/errors';
import { updateData } from '../update/data-update';
import { checkMapUpdate, updateMap } from '../update/map-update';
import type { ThemePref } from '../core/theme';

export type Lang = 'ru' | 'en';
export type Theme = ThemePref;
export type NavigatorId = 'yandex_maps' | 'yandex_navi' | 'google' | 'apple';

const APP_VERSION = '1.0.0';

/** State + setters the settings modal needs. Provided by main.ts. */
export interface SettingsCtx {
  uiLang: Lang;
  mapLang: Lang;
  theme: Theme;
  navigator: NavigatorId;
  setUiLang(l: Lang): void;
  setMapLang(l: Lang): void;
  setTheme(t: Theme): void;
  setNavigator(id: NavigatorId): void;
  /** Re-read the refreshed dataset into the store (list + markers). */
  onDataUpdated(): void | Promise<void>;
  /** Re-register the stored map source and rebuild the style (no reload). */
  onMapUpdated(): void | Promise<void>;
  /** Re-point the map style at the network source (after deleting the map). */
  onPackageRemoved(): void | Promise<void>;
  /**
   * Thumbnail pack changed (downloaded or deleted): redraw the list and any open
   * card so thumbnails re-resolve from the pack (blob: URLs) or the online
   * fallback. Independent of the map source.
   */
  onThumbsChanged(): void | Promise<void>;
}

// Built per-open so labels reflect the active language.
const navOptions = (): Array<{ id: NavigatorId; label: string }> => [
  { id: 'yandex_maps', label: t('settings.navYandexMaps') },
  { id: 'yandex_navi', label: t('settings.navYandexNavi') },
  { id: 'google', label: t('settings.navGoogle') },
  { id: 'apple', label: t('settings.navApple') },
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
      <div class="set-label">${esc(t('settings.theme'))}</div>
      ${segment('theme', [
        { value: 'system', label: t('settings.themeSystem') },
        { value: 'light', label: t('settings.themeLight') },
        { value: 'dark', label: t('settings.themeDark') },
      ], ctx.theme)}
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
          <span data-clear-label>${esc(t('settings.clearPhotos'))}</span>
        </button>
      </div>
    </div>

    <div class="set-group">
      <div class="set-label">${esc(t('settings.offlineTitle'))}</div>
      <div class="set-package" data-package></div>
    </div>

    <div class="set-group">
      <div class="set-label">${esc(t('settings.installTitle'))}</div>
      <div class="set-install" data-install></div>
    </div>

    <div class="set-group">
      <div class="set-label">${esc(t('settings.updatesGroup'))}</div>
      <div class="set-actions">
        <button type="button" class="set-action" data-act="refresh-data">
          <span>${esc(t('settings.refreshData'))}</span>
        </button>
        <button type="button" class="set-action" data-act="refresh-map">
          <span>${esc(t('settings.refreshMap'))}</span>
        </button>
      </div>
    </div>

    <div class="set-group set-about">
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
  wireSegment(body, 'theme', (v) => ctx.setTheme(v as Theme));

  // ── Navigator radios ──
  body.querySelectorAll<HTMLInputElement>('[data-nav]').forEach((el) => {
    el.addEventListener('change', () => {
      if (el.checked) ctx.setNavigator(el.value as NavigatorId);
    });
  });

  // ── Install help ──
  const installHost = body.querySelector<HTMLElement>('[data-install]');
  if (installHost) renderInstallHelp(installHost);

  // ── Storage: usage readout + clear photo cache ──
  wireStorage(body);

  // ── Offline package: download / delete ──
  wirePackage(body, ctx);

  // ── Updates: refresh data, refresh map ──
  wireUpdates(body, ctx);
}

/** Wire the "refresh data" + "refresh map" actions (WU8). */
function wireUpdates(body: HTMLElement, ctx: SettingsCtx): void {
  const dataBtn = body.querySelector<HTMLButtonElement>('[data-act="refresh-data"]');
  const mapBtn = body.querySelector<HTMLButtonElement>('[data-act="refresh-map"]');

  // ── Refresh data ──
  dataBtn?.addEventListener('click', () => {
    dataBtn.disabled = true;
    const overlay = progressOverlay(t('update.dataTitle'));
    const controller = new AbortController();

    const onProgress = (done: number, total: number, phase: string): void => {
      // Indeterminate until the list lands (total known); then a real fraction.
      overlay.update(total > 0 ? done / total : -1, phase);
    };

    const start = (): void => {
      updateData(onProgress, controller.signal)
        .then((r) => {
          overlay.close();
          if (r.added + r.removed + r.changed === 0) {
            toast(t('update.noChanges'));
          } else {
            toast(t('update.summary', { added: r.added, removed: r.removed, changed: r.changed }));
          }
          void ctx.onDataUpdated();
        })
        .catch((e) => {
          overlay.error(toUserMessage(e), { onRetry: start });
        })
        .finally(() => {
          dataBtn.disabled = false;
        });
    };
    start();
  });

  // ── Refresh map ──
  mapBtn?.addEventListener('click', () => {
    mapBtn.disabled = true;
    void checkMapUpdate()
      .then((check) => {
        if (!check.updateAvailable) {
          toast(t('update.mapNothing'));
          mapBtn.disabled = false;
          return;
        }

        const overlay = progressOverlay(t('update.mapTitle'));
        const start = (): void => {
          updateMap((loaded, total) => overlay.update(total > 0 ? loaded / total : -1, t('update.mapTitle')))
            .then(async () => {
              await ctx.onMapUpdated();
              overlay.close();
              toast(t('update.mapDone'));
            })
            .catch((e) => {
              overlay.error(toUserMessage(e), { onRetry: start });
            })
            .finally(() => {
              mapBtn.disabled = false;
            });
        };
        start();
      })
      .catch((e) => {
        toast(toUserMessage(e), { type: 'error' });
        mapBtn.disabled = false;
      });
  });
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

/** Re-measure the usage breakdown + the clear-photo-cache button label. */
function refreshUsage(body: HTMLElement): void {
  void estimateUsage()
    .then((u) => renderUsage(body, u))
    .catch(() => {
      const totalEl = body.querySelector<HTMLElement>('[data-usage-total]');
      if (totalEl) totalEl.textContent = '—';
    });
  const clearBtn = body.querySelector<HTMLButtonElement>('[data-act="clear-cache"]');
  const clearLabel = body.querySelector<HTMLElement>('[data-clear-label]');
  void transientBytes().then((bytes) => {
    if (!clearLabel) return;
    clearLabel.textContent =
      bytes > 0 ? t('settings.clearPhotosBtn', { x: formatBytes(bytes) }) : t('settings.clearPhotos');
    if (clearBtn) clearBtn.disabled = bytes <= 0;
  });
}

/** Wire the usage readout + clear-photo-cache action (transient only). */
function wireStorage(body: HTMLElement): void {
  const clearBtn = body.querySelector<HTMLButtonElement>('[data-act="clear-cache"]');
  refreshUsage(body);

  clearBtn?.addEventListener('click', () => {
    clearBtn.disabled = true;
    void clearTransient()
      .then((freed) => {
        toast(freed > 0 ? t('settings.cleared', { x: formatBytes(freed) }) : t('settings.clearPhotosEmpty'));
        refreshUsage(body);
      })
      .catch((e) => {
        toast(toUserMessage(e), { type: 'error' });
        refreshUsage(body);
      });
  });
}

/** One offline-package row's text + behaviour, parameterised by package. */
interface PackageRow {
  /** data-act suffix + DOM hook (e.g. "map" → data-act="download-map"). */
  kind: 'map' | 'thumbs';
  titleKey: 'settings.offlineMapTitle' | 'settings.offlineThumbsTitle';
  installedKey: 'settings.offlineMapInstalled' | 'settings.offlineThumbsInstalled';
  notInstalledKey: 'settings.offlineMapNotInstalled' | 'settings.offlineThumbsNotInstalled';
  downloadKey: 'settings.offlineMapDownload' | 'settings.offlineThumbsDownload';
  deleteKey: 'settings.offlineMapDelete' | 'settings.offlineThumbsDelete';
  deletedKey: 'settings.offlineMapDeleted' | 'settings.offlineThumbsDeleted';
  /** Progress-overlay title while downloading. */
  stageKey: 'offline.stageMap' | 'offline.stageThumbs';
  /** Is this package present in IndexedDB? */
  isDownloaded(): Promise<boolean>;
  /** Real package size in bytes (server probe, with offline fallback). */
  bytes(): Promise<number>;
  /** Download the package, reporting a 0..1 fraction. */
  download(onProgress: (f: number) => void): Promise<void>;
  /** Delete the package. */
  remove(): Promise<void>;
  /** Side effect after the package is downloaded (re-point map / redraw list). */
  afterDownload(): void | Promise<void>;
  /** Side effect after the package is deleted (re-point map / redraw list). */
  afterRemove(): void | Promise<void>;
}

/**
 * Render + wire the offline section: two independent rows — Map and Photo
 * thumbnails — each with a status line and a single Download↔Delete button, plus
 * a "clear photo cache" note for thumbs. Each row re-renders after its own action
 * so the button flips; the map and thumbs packages are fully independent.
 */
function wirePackage(body: HTMLElement, ctx: SettingsCtx): void {
  const host = body.querySelector<HTMLElement>('[data-package]');
  if (!host) return;

  const rows: PackageRow[] = [
    {
      kind: 'map',
      titleKey: 'settings.offlineMapTitle',
      installedKey: 'settings.offlineMapInstalled',
      notInstalledKey: 'settings.offlineMapNotInstalled',
      downloadKey: 'settings.offlineMapDownload',
      deleteKey: 'settings.offlineMapDelete',
      deletedKey: 'settings.offlineMapDeleted',
      stageKey: 'offline.stageMap',
      isDownloaded: mapDownloaded,
      bytes: mapPackageBytes,
      download: (onProgress) => downloadMapPackage(onProgress),
      remove: deleteMapPackage,
      afterDownload: () => ctx.onMapUpdated(),
      afterRemove: () => ctx.onPackageRemoved(),
    },
    {
      kind: 'thumbs',
      titleKey: 'settings.offlineThumbsTitle',
      installedKey: 'settings.offlineThumbsInstalled',
      notInstalledKey: 'settings.offlineThumbsNotInstalled',
      downloadKey: 'settings.offlineThumbsDownload',
      deleteKey: 'settings.offlineThumbsDelete',
      deletedKey: 'settings.offlineThumbsDeleted',
      stageKey: 'offline.stageThumbs',
      isDownloaded: thumbsDownloaded,
      bytes: thumbsPackageBytes,
      download: (onProgress) => downloadThumbsPackage(onProgress),
      remove: deleteThumbsPackage,
      afterDownload: () => ctx.onThumbsChanged(),
      afterRemove: () => ctx.onThumbsChanged(),
    },
  ];

  // Build the two row hosts + the thumbs hint once; each renderRow only swaps
  // the contents of its own host so the other row is never disturbed.
  host.replaceChildren();
  const hosts = new Map<PackageRow['kind'], HTMLElement>();
  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'set-package-row';
    rowEl.dataset.pkg = row.kind;
    host.append(rowEl);
    hosts.set(row.kind, rowEl);

    if (row.kind === 'thumbs') {
      const hint = document.createElement('div');
      hint.className = 'set-hint';
      hint.textContent = t('settings.offlineThumbsHint');
      host.append(hint);
    }
  }

  const renderRow = async (row: PackageRow): Promise<void> => {
    const rowEl = hosts.get(row.kind);
    if (!rowEl) return;

    const installed = await row.isDownloaded();
    const mb = Math.round((await row.bytes()) / (1024 * 1024));

    rowEl.replaceChildren();

    const label = document.createElement('div');
    label.className = 'set-subhead';
    label.textContent = t(row.titleKey);

    const status = document.createElement('div');
    status.className = 'set-meta';
    status.innerHTML = `
      <span class="set-meta-key">${esc(t('settings.offlineStatus'))}</span>
      <span>${esc(
        installed
          ? `${t(row.installedKey, { x: `${mb}` })} ✓`
          : t(row.notInstalledKey),
      )}</span>`;

    const actions = document.createElement('div');
    actions.className = 'set-actions';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'set-action';

    if (installed) {
      btn.dataset.act = `delete-${row.kind}`;
      btn.innerHTML = `<span>${esc(t(row.deleteKey, { n: mb }))}</span>`;
      btn.addEventListener('click', () => void onDelete(row));
    } else {
      btn.dataset.act = `download-${row.kind}`;
      btn.innerHTML = `<span>${esc(t(row.downloadKey, { n: mb }))}</span>`;
      btn.addEventListener('click', () => onDownload(row));
    }

    actions.append(btn);
    rowEl.append(label, status, actions);
  };

  const onDownload = (row: PackageRow): void => {
    const overlay = progressOverlay(t(row.stageKey));
    const start = (): void => {
      row
        .download((f) => overlay.update(f, t(row.stageKey)))
        .then(async () => {
          overlay.close();
          toast(t('offline.done'));
          await row.afterDownload();
          await renderRow(row);
          refreshUsage(body);
        })
        .catch((e) => {
          overlay.error(toUserMessage(e), { onRetry: start });
        });
    };
    start();
  };

  const onDelete = async (row: PackageRow): Promise<void> => {
    try {
      await row.remove();
      await row.afterRemove();
      toast(t(row.deletedKey));
    } catch (e) {
      toast(toUserMessage(e), { type: 'error' });
    }
    await renderRow(row);
    refreshUsage(body);
  };

  for (const row of rows) void renderRow(row);
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
