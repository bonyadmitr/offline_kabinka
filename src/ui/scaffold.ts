// scaffold.ts — the app's DOM chrome, built synchronously with NO MapLibre/pmtiles
// imports. This is the seam that lets the nearby list paint before the map engine
// (the bulk of the JS) is parsed: main.ts mounts this, renders the list into the
// sheet, then lazily imports ./shell to instantiate the map into `mapEl`.

import { createSheet, type Sheet } from './sheet';
import { t } from '../i18n';

export interface Scaffold {
  /** The empty #map container the map engine fills once it loads. */
  mapEl: HTMLElement;
  /** Responsive bottom-sheet / desktop panel hosting the list + card. */
  sheet: Sheet;
  /**
   * Top-left control group. Holds the Filters button. main.ts wires
   * `[data-act="filters"]` here; Settings lives in its own top-right control.
   */
  toolbar: HTMLElement;
  /** Top-right Settings control (`[data-act="settings"]`). */
  settingsCtrl: HTMLElement;
}

export interface ScaffoldOpts {
  theme: 'light' | 'dark';
}

/**
 * Build the full-screen app chrome: an (empty) map container behind a responsive
 * sheet/panel, a top-left Filters toolbar, and a top-right Settings control.
 * Synchronous and MapLibre-free so the first list render never waits on the map.
 */
export function mountScaffold(root: HTMLElement, opts: ScaffoldOpts): Scaffold {
  root.classList.add('app-root');
  // Theme class goes on <html> (not #app) so the --bg token also reaches <body>,
  // keeping the iOS overscroll/rubber-band area the right colour.
  document.documentElement.classList.toggle('theme-dark', opts.theme === 'dark');

  // Map container fills the screen behind the panel (the map engine fills it later).
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

  return { mapEl, sheet, toolbar, settingsCtrl };
}

function makeToolbarBtn(label: string, act: string, ariaLabel: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toolbar-btn';
  btn.dataset.act = act;
  btn.textContent = label;
  btn.setAttribute('aria-label', ariaLabel);
  return btn;
}
