import maplibregl from 'maplibre-gl';
import type { Location } from '../core/types';
import type { GeoJSONSourceSpecification } from '@maplibre/maplibre-gl-style-spec';

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
        price_type: loc.price_type,
        rating: loc.rating_overall ?? 0,
      },
    })),
  };
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

  // Click unclustered → onSelect
  map.on('click', LAYER_UNCLUSTERED, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const id = feature.properties?.id as number;
    if (id != null) onSelect(id);
  });

  // Click cluster → zoom in to expansion zoom
  map.on('click', LAYER_CLUSTERS, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const clusterId = feature.properties?.cluster_id as number;
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
    src.getClusterExpansionZoom(clusterId).then((zoom) => {
      const geometry = feature.geometry as { type: 'Point'; coordinates: [number, number] };
      map.easeTo({
        center: geometry.coordinates,
        zoom,
      });
    }).catch(() => {/* ignore */});
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
  const geojson = locationsToGeojson(locations);
  src.setData(geojson as unknown as string);
}
