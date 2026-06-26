import type { StyleSpecification, LayerSpecification } from '@maplibre/maplibre-gl-style-spec';

// Glyphs are served from the local public/fonts/ directory so they work offline
// and don't depend on an external server for the first render.
const GLYPHS_URL = import.meta.env.BASE_URL + 'fonts/{fontstack}/{range}.pbf';

export interface BuildStyleOpts {
  lang: 'ru' | 'en';
  theme: 'light' | 'dark';
  pmtilesUrl: string;
}

// Exported so map.ts can use for setMapLanguage
export const LABEL_LAYER_IDS = [
  'place-labels',
  'transportation-name-labels',
  'water-name-labels',
  'poi-labels',
];

const PALETTE = {
  light: {
    background: '#f2f0e6',
    water: '#aadaff',
    landcover: '#e0f0d8',
    park: '#c8e6c8',
    building: '#e0ddd5',
    buildingOutline: '#d0cdc5',
    road: '#ffffff',
    roadMotorway: '#ffcc66',
    roadTrunk: '#ffdd88',
    roadPrimary: '#ffe8aa',
    roadSecondary: '#ffffff',
    roadMinor: '#ffffff',
    roadService: '#f0eeea',
    boundary: '#aaaaaa',
    text: '#333333',
    textHalo: '#f2f0e6',
  },
  dark: {
    background: '#1b1b1f',
    water: '#16323f',
    landcover: '#1c2818',
    park: '#1e2e1e',
    building: '#26262b',
    buildingOutline: '#303035',
    road: '#2b2b30',
    roadMotorway: '#5a4000',
    roadTrunk: '#4a3800',
    roadPrimary: '#3a3000',
    roadSecondary: '#2b2b30',
    roadMinor: '#2b2b30',
    roadService: '#222228',
    boundary: '#555555',
    text: '#cfd3d6',
    textHalo: '#1b1b1f',
  },
};

function labelField(lang: 'ru' | 'en'): ['coalesce', ['get', string], ['get', 'name']] {
  return ['coalesce', ['get', `name:${lang}`], ['get', 'name']];
}

export function buildStyle(opts: BuildStyleOpts): StyleSpecification {
  const { lang, theme, pmtilesUrl } = opts;
  const p = PALETTE[theme];
  const tf = labelField(lang);

  const layers: LayerSpecification[] = [
    // Background
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': p.background },
    },

    // Water fill
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-color': p.water },
    },

    // Landcover
    {
      id: 'landcover',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      paint: { 'fill-color': p.landcover, 'fill-opacity': 0.5 },
    },

    // Landuse
    {
      id: 'landuse',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      paint: { 'fill-color': p.background, 'fill-opacity': 0.7 },
    },

    // Park
    {
      id: 'park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      paint: { 'fill-color': p.park },
    },

    // Building fill
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-color': p.building,
        'fill-outline-color': p.buildingOutline,
      },
    },

    // Transportation - road case (outline/casing)
    {
      id: 'transportation-case',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': p.boundary,
        'line-width': [
          'match', ['get', 'class'],
          'motorway', 8,
          'trunk', 7,
          'primary', 6,
          'secondary', 5,
          4,
        ] as unknown as number,
      },
    },

    // Transportation - road fill
    {
      id: 'transportation',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': [
          'match', ['get', 'class'],
          'motorway', p.roadMotorway,
          'trunk', p.roadTrunk,
          'primary', p.roadPrimary,
          'secondary', p.roadSecondary,
          'minor', p.roadMinor,
          'service', p.roadService,
          p.road,
        ] as unknown as string,
        'line-width': [
          'match', ['get', 'class'],
          'motorway', 6,
          'trunk', 5,
          'primary', 4,
          'secondary', 3,
          'minor', 2,
          'service', 1,
          1.5,
        ] as unknown as number,
      },
    },

    // Boundary
    {
      id: 'boundary',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      paint: {
        'line-color': p.boundary,
        'line-width': 1,
        'line-dasharray': [4, 2],
      },
    },

    // Place labels
    {
      id: 'place-labels',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      layout: {
        'text-field': tf as unknown as string,
        'text-font': ['Noto Sans Regular'],
        'text-size': [
          'match', ['get', 'class'],
          'city', 16,
          'town', 13,
          'village', 11,
          10,
        ],
        'text-max-width': 8,
        'symbol-sort-key': ['match', ['get', 'class'], 'city', 0, 'town', 1, 2],
      },
      paint: {
        'text-color': p.text,
        'text-halo-color': p.textHalo,
        'text-halo-width': 1.5,
      },
    },

    // Transportation name labels
    {
      id: 'transportation-name-labels',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 13,
      layout: {
        'text-field': tf as unknown as string,
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
        'symbol-placement': 'line',
        'text-max-width': 8,
      },
      paint: {
        'text-color': p.text,
        'text-halo-color': p.textHalo,
        'text-halo-width': 1,
      },
    },

    // Water name labels
    {
      id: 'water-name-labels',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'water_name',
      layout: {
        'text-field': tf as unknown as string,
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
      },
      paint: {
        'text-color': theme === 'light' ? '#3a7abb' : '#5a9adb',
        'text-halo-color': p.textHalo,
        'text-halo-width': 1,
      },
    },

    // POI labels
    {
      id: 'poi-labels',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 15,
      layout: {
        'text-field': tf as unknown as string,
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
        'text-max-width': 8,
        'text-anchor': 'top',
        'text-offset': [0, 0.5],
      },
      paint: {
        'text-color': p.text,
        'text-halo-color': p.textHalo,
        'text-halo-width': 1,
      },
    },
  ];

  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      openmaptiles: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        // Required credit for OpenMapTiles-schema tiles built from OSM data.
        attribution:
          '© <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      },
    },
    layers,
  };
}
