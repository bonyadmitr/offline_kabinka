import type maplibregl from 'maplibre-gl';
import { registerPmtiles, createMap } from '../map/map';
import { buildStyle } from '../map/style';
import { addZoomControls, addGeolocate } from '../map/controls';
import { createSheet, type Sheet } from './sheet';
import { toUserMessage } from '../core/errors';
import { t } from '../i18n';

export interface Shell {
  map: maplibregl.Map;
  sheet: Sheet;
  /** Slot for a top toolbar (filters / settings placeholders for WU5). */
  toolbar: HTMLElement;
}

/** Single source of truth for the PMTiles URL (used by shell + style rebuilds). */
export const PMTILES_URL = import.meta.env.BASE_URL + 'map/minsk.pmtiles';

export interface ShellOpts {
  lang: 'ru' | 'en';
  theme: 'light' | 'dark';
}

/**
 * Mount the full-screen app shell: a map background (#map) with zoom + geolocate
 * controls, a responsive sheet/panel, and a toolbar slot. The map may render an
 * empty canvas until real PMTiles ship (WU6) — that is expected and must not throw.
 */
export function mountShell(root: HTMLElement, opts: ShellOpts): Shell {
  root.classList.add('app-root');
  // Theme class goes on <html> (not #app) so the --bg token also reaches <body>,
  // keeping the iOS overscroll/rubber-band area the right colour.
  document.documentElement.classList.toggle('theme-dark', opts.theme === 'dark');

  // Map container fills the screen behind the panel.
  const mapEl = document.createElement('div');
  mapEl.id = 'map';
  mapEl.className = 'map-container';
  root.appendChild(mapEl);

  // Toolbar slot (filters/settings placeholders wired in WU5).
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.appendChild(makeToolbarBtn(t('toolbar.filters'), 'filters', t('toolbar.filters')));
  toolbar.appendChild(makeToolbarBtn('⚙️', 'settings', t('toolbar.settings')));
  root.appendChild(toolbar);

  // Panel host for the sheet.
  const panelHost = document.createElement('div');
  panelHost.className = 'panel-host';
  root.appendChild(panelHost);
  const sheet = createSheet(panelHost);

  // Create the map. Guard so a missing PMTiles file never crashes the app.
  registerPmtiles();
  const map = createMap(mapEl, buildStyle({ lang: opts.lang, theme: opts.theme, pmtilesUrl: PMTILES_URL }));

  // Surface (but do not throw on) map errors — empty tiles in dev are fine.
  map.on('error', (e) => {
    console.warn('[map]', (e as { error?: Error }).error?.message ?? e);
  });

  addZoomControls(map, mapEl);
  addGeolocate(map, {
    onError: (err) => console.warn('[geolocate]', toUserMessage(err)),
  });

  return { map, sheet, toolbar };
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
