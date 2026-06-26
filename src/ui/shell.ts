import type maplibregl from 'maplibre-gl';
import { registerPmtiles, createMap } from '../map/map';
import { buildStyle } from '../map/style';
import { resolvePmtilesUrl } from '../offline/pmtiles-source';
import { addZoomControls, addGeolocate } from '../map/controls';
import { createSheet, type Sheet } from './sheet';
import { toUserMessage } from '../core/errors';
import { t } from '../i18n';

export interface Shell {
  map: maplibregl.Map;
  sheet: Sheet;
  /**
   * Top-left control group. Holds the Filters button (and, on mobile, sits above
   * the sheet). main.ts wires `[data-act="filters"]` here; the Settings button now
   * lives in its own top-right control, returned separately.
   */
  toolbar: HTMLElement;
  /**
   * Top-right Settings control (`[data-act="settings"]`). Settings are unrelated to
   * filters, so they get their own corner on both viewports and never overlap the
   * desktop panel/search.
   */
  settingsCtrl: HTMLElement;
  /**
   * The resolved bare pmtiles source string used for the initial style —
   * either the stored-blob key (`minsk`) or the network URL. main.ts reuses
   * it for style rebuilds (theme/lang swaps) so the source stays consistent.
   */
  pmtilesUrl: string;
}

export interface ShellOpts {
  lang: 'ru' | 'en';
  theme: 'light' | 'dark';
}

/**
 * Mount the full-screen app shell: a map background (#map) with zoom + geolocate
 * controls, a responsive sheet/panel, and a toolbar slot. The map may render an
 * empty canvas until real PMTiles ship (WU6) — that is expected and must not throw.
 *
 * Async because it first checks IndexedDB for a stored map blob: if present the
 * map is served from IndexedDB (offline), otherwise from the network URL.
 */
export async function mountShell(root: HTMLElement, opts: ShellOpts): Promise<Shell> {
  root.classList.add('app-root');
  // Theme class goes on <html> (not #app) so the --bg token also reaches <body>,
  // keeping the iOS overscroll/rubber-band area the right colour.
  document.documentElement.classList.toggle('theme-dark', opts.theme === 'dark');

  // Map container fills the screen behind the panel.
  const mapEl = document.createElement('div');
  mapEl.id = 'map';
  mapEl.className = 'map-container';
  root.appendChild(mapEl);

  // Top-left toolbar: Filters only (Settings moved to its own top-right control so
  // it doesn't share a group with filters and never collides with the desktop
  // panel/search — see styles.css .toolbar / .settings-ctrl).
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.appendChild(makeToolbarBtn(t('toolbar.filters'), 'filters', t('toolbar.filters')));
  root.appendChild(toolbar);

  // Top-right Settings control (icon-only, square tap target).
  const settingsCtrl = document.createElement('div');
  settingsCtrl.className = 'settings-ctrl';
  const settingsBtn = makeToolbarBtn('⚙️', 'settings', t('toolbar.settings'));
  settingsBtn.classList.add('toolbar-btn-icon');
  settingsCtrl.appendChild(settingsBtn);
  root.appendChild(settingsCtrl);

  // Panel host for the sheet.
  const panelHost = document.createElement('div');
  panelHost.className = 'panel-host';
  root.appendChild(panelHost);
  const sheet = createSheet(panelHost);

  // Resolve the map source: stored IndexedDB blob (offline) if present, else the
  // network URL. registerPmtiles() is also called inside resolvePmtilesUrl when a
  // stored blob is found; call it here too so the network path is registered.
  registerPmtiles();
  const pmtilesUrl = await resolvePmtilesUrl();

  // Create the map. Guard so a missing PMTiles file never crashes the app.
  const map = createMap(mapEl, buildStyle({ lang: opts.lang, theme: opts.theme, pmtilesUrl }));

  // Surface (but do not throw on) map errors — empty tiles in dev are fine.
  map.on('error', (e) => {
    console.warn('[map]', (e as { error?: Error }).error?.message ?? e);
  });

  addZoomControls(map, mapEl);
  addGeolocate(map, {
    onError: (err) => console.warn('[geolocate]', toUserMessage(err)),
  });

  return { map, sheet, toolbar, settingsCtrl, pmtilesUrl };
}

function makeToolbarBtn(label: string, act: string, ariaLabel: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toolbar-btn';
  btn.dataset.act = act; // WU5 hooks attach here
  btn.textContent = label;
  btn.setAttribute('aria-label', ariaLabel);
  return btn;
}
