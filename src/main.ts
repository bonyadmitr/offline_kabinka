import './styles.css';
import type maplibregl from 'maplibre-gl';
import type { Location, FilterState } from './core/types';
import { Store } from './core/store';
import { loadLocations } from './data/repository';
import { applyFilters, defaultFilter } from './data/filter';
import { buildStyle } from './map/style';
import { mountScaffold, type Scaffold } from './ui/scaffold';
import { renderList, type UserPos } from './ui/list';
import { renderCard } from './ui/card';
import { openFilters, activeFilterCount } from './ui/filters';
import { openSettings, type SettingsCtx, type NavigatorId } from './ui/settings';
import { createSearch } from './ui/search';
import { shareLocation, showToast } from './ui/share';
import { startRoute } from './routing';
import { setLang, getLang, t } from './i18n';
import { loadTheme, saveTheme, loadNavigator, saveNavigator } from './core/settings';
import { effectiveTheme, watchSystemTheme, type ThemePref } from './core/theme';
import { toUserMessage } from './core/errors';
import {
  loadThumbsPackFromIDB,
  ensureOfflinePackage,
  pendingPackageBytes,
} from './offline/downloader';
import { blobSize } from './offline/blobstore';
import { PMTILES_KEY } from './offline/pmtiles-key';
import { toast, progressOverlay } from './ui/toast';
import { initInstallHint } from './ui/install-hint';
import { addBanner } from './ui/banner-stack';

interface AppState {
  locations: Location[];
  filtered: Location[];
  selectedId: number | null;
  filter: FilterState;
  uiLang: 'ru' | 'en';
  mapLang: 'ru' | 'en';
  theme: ThemePref;
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

  // If the thumbnail pack is already in IndexedDB, hydrate it now so list/card
  // thumbnails resolve from the offline bundle. Loads in parallel with the data
  // fetch; the initial render awaits it (see below). No-op when no pack.
  const thumbsReady = loadThumbsPackFromIDB().catch(() => {});

  const store = new Store<AppState>({
    locations: [],
    filtered: [],
    selectedId: null,
    filter: defaultFilter(),
    uiLang: getLang(), // persisted in localStorage by the i18n module
    mapLang: 'ru',
    theme: loadTheme(), // 'system' | 'light' | 'dark', default 'system'
    navigator: loadNavigator(),
  });

  // Resolve the stored preference to the theme actually applied. The class on
  // <html> is also set inside mountScaffold; we pass the effective value through.
  const eff = (): 'light' | 'dark' => effectiveTheme(store.get().theme);

  // ── DOM chrome (synchronous, MapLibre-free) ──
  // mountScaffold builds the sheet/toolbar/settings + an empty #map container with
  // NO MapLibre import, so the nearby list can paint before the map engine (the
  // bulk of the JS) is parsed. The map is attached later via a lazy import.
  const scaffold: Scaffold = mountScaffold(root, { theme: eff() });
  const { sheet, toolbar, settingsCtrl, mapEl } = scaffold;

  // ── Map handles (populated once the lazy map chunk attaches) ──
  let map: maplibregl.Map | null = null;
  // The bare pmtiles source string for style rebuilds (theme/lang swaps); set when
  // the map attaches and updated when the stored blob is added/removed.
  let pmtilesUrl = '';
  let getUserPos: () => UserPos | null = () => null;
  // Re-point the style at the stored map blob; assigned once the map attaches.
  let restoreStoredMap: () => Promise<void> = async () => {};
  // Work queued by deep links / card opens that fire before the map is ready.
  const onMapReady: Array<(m: maplibregl.Map) => void> = [];
  const whenMapReady = (fn: (m: maplibregl.Map) => void): void => {
    if (map) fn(map);
    else onMapReady.push(fn);
  };

  // ── Helpers ──
  const userPos = (): UserPos | null => getUserPos();

  const onSelect = (id: number): void => store.set({ selectedId: id });

  // Fly the map to a location; queue until the map chunk + style are ready.
  const flyToLocation = (loc: Location): void => {
    whenMapReady((m) => {
      const go = (): void => {
        m.flyTo({ center: [loc.longitude, loc.latitude], zoom: Math.max(m.getZoom(), 15) });
      };
      if (m.isStyleLoaded()) go();
      else m.once('load', go);
    });
  };

  // Prompt for geolocation when a route needs a user position: trigger the map's
  // geolocate control (which requests the browser permission) and nudge the user.
  const promptForGeo = (): void => {
    const geoBtn = map
      ?.getContainer()
      .querySelector<HTMLButtonElement>('.map-ctrl-geolocate');
    geoBtn?.click();
    showToast(t('route.needGeo'));
  };

  // ── Search box (above the list) ──
  // Mounted as a sibling before listView (which already exists in the scaffold's
  // sheet) so renderList()'s replaceChildren() never wipes it. Hidden while a card
  // is open.
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

  const drawCard = (id: number): void => {
    const loc = store.get().locations.find((l) => l.id === id);
    if (!loc) return;
    renderCard(sheet.cardView, loc, {
      onBack: () => store.set({ selectedId: null }),
      onRoute: (l) =>
        whenMapReady((m) =>
          startRoute(m, l, { getUserPos: userPos, onNeedGeo: promptForGeo }),
        ),
      onShare: (l) => void shareLocation(l),
    });
  };

  // ── Toolbar: filters button + active-conditions badge ──
  const filtersBtn = toolbar.querySelector<HTMLButtonElement>('[data-act="filters"]');
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
  // Assigned when the map attaches; no-ops until then so filter/selection changes
  // before the map loads simply skip marker updates.
  let refreshMarkers: () => void = () => {};
  let reAddMarkers: () => void = () => {};

  // Apply the *effective* theme to the UI (class on <html>) and, once it exists,
  // the map. Reused by the settings segment and the live system-preference watch.
  const applyEffectiveTheme = (): void => {
    const dark = eff() === 'dark';
    // Theme class on <html> so the --bg token reaches <body> (iOS overscroll).
    document.documentElement.classList.toggle('theme-dark', dark);
    if (!map) return;
    // setStyle() drops our custom point source/layers. Rebuild the style, then
    // re-add markers once the new style is live (one-shot styledata listener).
    // If the map was never ready, initMarkers()'s 'load' handler covers it.
    if (mapReady) map.once('styledata', reAddMarkers);
    map.setStyle(buildStyle({ lang: store.get().mapLang, theme: eff(), pmtilesUrl }));
  };

  // When following the OS ('system'), re-apply live as the OS scheme flips.
  watchSystemTheme(() => {
    if (store.get().theme === 'system') applyEffectiveTheme();
  });

  // ── Settings button (top-right control, separate from the filters toolbar) ──
  const settingsBtn = settingsCtrl.querySelector<HTMLButtonElement>('[data-act="settings"]');
  const buildSettingsCtx = (): SettingsCtx => {
    const s = store.get();
    return {
      uiLang: s.uiLang,
      mapLang: s.mapLang,
      theme: s.theme,
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
        whenMapReady((m) => void setMapLangLazy(m, l));
      },
      setTheme: (pref) => {
        store.set({ theme: pref });
        saveTheme(pref);
        // Apply the resolved effective theme to <html> + the map style.
        applyEffectiveTheme();
      },
      setNavigator: (id) => {
        store.set({ navigator: id });
        saveNavigator(id);
      },
      onDataUpdated: async () => {
        // Re-read the freshly persisted dataset so the list + markers update
        // without a reload. applyFilters keeps the active filter applied.
        const locations = await loadLocations();
        store.set({ locations, filtered: applyFilters(locations, store.get().filter) });
        // Refresh an open card too (its data may have changed).
        if (store.get().selectedId != null) drawCard(store.get().selectedId!);
      },
      onMapUpdated: () => restoreStoredMap(),
      onPackageRemoved: async () => {
        // The stored map blob is gone — re-point the style at the network source
        // (range requests when online). resolvePmtilesUrl returns the network URL
        // now that no blob is present. Offline, tiles simply won't load until the
        // connection returns; the rest of the app keeps working. (Map only — the
        // thumbnail pack is independent; see onThumbsChanged.)
        if (!map) return;
        const { resolvePmtilesUrl } = await import('./offline/pmtiles-source');
        const src = await resolvePmtilesUrl(PMTILES_KEY);
        pmtilesUrl = src;
        if (mapReady) map.once('styledata', reAddMarkers);
        map.setStyle(buildStyle({ lang: store.get().mapLang, theme: eff(), pmtilesUrl: src }));
      },
      onThumbsChanged: () => {
        // The thumbnail pack was downloaded or deleted — redraw the list (and any
        // open card) so thumbnails re-resolve from the pack (blob: URLs) or the
        // online fallback. Lazy IntersectionObserver loading is preserved: a fresh
        // render re-arms the observers on the new <img> elements.
        drawList();
        if (store.get().selectedId != null) drawCard(store.get().selectedId!);
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

  // ── Load data + first render (BEFORE the map engine parses) ──
  try {
    const locations = await loadLocations();
    const filtered = applyFilters(locations, store.get().filter);
    store.set({ locations, filtered });
  } catch (e) {
    sheet.listView.innerHTML = `<div class="list-error">${toUserMessage(e)}</div>`;
    return;
  }

  // Wait for the thumbnail pack (hydrating since boot) so the first render resolves
  // thumbnails from the offline bundle instead of the online fallback — critical
  // offline, where the online fallback can't load. Cheap no-op when no pack exists.
  await thumbsReady;

  // Initial render — the list shows now, with the map engine not yet loaded.
  drawList();

  // ── Deep links (#id=NN) ──
  // Open the referenced location's card and fly to it (flyTo is queued until the
  // map is ready). Reused on hashchange so pasting/navigating to a share link
  // selects the place live.
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

  // ── Install hint + offline offer (independent of the map; shown promptly) ──
  // These banners don't need the map, so trigger them on the same timeline as
  // before — NOT gated behind the lazy map chunk — so they appear (and can be
  // dismissed) right after the list, before the engine finishes loading.
  initInstallHint();
  void maybeOfferOfflinePackage(async () => {
    // Map blob is now stored — re-point the map at the stored ('minsk') source so
    // it works offline (previously the offer only refreshed thumbnails). Then
    // redraw the list (and any open card) so thumbnails upgrade from the online
    // fallback to the offline bundle's object URLs. restoreStoredMap is assigned
    // by attachMapStack(); it has long since run by the time a download completes.
    await restoreStoredMap();
    drawList();
    if (store.get().selectedId != null) drawCard(store.get().selectedId!);
  });

  // ── Attach the map (lazy chunk) ──
  // Everything that pulls in MapLibre/pmtiles is imported here, after the first
  // paint, so the engine parses off the critical path. The list/card already work;
  // markers, tiles and map-language follow once this resolves.
  let setMapLangLazy: (m: maplibregl.Map, l: 'ru' | 'en') => void = () => {};
  await attachMapStack();

  // ─────────────────────────────────────────────────────────────────────────
  // Lazy map attach + wiring. Kept inside bootstrap() to close over store/map
  // helpers. The dynamic imports here form the MapLibre chunk boundary.
  // ─────────────────────────────────────────────────────────────────────────
  async function attachMapStack(): Promise<void> {
    const [
      { attachMap },
      { addMarkers, updateMarkers },
      { setMapLanguage },
      { getUserPosition },
      { useStoredPmtilesIfPresent },
    ] = await Promise.all([
      import('./ui/shell'),
      import('./map/markers'),
      import('./map/map'),
      import('./map/controls'),
      import('./offline/pmtiles-source'),
    ]);

    const handle = await attachMap(mapEl, {
      lang: store.get().mapLang,
      theme: eff(),
      // Show a visible toast when geolocation is denied/fails — on the first press
      // and every repeat (the message already carries the GEO-01 code).
      onGeoError: (message) => toast(message, { type: 'error' }),
    });
    map = handle.map;
    pmtilesUrl = handle.pmtilesUrl;
    setMapLangLazy = setMapLanguage;
    getUserPos = () => {
      const p = getUserPosition();
      return p ? { lat: p.lat, lng: p.lng } : null;
    };

    refreshMarkers = (): void => {
      if (!mapReady || !map) return;
      updateMarkers(map, store.get().filtered, onSelect);
    };
    // Re-add the points source/layers after a style swap. If the source somehow
    // survived (it normally won't), updateMarkers refreshes it instead of throwing.
    reAddMarkers = (): void => {
      if (!map) return;
      try {
        if (map.getSource('points')) updateMarkers(map, store.get().filtered, onSelect);
        else addMarkers(map, store.get().filtered, onSelect);
      } catch (e) {
        console.warn('[markers] re-add failed', e);
      }
    };

    // Re-point the map at the stored ('minsk') source and rebuild the style after
    // the map blob is downloaded (settings or boot-offer). setStyle drops our
    // custom point source/layers, so re-add markers once the new style is live.
    // Also pins pmtilesUrl to the stored source so later style rebuilds (theme
    // swaps) keep serving from IndexedDB.
    restoreStoredMap = async (): Promise<void> => {
      if (!map) return;
      const src = (await useStoredPmtilesIfPresent(PMTILES_KEY)) ?? pmtilesUrl;
      pmtilesUrl = src;
      if (mapReady) map.once('styledata', reAddMarkers);
      map.setStyle(buildStyle({ lang: store.get().mapLang, theme: eff(), pmtilesUrl: src }));
    };

    // Add markers once the style finishes loading; if it never does (no tiles in
    // dev), the list/card still work.
    const initMarkers = (): void => {
      mapReady = true;
      if (!map) return;
      try {
        addMarkers(map, store.get().filtered, onSelect);
      } catch (e) {
        console.warn('[markers] could not add to map', e);
      }
    };
    if (map.isStyleLoaded()) initMarkers();
    else map.once('load', initMarkers);

    // Drain any work queued before the map was ready (deep-link flyTo, card route).
    const m = map;
    const queued = onMapReady.splice(0);
    for (const fn of queued) fn(m);
  }
}

/**
 * If the map blob isn't stored yet and we're online, offer to download the
 * offline package. Shown once per session (a dismissable toast-style banner).
 * Running the download opens a progress overlay with retry-on-error.
 */
async function maybeOfferOfflinePackage(onDone: () => void | Promise<void>): Promise<void> {
  try {
    if ((await blobSize(PMTILES_KEY)) > 0) return; // already have the map
  } catch {
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const mb = Math.round((await pendingPackageBytes()) / (1024 * 1024));

  const run = (): void => {
    const overlay = progressOverlay();
    const start = (): void => {
      ensureOfflinePackage((p, label) => overlay.update(p, label))
        .then(async () => {
          overlay.close();
          toast(t('offline.done'));
          await onDone();
        })
        .catch((e) => {
          overlay.error(toUserMessage(e), { onRetry: start });
        });
    };
    start();
  };

  showOfferBanner(t('offline.offer', { n: mb }), run);
}

/** A dismissable bottom banner offering an action (download). */
function showOfferBanner(message: string, onAccept: () => void): void {
  document.querySelector('.offer-banner')?.remove();

  const banner = document.createElement('div');
  banner.className = 'offer-banner';
  banner.setAttribute('role', 'region');

  const text = document.createElement('span');
  text.className = 'offer-text';
  text.textContent = message;

  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'btn btn-primary offer-accept';
  accept.textContent = t('offline.offerDownload');
  accept.addEventListener('click', () => {
    banner.remove();
    onAccept();
  });

  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'offer-later';
  later.setAttribute('aria-label', t('offline.offerLater'));
  later.textContent = t('offline.offerLater');
  later.addEventListener('click', () => banner.remove());

  banner.append(text, accept, later);
  // Mount into the shared banner stack so the offer and the install banner stack
  // with a gap and never overlap, whichever appears first.
  addBanner(banner);
  requestAnimationFrame(() => banner.classList.add('offer-visible'));
}

bootstrap().catch((e) => {
  console.error('[bootstrap]', e);
  const root = document.getElementById('app');
  if (root) root.innerHTML = `<div class="list-error">${toUserMessage(e)}</div>`;
});
