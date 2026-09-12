import maplibregl from 'maplibre-gl';
import { AppError } from '../core/errors';
import { t } from '../i18n';
import '../styles.css';

// ─── Zoom controls ───────────────────────────────────────────────────────────

export function addZoomControls(map: maplibregl.Map, container: HTMLElement): void {
  const wrapper = document.createElement('div');
  wrapper.className = 'map-ctrl-zoom';

  const zoomIn = document.createElement('button');
  zoomIn.type = 'button';
  zoomIn.className = 'map-ctrl-btn';
  zoomIn.setAttribute('aria-label', t('map.zoomIn'));
  zoomIn.textContent = '+';
  zoomIn.addEventListener('click', () => map.zoomIn());

  const zoomOut = document.createElement('button');
  zoomOut.type = 'button';
  zoomOut.className = 'map-ctrl-btn';
  zoomOut.setAttribute('aria-label', t('map.zoomOut'));
  zoomOut.textContent = '−';
  zoomOut.addEventListener('click', () => map.zoomOut());

  wrapper.appendChild(zoomIn);
  wrapper.appendChild(zoomOut);
  container.appendChild(wrapper);
}

// ─── Geolocation control ─────────────────────────────────────────────────────

interface GeolocateOpts {
  onError?: (e: AppError) => void;
}

interface UserPosition {
  lng: number;
  lat: number;
  accuracy: number;
}

const USER_SOURCE = 'user';
const USER_CIRCLE_LAYER = 'user-circle';
const USER_ACCURACY_LAYER = 'user-accuracy';

let _lastPosition: UserPosition | null = null;

/** Returns the most recent geolocation position, or null if not yet acquired. */
export function getUserPosition(): UserPosition | null {
  return _lastPosition;
}

function ensureUserLayers(map: maplibregl.Map): void {
  if (!map.getSource(USER_SOURCE)) {
    map.addSource(USER_SOURCE, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      } as unknown as string,
    });

    // Accuracy circle (in meters → use a large circle-radius expression or a polygon)
    // We render accuracy as a second circle with opacity behind the dot.
    map.addLayer({
      id: USER_ACCURACY_LAYER,
      type: 'circle',
      source: USER_SOURCE,
      filter: ['==', ['get', 'type'], 'accuracy'],
      paint: {
        'circle-radius': ['get', 'radius'] as unknown as number,
        'circle-color': '#2f6fd0',
        'circle-opacity': 0.12,
        'circle-stroke-color': '#2f6fd0',
        'circle-stroke-width': 1,
        'circle-stroke-opacity': 0.4,
      },
    });

    // User dot
    map.addLayer({
      id: USER_CIRCLE_LAYER,
      type: 'circle',
      source: USER_SOURCE,
      filter: ['==', ['get', 'type'], 'dot'],
      paint: {
        'circle-radius': 8,
        'circle-color': '#2f6fd0',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  }
}

function updateUserLayers(
  map: maplibregl.Map,
  lng: number,
  lat: number,
  accuracy: number,
): void {
  ensureUserLayers(map);

  // Convert accuracy in meters to approximate pixels at current zoom for circle-radius.
  // We store accuracy in meters in the property and apply a rough meter→pixel conversion
  // using map.project. Accuracy circle pixel radius = accuracy_m / meters_per_pixel.
  const center = map.project([lng, lat]);
  const offset = map.project([lng, lat + (accuracy / 111320)]);
  const radiusPx = Math.abs(offset.y - center.y);

  const src = map.getSource(USER_SOURCE) as maplibregl.GeoJSONSource;
  src.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { type: 'accuracy', radius: radiusPx },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { type: 'dot' },
      },
    ],
  } as unknown as string);
}

export function addGeolocate(map: maplibregl.Map, opts: GeolocateOpts): void {
  const container = map.getContainer();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'map-ctrl-btn map-ctrl-geolocate';
  btn.setAttribute('aria-label', t('map.myLocation'));
  btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
    <path d="M12 2l0 0"/>
  </svg>`;

  const onPosition = (pos: GeolocationPosition): void => {
    const { longitude: lng, latitude: lat, accuracy } = pos.coords;
    _lastPosition = { lng, lat, accuracy };

    // Wait for map style to be ready before adding layers
    const doUpdate = (): void => updateUserLayers(map, lng, lat, accuracy);
    if (map.isStyleLoaded()) {
      doUpdate();
    } else {
      map.once('load', doUpdate);
    }

    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15) });
    btn.classList.add('active');
  };

  const onFailure = (err: GeolocationPositionError): void => {
    // 1 = permission denied (user action required), 2/3 = unavailable/timeout (retry-able).
    const code = err.code === err.PERMISSION_DENIED ? 'GEO-02' : 'GEO-03';
    opts.onError?.(new AppError(code, err));
    btn.classList.remove('active');
  };

  btn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      opts.onError?.(new AppError('GEO-01', new Error('Geolocation not supported')));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      onPosition,
      (err) => {
        // High-accuracy (GPS) can time out indoors or on desktop. Fall back once to a
        // coarse, cache-friendly fix before surfacing the error to the user.
        if (err.code === err.TIMEOUT) {
          navigator.geolocation.getCurrentPosition(onPosition, onFailure, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000,
          });
        } else {
          onFailure(err);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });

  container.appendChild(btn);
}
