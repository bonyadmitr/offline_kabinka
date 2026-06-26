import './styles.css';
import type { Location, FilterState } from './core/types';
import { Store } from './core/store';
import { loadLocations } from './data/repository';
import { applyFilters, defaultFilter } from './data/filter';
import { addMarkers, updateMarkers } from './map/markers';
import { getUserPosition } from './map/controls';
import { mountShell } from './ui/shell';
import { renderList, type UserPos } from './ui/list';
import { renderCard } from './ui/card';
import { toUserMessage } from './core/errors';

interface AppState {
  locations: Location[];
  filtered: Location[];
  selectedId: number | null;
  filter: FilterState;
  uiLang: 'ru' | 'en';
  mapLang: 'ru' | 'en';
  theme: 'light' | 'dark';
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app not found');

  const store = new Store<AppState>({
    locations: [],
    filtered: [],
    selectedId: null,
    filter: defaultFilter(),
    uiLang: 'ru',
    mapLang: 'ru',
    theme: 'light',
  });

  // ── Shell + map ──
  const shell = mountShell(root, { lang: store.get().mapLang, theme: store.get().theme });
  const { map, sheet } = shell;

  // ── Helpers ──
  const userPos = (): UserPos | null => {
    const p = getUserPosition();
    return p ? { lat: p.lat, lng: p.lng } : null;
  };

  const onSelect = (id: number): void => store.set({ selectedId: id });

  const drawList = (): void => {
    renderList(sheet.listView, store.get().filtered, { userPos: userPos(), onSelect });
  };

  const drawCard = (id: number): void => {
    const loc = store.get().locations.find((l) => l.id === id);
    if (!loc) return;
    renderCard(sheet.cardView, loc, {
      onBack: () => store.set({ selectedId: null }),
      onRoute: (l) => console.info('[route] WU5 will wire this', l.id), // WU5 hook
      onShare: (l) => console.info('[share] WU5 will wire this', l.id), // WU5 hook
    });
  };

  // ── Subscriptions ──
  // Markers are only (re)drawn once the map style is ready; addSource/addLayer
  // throw otherwise. We track readiness so filter changes still update markers.
  let mapReady = false;
  const refreshMarkers = (): void => {
    if (!mapReady) return;
    updateMarkers(map, store.get().filtered, onSelect);
  };

  let prevFilter = store.get().filter;
  let prevSelected = store.get().selectedId;

  store.subscribe((s) => {
    // Filter changed → recompute filtered, redraw list + markers.
    if (s.filter !== prevFilter) {
      prevFilter = s.filter;
      store.set({ filtered: applyFilters(s.locations, s.filter) });
      return; // the set() above re-enters the subscriber with fresh `filtered`
    }

    // Selection changed → swap views.
    if (s.selectedId !== prevSelected) {
      prevSelected = s.selectedId;
      if (s.selectedId != null) {
        drawCard(s.selectedId);
        sheet.showCard();
      } else {
        sheet.showList();
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
