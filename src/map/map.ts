import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { LABEL_LAYER_IDS } from './style';

let registered = false;

export function registerPmtiles(): void {
  if (registered) return;
  const p = new Protocol();
  // pmtiles v4: Protocol.tile is V3OrV4Protocol — supports both MapLibre v3 callback
  // and MapLibre v4 AbortController-based API. We pass it directly.
  maplibregl.addProtocol('pmtiles', p.tile.bind(p));
  registered = true;
}

export function createMap(
  container: HTMLElement,
  style: maplibregl.StyleSpecification | string,
): maplibregl.Map {
  registerPmtiles();
  return new maplibregl.Map({
    container,
    style,
    center: [27.5667, 53.9023],
    zoom: 12,
    minZoom: 9,
    maxZoom: 16,
    maxBounds: [
      [27.30, 53.78],
      [27.78, 54.02],
    ],
    attributionControl: { compact: true },
  });
}

export function setMapLanguage(map: maplibregl.Map, lang: 'ru' | 'en'): void {
  const textField: maplibregl.ExpressionSpecification = [
    'coalesce',
    ['get', `name:${lang}`],
    ['get', 'name'],
  ];
  for (const id of LABEL_LAYER_IDS) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'text-field', textField);
    }
  }
}
