import maplibregl from 'maplibre-gl';
import type { Location } from '../core/types';
import type { GeoJSONSourceSpecification } from '@maplibre/maplibre-gl-style-spec';
import { t } from '../i18n';
import { buildPickList, type PickItem } from './pick-list';

export { buildPickList, type PickItem } from './pick-list';

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: Record<string, unknown>;
  }>;
}

const SOURCE_ID = 'points';
const LAYER_CLUSTERS = 'clusters';
const LAYER_CLUSTER_COUNT = 'cluster-count';
const LAYER_UNCLUSTERED = 'unclustered';
const LAYER_RATING = 'point-rating';

/** Price-type colours matching brand palette */
const PRICE_COLOR_EXPR: maplibregl.ExpressionSpecification = [
  'match', ['get', 'price_type'],
  'free', '#2e9e5b',
  'conditional_free', '#2f6fd0',
  'paid', '#7a3fb0',
  /* default */ '#2e9e5b',
];

/** CSS class on the colour dot, so the picker dot tracks the (theme-aware) palette. */
function priceDotClass(priceType: unknown): string {
  switch (priceType) {
    case 'paid':
      return 'price-paid';
    case 'conditional_free':
      return 'price-conditional';
    case 'free':
    default:
      return 'price-free';
  }
}

function locationsToGeojson(locations: Location[]): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: locations.map((loc) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [loc.longitude, loc.latitude] as [number, number],
      },
      properties: {
        id: loc.id,
        title: loc.title,
        price_type: loc.price_type,
        rating: loc.rating_overall ?? 0,
      },
    })),
  };
}

// Only one picker popup at a time; reused across clicks.
let activePicker: maplibregl.Popup | null = null;

function closePicker(): void {
  if (activePicker) {
    activePicker.remove();
    activePicker = null;
  }
}

/**
 * Open a MapLibre popup listing `items` at `coords`, letting the user pick one of
 * several points sharing the same spot. Each row: colour dot (by price_type) +
 * title; large tap targets; scrolls when long; keyboard + screen-reader friendly.
 */
function openPicker(
  map: maplibregl.Map,
  coords: [number, number],
  items: PickItem[],
  onSelect: (id: number) => void,
): void {
  closePicker();

  const root = document.createElement('div');
  root.className = 'point-picker';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t('map.pickTitle'));

  const heading = document.createElement('div');
  heading.className = 'point-picker__title';
  heading.textContent = t('map.pickTitle');

  const list = document.createElement('ul');
  list.className = 'point-picker__list';
  list.setAttribute('role', 'list');

  for (const item of items) {
    const li = document.createElement('li');
    li.setAttribute('role', 'listitem');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'point-picker__item';

    const dot = document.createElement('span');
    dot.className = `point-picker__dot ${priceDotClass(item.priceType)}`;
    dot.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'point-picker__label';
    label.textContent = item.title;

    btn.append(dot, label);
    btn.addEventListener('click', () => {
      onSelect(item.id);
      closePicker();
      map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 16) });
    });

    li.appendChild(btn);
    list.appendChild(li);
  }

  root.append(heading, list);

  const popup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    maxWidth: '280px',
    className: 'point-picker-popup',
  })
    .setLngLat(coords)
    .setDOMContent(root)
    .addTo(map);

  popup.on('close', () => {
    if (activePicker === popup) activePicker = null;
  });

  // Focus the first choice so keyboard users land inside the list.
  requestAnimationFrame(() => {
    root.querySelector<HTMLButtonElement>('.point-picker__item')?.focus();
  });

  activePicker = popup;
}

function addLayers(map: maplibregl.Map, onSelect: (id: number) => void): void {
  // Cluster circles
  map.addLayer({
    id: LAYER_CLUSTERS,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step', ['get', 'point_count'],
        '#51bbd6',
        10, '#f1f075',
        50, '#f28cb1',
      ] as unknown as string,
      'circle-radius': [
        'step', ['get', 'point_count'],
        18,
        10, 24,
        50, 30,
      ] as unknown as number,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  // Cluster count labels
  map.addLayer({
    id: LAYER_CLUSTER_COUNT,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
    },
    paint: {
      'text-color': '#333333',
    },
  });

  // Individual (unclustered) point circles
  map.addLayer({
    id: LAYER_UNCLUSTERED,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 14,
      'circle-color': PRICE_COLOR_EXPR,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  // Rating label on each individual point
  map.addLayer({
    id: LAYER_RATING,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'text-field': [
        'case',
        ['>', ['get', 'rating'], 0],
        ['number-format', ['get', 'rating'], { 'max-fraction-digits': 1 }],
        '',
      ] as unknown as string,
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
    },
    paint: {
      'text-color': '#ffffff',
    },
  });

  // Click unclustered → open the card, unless several points overlap under the
  // tap (same/near-identical coords). In that case show the picker instead so
  // each one is reachable.
  map.on('click', LAYER_UNCLUSTERED, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;

    // Re-query at the exact click point: MapLibre hands us every rendered
    // unclustered feature whose circle covers the pixel, so overlapping markers
    // all come back here.
    const overlapping = map.queryRenderedFeatures(e.point, { layers: [LAYER_UNCLUSTERED] });
    const items = buildPickList(overlapping.length > 0 ? overlapping : [feature]);

    if (items.length > 1) {
      const geometry = feature.geometry as { type: 'Point'; coordinates: [number, number] };
      openPicker(map, geometry.coordinates, items, onSelect);
      return;
    }

    const id = feature.properties?.id as number;
    if (id != null) onSelect(id);
  });

  // Click cluster → either zoom in (if that actually pulls the points apart) or,
  // when the points are co-located / already at max zoom and won't separate,
  // show the picker so each underlying point is selectable.
  map.on('click', LAYER_CLUSTERS, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const clusterId = feature.properties?.cluster_id as number;
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
    const geometry = feature.geometry as { type: 'Point'; coordinates: [number, number] };
    const coords = geometry.coordinates;

    src.getClusterExpansionZoom(clusterId)
      .then((zoom) => {
        const willSeparate = zoom > map.getZoom() && zoom <= map.getMaxZoom();
        if (willSeparate) {
          map.easeTo({ center: coords, zoom });
          return;
        }
        // Won't break apart any further — list the leaves and let the user pick.
        return src.getClusterLeaves(clusterId, Infinity, 0).then((leaves) => {
          const items = buildPickList(leaves);
          if (items.length > 1) {
            openPicker(map, coords, items, onSelect);
          } else if (items.length === 1) {
            onSelect(items[0].id);
          }
        });
      })
      .catch(() => {/* ignore */});
  });

  // Pointer cursor for interactive layers
  map.on('mouseenter', LAYER_UNCLUSTERED, () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', LAYER_UNCLUSTERED, () => {
    map.getCanvas().style.cursor = '';
  });
  map.on('mouseenter', LAYER_CLUSTERS, () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', LAYER_CLUSTERS, () => {
    map.getCanvas().style.cursor = '';
  });
}

export function addMarkers(
  map: maplibregl.Map,
  locations: Location[],
  onSelect: (id: number) => void,
): void {
  const geojson = locationsToGeojson(locations);

  const sourceSpec: GeoJSONSourceSpecification = {
    type: 'geojson',
    data: geojson as unknown as string,
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 14,
  };

  map.addSource(SOURCE_ID, sourceSpec);
  addLayers(map, onSelect);
}

export function updateMarkers(
  map: maplibregl.Map,
  locations: Location[],
  onSelect: (id: number) => void,
): void {
  const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!src) {
    addMarkers(map, locations, onSelect);
    return;
  }
  // A stale picker may reference points that no longer exist after a filter change.
  closePicker();
  const geojson = locationsToGeojson(locations);
  src.setData(geojson as unknown as string);
}
