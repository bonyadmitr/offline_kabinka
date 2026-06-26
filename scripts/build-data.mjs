#!/usr/bin/env node
/**
 * build-data.mjs — unified data update script for offline_kabinka.
 *
 * Steps:
 *   1) GET /locations?lat=53.9&lng=27.56&radius=50000&per_page=500 → summary list
 *   2) For each location: GET /locations/{id} (detail) + GET /locations/{id}/comments
 *   3) Merge detail + summary, inline comments, build photos[].{remote,url,thumb}
 *   4) Write to OUT (default: public/data/locations.json)
 *
 * Env vars:
 *   LIMIT   — process only first N locations (for testing)
 *   OUT     — output path (default: public/data/locations.json)
 *
 * Usage:
 *   node scripts/build-data.mjs
 *   LIMIT=3 OUT=public/data/_sample.json node scripts/build-data.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_BASE = 'https://kabinka.by/api/v1';
const DEVICE_ID_FILE = resolve(__dirname, '.device_id');
const DEFAULT_OUT = resolve(PROJECT_ROOT, 'public/data/locations.json');
const DELAY_MS = 80;

const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const OUT = process.env.OUT ? resolve(PROJECT_ROOT, process.env.OUT) : DEFAULT_OUT;

// ---------------------------------------------------------------------------
// Device ID
// ---------------------------------------------------------------------------
function getDeviceId() {
  if (existsSync(DEVICE_ID_FILE)) {
    return readFileSync(DEVICE_ID_FILE, 'utf8').trim();
  }
  const id = randomUUID();
  writeFileSync(DEVICE_ID_FILE, id + '\n', 'utf8');
  console.log(`[build-data] Generated new X-Device-ID: ${id} → ${DEVICE_ID_FILE}`);
  return id;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const DEVICE_ID = getDeviceId();

async function apiGet(path) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Device-ID': DEVICE_ID,
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  }
  return res.json();
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Photo path helpers
// ---------------------------------------------------------------------------
/**
 * Build photos array from API detail object.
 * API returns photos_count and we reconstruct paths, OR the detail already has
 * a photos_count / photos field with remote paths.
 *
 * The API stores photos at: /storage/locations/{id}/photo_N.jpg
 * Local url:   photos/{id}_photo_N.jpg
 * Local thumb: thumbs/{id}_photo_N.jpg
 */
function buildPhotos(id, detail) {
  // If the detail already has a photos array with remote paths, use it.
  if (Array.isArray(detail.photos) && detail.photos.length > 0) {
    return detail.photos.map(p => {
      const remote = p.remote ?? p.url ?? p.path ?? '';
      // Extract photo_N part from remote path: /storage/locations/11/photo_0.jpg → photo_0
      const match = remote.match(/photo_(\d+)(?:\.jpg)?$/i);
      const n = match ? match[1] : '0';
      return buildPhotoEntry(id, n);
    });
  }

  // Fallback: use photos_count field
  const count = detail.photos_count ?? 0;
  return Array.from({ length: count }, (_, n) => buildPhotoEntry(id, n));
}

function buildPhotoEntry(id, n) {
  return {
    remote: `/storage/locations/${id}/photo_${n}.jpg`,
    url: `photos/${id}_photo_${n}.jpg`,
    thumb: `thumbs/${id}_photo_${n}.jpg`,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[build-data] Starting. Device-ID: ${DEVICE_ID}`);
  console.log(`[build-data] Output: ${OUT}`);
  if (LIMIT) console.log(`[build-data] LIMIT=${LIMIT} (test mode)`);

  // Step 1: fetch location list
  console.log('[build-data] Fetching location list…');
  let listData;
  try {
    listData = await apiGet('/locations?lat=53.9&lng=27.56&radius=50000&per_page=500');
  } catch (err) {
    console.error(`[build-data] FATAL: Cannot fetch location list: ${err.message}`);
    process.exit(1);
  }

  const summaries = listData.data ?? listData;
  if (!Array.isArray(summaries) || summaries.length === 0) {
    console.error('[build-data] FATAL: Empty location list from API.');
    process.exit(1);
  }

  const all = LIMIT ? summaries.slice(0, LIMIT) : summaries;
  const M = all.length;
  console.log(`[build-data] Locations to process: ${M}`);

  // Step 2 & 3: fetch detail + comments for each location
  const results = [];
  let skipped = 0;

  for (let i = 0; i < M; i++) {
    const summary = all[i];
    const id = summary.id;
    const n = i + 1;

    // Detail
    let detail;
    try {
      await delay(DELAY_MS);
      const detailRes = await apiGet(`/locations/${id}`);
      detail = detailRes.data ?? detailRes;
    } catch (err) {
      console.warn(`[build-data] WARN ${n}/${M}: Cannot fetch detail for id=${id}: ${err.message} — skipping`);
      skipped++;
      continue;
    }

    // Comments (non-fatal)
    let comments = [];
    try {
      await delay(DELAY_MS);
      const commentsRes = await apiGet(`/locations/${id}/comments`);
      const page1 = commentsRes.data ?? [];
      comments = [...page1];

      // Paginate if needed
      const lastPage = commentsRes.meta?.last_page ?? 1;
      for (let page = 2; page <= lastPage; page++) {
        await delay(DELAY_MS);
        const nextRes = await apiGet(`/locations/${id}/comments?per_page=100&page=${page}`);
        comments.push(...(nextRes.data ?? []));
      }
    } catch (err) {
      console.warn(`[build-data] WARN ${n}/${M}: Cannot fetch comments for id=${id}: ${err.message} — using []`);
    }

    // Merge: detail fields take priority over summary, add photos + comments
    const photos = buildPhotos(id, detail);

    const merged = {
      ...summary,
      ...detail,
      photos,
      comments,
    };

    results.push(merged);

    if (n % 25 === 0 || n === M) {
      console.log(`[build-data] Progress: ${n}/${M}`);
    }
  }

  // Step 4: write output
  const outDir = dirname(OUT);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const sorted = results.sort((a, b) => a.id - b.id);
  writeFileSync(OUT, JSON.stringify(sorted, null, 2), 'utf8');

  console.log(`[build-data] Done.`);
  console.log(`[build-data]   Written: ${OUT}`);
  console.log(`[build-data]   Locations: ${sorted.length} (skipped: ${skipped})`);
  console.log(`[build-data]   Total comments: ${sorted.reduce((s, l) => s + (l.comments?.length ?? 0), 0)}`);

  if (skipped > 0) {
    process.exit(1); // non-zero if some locations were skipped
  }
}

main().catch(err => {
  console.error(`[build-data] FATAL: ${err.message}`);
  process.exit(1);
});
