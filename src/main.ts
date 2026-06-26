import './styles.css';
import type { Location, FilterState } from './core/types';
import { Store } from './core/store';
import { loadLocations } from './data/repository';
import { applyFilters, defaultFilter } from './data/filter';
import { addMarkers, updateMarkers } from './map/markers';
import { setMapLanguage } from './map/map';
import { buildStyle } from './map/style';
import { getUserPosition } from './map/controls';
import { mountShell } from './ui/shell';
import { renderList, type UserPos } from './ui/list';
import { renderCard } from './ui/card';
import { openFilters, activeFilterCount } from './ui/filters';
import { openSettings, type SettingsCtx, type Radius, type NavigatorId } from './ui/settings';
import { createSearch } from './ui/search';
import { shareLocation, showToast } from './ui/share';
import { startRoute } from './routing';
import { setLang, getLang, t } from './i18n';
import {
  loadRadius,
  saveRadius,
  loadNavigator,
  saveNavigator,
} from './core/settings';
import { toUserMessage } from './core/errors';

interface AppState {
  locations: Location[];
  filtered: Location[];
  selectedId: number | null;
  filter: FilterState;
  uiLang: 'ru' | 'en';
  mapLang: 'ru' | 'en';
  theme: 'light' | 'dark';
  radius: Radius;
  navigator: NavigatorId;
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app not found');

  // Register the service worker in production only (no SW in dev). Dynamic import
  // so the virtual:pwa-register module is never pulled into the dev bundle.
  if (import.meta.env.PROD) {
    void import('./offline/sw-register').then((m) => m.registerServiceWorker());
  }

  const store = new Store<AppState>({
    locations: [],
    filtered: [],
    selectedId: null,
    filter: defaultFilter(),
    uiLang: getLang(), // persisted in localStorage by the i18n module
    mapLang: 'ru',
    theme: 'light',
    radius: loadRadius(),
    navigator: loadNavigator(),
  });

  // ── Shell + map ──
  const shell = await mountShell(root, { lang: store.get().mapLang, theme: store.get().theme });
  const { map, sheet } = shell;

  // ── Toolbar: filters button + active-conditions badge ──
  const filtersBtn = shell.toolbar.querySelector<HTMLButtonElement>('[data-act="filters"]');
  const updateFilterBadge = (): void => {
    if (!filtersBtn) return;
    const n = activeFilterCount(store.get().filter);
    let badge = filtersBtn.querySelector<HTMLElement>('.toolbar-badge');
    if (n > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'toolbar-badge';
        filtersBtn.appendChild(badge);
      }
      badge.textContent = String(n);
    } else {
      badge?.remove();
    }
  };
  filtersBtn?.addEventListener('click', () => {
    openFilters(
      store.get().filter,
      (f) => store.set({ filter: f }),
      { locations: store.get().locations },
    );
  });

  // ── Helpers ──
  const userPos = (): UserPos | null => {
    const p = getUserPosition();
    return p ? { lat: p.lat, lng: p.lng } : null;
  };

  const onSelect = (id: number): void => store.set({ selectedId: id });

  // Fly the map to a location; queue until the style is ready if needed.
  const flyToLocation = (loc: Location): void => {
    const go = (): void => {
      map.flyTo({ center: [loc.longitude, loc.latitude], zoom: Math.max(map.getZoom(), 15) });
    };
    if (map.isStyleLoaded()) go();
    else map.once('load', go);
  };

  // ── Search box (above the list) ──
  // Mounted as a sibling before listView so renderList()'s replaceChildren()
  // never wipes it. Hidden while a card is open.
  const search = createSearch({
    value: store.get().filter.query,
    onQuery: (q) => {
      if (q === store.get().filter.query) return;
      store.set({ filter: { ...store.get().filter, query: q } });
    },
  });
  sheet.listView.before(search.el);

  const drawList = (): void => {
    renderList(sheet.listView, store.get().filtered, { userPos: userPos(), onSelect });
  };

  // Prompt for geolocation when a route needs a user position: trigger the map's
  // geolocate control (which requests the browser permission) and nudge the user.
  const promptForGeo = (): void => {
    const geoBtn = map
      .getContainer()
      .querySelector<HTMLButtonElement>('.map-ctrl-geolocate');
    geoBtn?.click();
    showToast(t('route.needGeo'));
  };

  const drawCard = (id: number): void => {
    const loc = store.get().locations.find((l) => l.id === id);
    if (!loc) return;
    renderCard(sheet.cardView, loc, {
      onBack: () => store.set({ selectedId: null }),
      onRoute: (l) =>
        startRoute(map, l, { getUserPos: userPos, onNeedGeo: promptForGeo }),
      onShare: (l) => void shareLocation(l),
    });
  };

  // Re-render the persistent chrome after a UI-language switch: list, open card,
  // toolbar filters label (preserving its badge), and the search box strings.
  const rerenderUiLang = (): void => {
    drawList();
    if (store.get().selectedId != null) drawCard(store.get().selectedId!);
    if (filtersBtn) {
      // The label is the button's first child text node; the badge (if any) is a
      // trailing <span>, so update only the text node and re-apply the badge.
      const labelNode = filtersBtn.childNodes[0];
      if (labelNode && labelNode.nodeType === Node.TEXT_NODE) {
        labelNode.textContent = t('toolbar.filters');
      } else {
        filtersBtn.textContent = t('toolbar.filters');
      }
      updateFilterBadge();
    }
    const input = search.el.querySelector<HTMLInputElement>('.search-input');
    if (input) {
      input.placeholder = t('search.placeholder');
      input.setAttribute('aria-label', t('search.label'));
    }
  };

  // ── Subscriptions ──
  // Markers are only (re)drawn once the map style is ready; addSource/addLayer
  // throw otherwise. We track readiness so filter changes still update markers.
  let mapReady = false;
  const refreshMarkers = (): void => {
    if (!mapReady) return;
    updateMarkers(map, store.get().filtered, onSelect);
  };

  // Re-add the points source/layers after a style swap. If the source somehow
  // survived (it normally won't), updateMarkers refreshes it instead of throwing.
  const reAddMarkers = (): void => {
    try {
      if (map.getSource('points')) updateMarkers(map, store.get().filtered, onSelect);
      else addMarkers(map, store.get().filtered, onSelect);
    } catch (e) {
      console.warn('[markers] re-add failed', e);
    }
  };

  // ── Toolbar: settings button ──
  const settingsBtn = shell.toolbar.querySelector<HTMLButtonElement>('[data-act="settings"]');
  const buildSettingsCtx = (): SettingsCtx => {
    const s = store.get();
    return {
      uiLang: s.uiLang,
      mapLang: s.mapLang,
      theme: s.theme,
      radius: s.radius,
      navigator: s.navigator,
      setUiLang: (l) => {
        // Swap the active dictionary (also persists to localStorage), mirror it in
        // the store, then re-render the persistent UI. Open modals are transient and
        // pick up the new language next time they open.
        setLang(l);
        store.set({ uiLang: l });
        rerenderUiLang();
      },
      setMapLang: (l) => {
        store.set({ mapLang: l });
        setMapLanguage(map, l);
      },
      setTheme: (t) => {
        store.set({ theme: t });
        // Theme class on <html> so the --bg token reaches <body> (iOS overscroll).
        document.documentElement.classList.toggle('theme-dark', t === 'dark');
        // setStyle() drops our custom point source/layers. Rebuild the style, then
        // re-add markers once the new style is live (one-shot styledata listener).
        // If the map was never ready, initMarkers()'s 'load' handler covers it.
        if (mapReady) map.once('styledata', reAddMarkers);
        map.setStyle(buildStyle({ lang: store.get().mapLang, theme: t, pmtilesUrl: shell.pmtilesUrl }));
      },
      setRadius: (km) => {
        store.set({ radius: km });
        saveRadius(km);
      },
      setNavigator: (id) => {
        store.set({ navigator: id });
        saveNavigator(id);
      },
    };
  };
  settingsBtn?.addEventListener('click', () => openSettings(buildSettingsCtx()));

  let prevFilter = store.get().filter;
  let prevSelected = store.get().selectedId;

  store.subscribe((s) => {
    // Filter changed → recompute filtered, redraw list + markers, refresh badge.
    if (s.filter !== prevFilter) {
      prevFilter = s.filter;
      updateFilterBadge();
      store.set({ filtered: applyFilters(s.locations, s.filter) });
      return; // the set() above re-enters the subscriber with fresh `filtered`
    }

    // Selection changed → swap views (and hide search while a card is open).
    if (s.selectedId !== prevSelected) {
      prevSelected = s.selectedId;
      if (s.selectedId != null) {
        drawCard(s.selectedId);
        sheet.showCard();
        search.el.hidden = true;
      } else {
        sheet.showList();
        search.el.hidden = false;
      }
    }
  });

  // Keep list + markers in sync whenever `filtered` is replaced.
  let prevFiltered = store.get().filtered;
  store.subscribe((s) => {
    if (s.filtered !== prevFiltered) {
      prevFiltered = s.filtered;
      drawList();
      refreshMarkers();
    }
  });

  // ── Load data ──
  try {
    const locations = await loadLocations();
    const filtered = applyFilters(locations, store.get().filter);
    store.set({ locations, filtered });
  } catch (e) {
    sheet.listView.innerHTML = `<div class="list-error">${toUserMessage(e)}</div>`;
    return;
  }

  // Initial render (list shows immediately even before map paints).
  drawList();

  // ── Deep links (#id=NN) ──
  // Open the referenced location's card and fly to it. Reused on hashchange so
  // pasting/navigating to a share link selects the place live.
  const selectFromHash = (): void => {
    const m = /#id=(\d+)/.exec(location.hash);
    if (!m) return;
    const id = Number(m[1]);
    const loc = store.get().locations.find((l) => l.id === id);
    if (!loc) return;
    if (store.get().selectedId !== id) store.set({ selectedId: id });
    flyToLocation(loc);
  };
  selectFromHash();
  window.addEventListener('hashchange', selectFromHash);

  // Add markers once the style finishes loading; if it never does (no tiles in
  // dev), the list/card still work.
  const initMarkers = (): void => {
    mapReady = true;
    try {
      addMarkers(map, store.get().filtered, onSelect);
    } catch (e) {
      console.warn('[markers] could not add to map', e);
    }
  };
  if (map.isStyleLoaded()) initMarkers();
  else map.once('load', initMarkers);
}

bootstrap().catch((e) => {
  console.error('[bootstrap]', e);
  const root = document.getElementById('app');
  if (root) root.innerHTML = `<div class="list-error">${toUserMessage(e)}</div>`;
});
