// Hybrid routing.
//
//  • Offline (always): draw a straight user→destination line on the map, fit it
//    in view, and show a panel with great-circle distance + bearing. A device
//    compass arrow (when available) points at the destination.
//  • Online (deep links): "Open in navigator" buttons hand off to Yandex Maps /
//    Yandex Navigator / Google / Apple. When offline, we say so but keep the line.
//
// One route is active at a time. Re-calling startRoute replaces it. "Hide route"
// tears down the source, layer, panel, and the orientation listener.

import type maplibregl from 'maplibre-gl';
import { haversine, bearing } from '../core/geo';
import { formatDistance } from '../ui/format';
import { loadNavigator } from '../core/settings';
import type { NavigatorId } from '../ui/settings';
import { t } from '../i18n';

// ─── Deep-link builders (pure, exported, tested) ─────────────────────────────

/** Google Maps walking directions to a point. */
export function googleUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}

/** Yandex Maps pedestrian route to a point (from current location). */
export function yandexUrl(lat: number, lng: number): string {
  return `https://yandex.by/maps/?rtext=~${lat},${lng}&rtt=pd`;
}

/** Yandex Navigator app deep link (build route on map). */
export function yandexNaviUrl(lat: number, lng: number): string {
  return `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`;
}

/** Apple Maps walking directions to a point. */
export function appleUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`;
}

/** Build the navigator URL for the given provider. */
export function navigatorUrl(id: NavigatorId, lat: number, lng: number): string {
  switch (id) {
    case 'yandex_maps':
      return yandexUrl(lat, lng);
    case 'yandex_navi':
      return yandexNaviUrl(lat, lng);
    case 'google':
      return googleUrl(lat, lng);
    case 'apple':
      return appleUrl(lat, lng);
    default:
      return yandexUrl(lat, lng);
  }
}

/** Open a navigator: app deep links via location.href, web URLs in a new tab. */
function openNavigator(id: NavigatorId, lat: number, lng: number): void {
  const url = navigatorUrl(id, lat, lng);
  if (url.startsWith('http')) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    // Custom-scheme deep link (e.g. yandexnavi://) — navigate the current page.
    window.location.href = url;
  }
}

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
  /** Called when no user position is available so the caller can prompt for geo. */
  onNeedGeo: () => void;
}

interface ActiveRoute {
  panel: HTMLElement;
  onOrient?: (e: DeviceOrientationEvent) => void;
  map: maplibregl.Map;
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
 * Start (or replace) the hybrid route to `loc`. Always draws the offline line +
 * info panel; adds a compass arrow when orientation is available; offers navigator
 * deep links (gated on connectivity). Safe to call repeatedly.
 */
export function startRoute(
  map: maplibregl.Map,
  loc: { latitude: number; longitude: number; title?: string },
  opts: StartRouteOpts,
): void {
  const user = opts.getUserPos();
  if (!user) {
    opts.onNeedGeo();
    return;
  }

  // Replace any existing route.
  hideRoute(map);

  const dest: LngLat = [loc.longitude, loc.latitude];
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

  // ── Info panel ──
  const dist = haversine(user.lat, user.lng, loc.latitude, loc.longitude);
  const brng = bearing(user.lat, user.lng, loc.latitude, loc.longitude);

  const panel = buildPanel(map, dest, dist, brng);
  map.getContainer().appendChild(panel);

  active = { panel, map };

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

/** Remove the active route's line, panel, and orientation listener. */
export function hideRoute(map: maplibregl.Map): void {
  removeLine(map);
  if (active) {
    if (active.onOrient) window.removeEventListener('deviceorientation', active.onOrient);
    active.panel.remove();
    active = null;
  }
}

function buildPanel(
  map: maplibregl.Map,
  dest: LngLat,
  dist: number,
  brng: number,
): HTMLElement {
  const [lng, lat] = dest;

  const panel = document.createElement('div');
  panel.className = 'route-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', t('route.title'));

  // Header: distance + bearing + compass arrow.
  const head = document.createElement('div');
  head.className = 'route-head';
  head.innerHTML = `
    <span class="route-arrow" aria-hidden="true">↑</span>
    <span class="route-metrics">
      <span class="route-dist">${escText(formatDistance(dist))}</span>
      <span class="route-brng">${escText(t('route.bearing'))} ${escText(fmtBearing(brng))}</span>
    </span>`;
  panel.appendChild(head);

  // Navigator buttons.
  const navWrap = document.createElement('div');
  navWrap.className = 'route-navs';

  const navLabel = document.createElement('div');
  navLabel.className = 'route-navs-label';
  navLabel.textContent = t('route.openInNavigator');
  navWrap.appendChild(navLabel);

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline) {
    const notice = document.createElement('div');
    notice.className = 'route-offline';
    notice.textContent = t('route.offlineNotice');
    navWrap.appendChild(notice);
  }

  const btnRow = document.createElement('div');
  btnRow.className = 'route-nav-btns';
  const def = loadNavigator();
  const ids: NavigatorId[] = ['yandex_maps', 'yandex_navi', 'google', 'apple'];
  const labelKey: Record<NavigatorId, Parameters<typeof t>[0]> = {
    yandex_maps: 'settings.navYandexMaps',
    yandex_navi: 'settings.navYandexNavi',
    google: 'settings.navGoogle',
    apple: 'settings.navApple',
  };
  // Default navigator first, then the rest.
  for (const id of [def, ...ids.filter((i) => i !== def)]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'route-nav-btn' + (id === def ? ' is-default' : '');
    b.textContent = t(labelKey[id]);
    b.addEventListener('click', () => openNavigator(id, lat, lng));
    btnRow.appendChild(b);
  }
  navWrap.appendChild(btnRow);
  panel.appendChild(navWrap);

  // Hide route.
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'route-hide';
  hide.textContent = t('route.hideRoute');
  hide.addEventListener('click', () => hideRoute(map));
  panel.appendChild(hide);

  return panel;
}

/** Minimal text escaper for the few interpolated strings above. */
function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
