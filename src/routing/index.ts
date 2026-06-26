// Hybrid routing — two independent actions, neither blocks the other:
//
//  • "Open in navigator" (always available): hands off to Yandex Maps / Yandex
//    Navigator / Google / Apple via a deep link to the destination. When a user
//    position is known we pass both endpoints (start→finish); otherwise just the
//    finish and the navigator uses the device's current location. The first time,
//    we ask which navigator to use and remember the choice (saveNavigator); after
//    that we open straight away. Needs the internet / the navigator app.
//  • "Compass" (offline): draws a straight user→destination line on the map, fits
//    it in view, and shows distance + bearing with a device-compass arrow. Needs
//    a user position — if none is available we prompt for geolocation (onNeedGeo)
//    without blocking the navigator button.
//
// One compass session is active at a time. Re-opening the panel replaces it.
// "Hide route" tears down the source, layer, panel, and the orientation listener.

import type maplibregl from 'maplibre-gl';
import { haversine, bearing } from '../core/geo';
import { formatDistance } from '../ui/format';
import { loadNavigator, saveNavigator, hasChosenNavigator } from '../core/settings';
import type { NavigatorId } from '../ui/settings';
import { t } from '../i18n';

// ─── Deep-link builders (pure, exported, tested) ─────────────────────────────
//
// Each builder routes to `(lat,lng)`. When `from` is given, the route starts
// there (start→finish); otherwise the navigator picks the current location.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Google Maps walking directions to a point (optionally from a given origin). */
export function googleUrl(lat: number, lng: number, from?: LatLng): string {
  const origin = from ? `&origin=${from.lat},${from.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${lat},${lng}&travelmode=walking`;
}

/** Yandex Maps pedestrian route to a point (optionally from a given origin). */
export function yandexUrl(lat: number, lng: number, from?: LatLng): string {
  const rtext = from ? `${from.lat},${from.lng}~${lat},${lng}` : `~${lat},${lng}`;
  return `https://yandex.by/maps/?rtext=${rtext}&rtt=pd`;
}

/** Yandex Navigator app deep link (build route on map; optional explicit origin). */
export function yandexNaviUrl(lat: number, lng: number, from?: LatLng): string {
  const origin = from ? `&lat_from=${from.lat}&lon_from=${from.lng}` : '';
  return `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}${origin}`;
}

/** Apple Maps walking directions to a point (optionally from a given origin). */
export function appleUrl(lat: number, lng: number, from?: LatLng): string {
  const origin = from ? `&saddr=${from.lat},${from.lng}` : '';
  return `https://maps.apple.com/?daddr=${lat},${lng}${origin}&dirflg=w`;
}

/** Build the navigator URL for the given provider (optional explicit origin). */
export function navigatorUrl(id: NavigatorId, lat: number, lng: number, from?: LatLng): string {
  switch (id) {
    case 'yandex_maps':
      return yandexUrl(lat, lng, from);
    case 'yandex_navi':
      return yandexNaviUrl(lat, lng, from);
    case 'google':
      return googleUrl(lat, lng, from);
    case 'apple':
      return appleUrl(lat, lng, from);
    default:
      return yandexUrl(lat, lng, from);
  }
}

/** Open a navigator: app deep links via location.href, web URLs in a new tab. */
function openNavigator(id: NavigatorId, lat: number, lng: number, from?: LatLng): void {
  const url = navigatorUrl(id, lat, lng, from);
  if (url.startsWith('http')) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    // Custom-scheme deep link (e.g. yandexnavi://) — navigate the current page.
    window.location.href = url;
  }
}

const NAV_IDS: NavigatorId[] = ['yandex_maps', 'yandex_navi', 'google', 'apple'];
const NAV_LABEL_KEY: Record<NavigatorId, Parameters<typeof t>[0]> = {
  yandex_maps: 'settings.navYandexMaps',
  yandex_navi: 'settings.navYandexNavi',
  google: 'settings.navGoogle',
  apple: 'settings.navApple',
};

// ─── Map line ────────────────────────────────────────────────────────────────

const ROUTE_SOURCE = 'route';
const ROUTE_LAYER = 'route-line';

type LngLat = [number, number];

interface RouteGeoJson {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'LineString'; coordinates: LngLat[] };
    properties: Record<string, never>;
  }>;
}

function lineGeoJson(a: LngLat, b: LngLat): RouteGeoJson {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [a, b] },
        properties: {},
      },
    ],
  };
}

function drawLine(map: maplibregl.Map, user: LngLat, dest: LngLat): void {
  const data = lineGeoJson(user, dest) as unknown as maplibregl.GeoJSONSourceSpecification['data'];
  const existing = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data as never);
    return;
  }
  map.addSource(ROUTE_SOURCE, { type: 'geojson', data: data as never });
  map.addLayer({
    id: ROUTE_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#2f6fd0',
      'line-width': 4,
      'line-opacity': 0.85,
      'line-dasharray': [2, 1.5],
    },
  });
}

function removeLine(map: maplibregl.Map): void {
  try {
    if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER);
    if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
  } catch {
    /* style may have been swapped; ignore */
  }
}

// ─── Route session (panel + compass) ─────────────────────────────────────────

export interface StartRouteOpts {
  /** Current user position, or null if not yet acquired. */
  getUserPos: () => { lat: number; lng: number } | null;
  /** Called when the compass needs a user position so the caller can prompt for geo. */
  onNeedGeo: () => void;
}

interface ActiveRoute {
  panel: HTMLElement;
  onOrient?: (e: DeviceOrientationEvent) => void;
  map: maplibregl.Map;
  /** Whether the offline compass line/arrow is currently shown. */
  compassOn: boolean;
}

let active: ActiveRoute | null = null;
// iOS gates DeviceOrientation behind a one-time permission prompt; remember the result.
let orientationPermission: 'unknown' | 'granted' | 'denied' = 'unknown';

/** True when the browser exposes a device-orientation API we can use. */
function hasOrientation(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

interface IOSOrientationCtor {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** Ask for orientation permission on iOS (no-op elsewhere). Must run from a user gesture. */
async function ensureOrientationPermission(): Promise<boolean> {
  if (!hasOrientation()) return false;
  const ctor = window.DeviceOrientationEvent as unknown as IOSOrientationCtor;
  if (typeof ctor.requestPermission !== 'function') return true; // non-iOS: granted implicitly
  if (orientationPermission === 'granted') return true;
  if (orientationPermission === 'denied') return false;
  try {
    const res = await ctor.requestPermission();
    orientationPermission = res;
    return res === 'granted';
  } catch {
    orientationPermission = 'denied';
    return false;
  }
}

/** Compass heading from an orientation event (degrees clockwise from north), or null. */
function headingOf(e: DeviceOrientationEvent): number | null {
  // iOS exposes webkitCompassHeading (already true-north, clockwise).
  const webkit = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
  if (typeof webkit === 'number' && !Number.isNaN(webkit)) return webkit;
  // Others: alpha is counter-clockwise from north → convert.
  if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) return (360 - e.alpha) % 360;
  return null;
}

function fmtBearing(deg: number): string {
  return `${Math.round(deg)}°`;
}

/**
 * Open (or replace) the route panel for `loc`. Shows two independent actions —
 * "Open in navigator" (always) and "Compass" (offline line, needs geolocation).
 * Safe to call repeatedly. The compass is *not* started automatically; it begins
 * only when the user taps "Compass" (and a position is available).
 */
export function startRoute(
  map: maplibregl.Map,
  loc: { latitude: number; longitude: number; title?: string },
  opts: StartRouteOpts,
): void {
  // Replace any existing route panel/line.
  hideRoute(map);

  const dest: LngLat = [loc.longitude, loc.latitude];

  const panel = buildPanel(map, loc, dest, opts);
  map.getContainer().appendChild(panel);

  active = { panel, map, compassOn: false };
}

/** Remove the active route's line, panel, and orientation listener. */
export function hideRoute(map: maplibregl.Map): void {
  removeLine(map);
  if (active) {
    if (active.onOrient) window.removeEventListener('deviceorientation', active.onOrient);
    active.panel.remove();
    active = null;
  }
}

/**
 * Turn on the offline compass for the current panel: draw the user→dest line, fit
 * it in view, and (best-effort) animate the heading arrow. Requires a user
 * position; if none, prompts for geolocation and returns false without blocking
 * the navigator action.
 */
function startCompass(
  map: maplibregl.Map,
  loc: { latitude: number; longitude: number },
  dest: LngLat,
  opts: StartRouteOpts,
  panel: HTMLElement,
): void {
  const user = opts.getUserPos();
  if (!user) {
    opts.onNeedGeo();
    return;
  }

  const userLngLat: LngLat = [user.lng, user.lat];

  // ── Offline line ──
  const draw = (): void => {
    drawLine(map, userLngLat, dest);
    try {
      map.fitBounds([userLngLat, dest], { padding: 64, maxZoom: 16, duration: 500 });
    } catch {
      /* fitBounds can throw before the map has a size in tests; ignore */
    }
  };
  if (map.isStyleLoaded()) draw();
  else map.once('load', draw);

  // ── Metrics ──
  const dist = haversine(user.lat, user.lng, loc.latitude, loc.longitude);
  const brng = bearing(user.lat, user.lng, loc.latitude, loc.longitude);

  // Reveal the compass readout block and fill it.
  const readout = panel.querySelector<HTMLElement>('.route-compass');
  if (readout) {
    readout.hidden = false;
    const distEl = readout.querySelector<HTMLElement>('.route-dist');
    const brngEl = readout.querySelector<HTMLElement>('.route-brng');
    if (distEl) distEl.textContent = formatDistance(dist);
    if (brngEl) brngEl.textContent = `${t('route.bearing')} ${fmtBearing(brng)}`;
  }

  if (active) active.compassOn = true;

  // ── Compass arrow (best-effort) ──
  const arrow = panel.querySelector<HTMLElement>('.route-arrow');
  if (arrow && hasOrientation()) {
    void ensureOrientationPermission().then((granted) => {
      if (!granted || !active || active.panel !== panel) {
        arrow?.classList.add('route-arrow-off');
        return;
      }
      arrow.classList.remove('route-arrow-off');
      const onOrient = (e: DeviceOrientationEvent): void => {
        const heading = headingOf(e);
        if (heading == null) return;
        // Rotation that points the arrow at the destination relative to where the
        // device is facing.
        arrow.style.transform = `rotate(${brng - heading}deg)`;
      };
      window.addEventListener('deviceorientation', onOrient);
      if (active) active.onOrient = onOrient;
    });
  } else if (arrow) {
    arrow.classList.add('route-arrow-off');
  }
}

function buildPanel(
  map: maplibregl.Map,
  loc: { latitude: number; longitude: number },
  dest: LngLat,
  opts: StartRouteOpts,
): HTMLElement {
  const [lng, lat] = dest;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const panel = document.createElement('div');
  panel.className = 'route-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', t('route.title'));

  // ── Action: Open in navigator (always available) ──
  const navBtn = document.createElement('button');
  navBtn.type = 'button';
  navBtn.className = 'btn btn-primary route-action route-action-nav';
  navBtn.innerHTML = `<span aria-hidden="true">🗺️</span> ${escText(t('route.openInNavigator'))}`;
  navBtn.addEventListener('click', () => {
    const from = opts.getUserPos();
    chooseNavigatorThen(panel, (id) => openNavigator(id, lat, lng, from ?? undefined));
  });
  panel.appendChild(navBtn);

  // "Change navigator" — only meaningful once one is remembered.
  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.className = 'route-change-nav';
  changeBtn.hidden = !hasChosenNavigator();
  changeBtn.textContent = t('route.changeNavigator');
  changeBtn.addEventListener('click', () => {
    showNavigatorPicker(panel, (id) => {
      saveNavigator(id);
      const from = opts.getUserPos();
      openNavigator(id, lat, lng, from ?? undefined);
    });
  });
  panel.appendChild(changeBtn);

  // Inline navigator picker host (shown on first use / "change").
  const picker = document.createElement('div');
  picker.className = 'route-nav-picker';
  picker.hidden = true;
  panel.appendChild(picker);

  if (offline) {
    const notice = document.createElement('div');
    notice.className = 'route-offline';
    notice.textContent = t('route.navOfflineNotice');
    panel.appendChild(notice);
  }

  // ── Action: Compass (offline; needs geolocation) ──
  const compassBtn = document.createElement('button');
  compassBtn.type = 'button';
  compassBtn.className = 'btn btn-secondary route-action route-action-compass';
  compassBtn.innerHTML = `<span aria-hidden="true">🧭</span> ${escText(t('route.compass'))}`;
  compassBtn.addEventListener('click', () => {
    startCompass(map, loc, dest, opts, panel);
  });
  panel.appendChild(compassBtn);

  // ── Compass readout (hidden until the compass is started) ──
  const compass = document.createElement('div');
  compass.className = 'route-compass';
  compass.hidden = true;
  compass.innerHTML = `
    <span class="route-arrow route-arrow-off" aria-hidden="true">↑</span>
    <span class="route-metrics">
      <span class="route-dist"></span>
      <span class="route-brng"></span>
    </span>`;
  panel.appendChild(compass);

  // ── Hide route ──
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'route-hide';
  hide.textContent = t('route.hideRoute');
  hide.addEventListener('click', () => hideRoute(map));
  panel.appendChild(hide);

  return panel;
}

/**
 * Resolve the navigator to open with. If one was explicitly chosen before, open
 * straight away. Otherwise show the inline picker, persist the pick, then open.
 */
function chooseNavigatorThen(panel: HTMLElement, open: (id: NavigatorId) => void): void {
  if (hasChosenNavigator()) {
    open(loadNavigator());
    return;
  }
  showNavigatorPicker(panel, (id) => {
    saveNavigator(id);
    // Reveal the "change navigator" affordance now that one is remembered.
    panel.querySelector<HTMLElement>('.route-change-nav')?.removeAttribute('hidden');
    open(id);
  });
}

/** Render the inline navigator picker inside the panel; calls `onPick` on choice. */
function showNavigatorPicker(panel: HTMLElement, onPick: (id: NavigatorId) => void): void {
  const host = panel.querySelector<HTMLElement>('.route-nav-picker');
  if (!host) return;
  host.replaceChildren();
  host.hidden = false;

  const label = document.createElement('div');
  label.className = 'route-nav-picker-label';
  label.textContent = t('route.pickNavigator');
  host.appendChild(label);

  const row = document.createElement('div');
  row.className = 'route-nav-btns';
  for (const id of NAV_IDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'route-nav-btn';
    b.textContent = t(NAV_LABEL_KEY[id]);
    b.addEventListener('click', () => {
      host.hidden = true;
      host.replaceChildren();
      onPick(id);
    });
    row.appendChild(b);
  }
  host.appendChild(row);
}

/** Minimal text escaper for the few interpolated strings above. */
function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
