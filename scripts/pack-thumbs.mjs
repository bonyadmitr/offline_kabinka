#!/usr/bin/env node
/**
 * pack-thumbs.mjs — pack all thumbnail JPEGs into a single binary bundle.
 *
 * Reads:  ../thumbs/*.jpg  (sibling directory to the project root)
 * Writes: public/thumbs/thumbs.bin        — raw concatenation of all JPEG bytes
 *         public/thumbs/thumbs-index.json — { "<basename>.jpg": [offset, length], ... }
 *
 * The index enables O(1) slice-based access: buffer.slice(offset, offset+length).
 *
 * Usage:
 *   node scripts/pack-thumbs.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const THUMBS_SRC = resolve(PROJECT_ROOT, '../thumbs');
const OUT_DIR = resolve(PROJECT_ROOT, 'public/thumbs');
const OUT_BIN = resolve(OUT_DIR, 'thumbs.bin');
const OUT_INDEX = resolve(OUT_DIR, 'thumbs-index.json');

// Read all .jpg files, sorted for deterministic output
const jpgFiles = readdirSync(THUMBS_SRC)
  .filter(f => f.toLowerCase().endsWith('.jpg'))
  .sort();

if (jpgFiles.length === 0) {
  console.error(`[pack-thumbs] No .jpg files found in ${THUMBS_SRC}`);
  process.exit(1);
}

console.log(`[pack-thumbs] Found ${jpgFiles.length} JPEG files in ${THUMBS_SRC}`);

// Build index and accumulate buffers
const index = {};
const buffers = [];
let offset = 0;

for (const name of jpgFiles) {
  const buf = readFileSync(resolve(THUMBS_SRC, name));
  const length = buf.byteLength;
  index[name] = [offset, length];
  buffers.push(buf);
  offset += length;
}

const totalSize = offset;

// Write binary pack
if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

const combined = Buffer.concat(buffers);
writeFileSync(OUT_BIN, combined);

// Write JSON index
writeFileSync(OUT_INDEX, JSON.stringify(index, null, 2), 'utf8');

// Verify: sum of lengths == totalSize
const indexEntries = Object.values(index);
const sumLengths = indexEntries.reduce((s, [, l]) => s + l, 0);
const recordCount = indexEntries.length;

console.log(`[pack-thumbs] Output:`);
console.log(`  ${OUT_BIN}   — ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`  ${OUT_INDEX}`);
console.log(`[pack-thumbs] Index records: ${recordCount}`);
console.log(`[pack-thumbs] Sum of lengths: ${sumLengths} bytes`);
console.log(`[pack-thumbs] thumbs.bin size: ${totalSize} bytes`);

if (sumLengths !== totalSize) {
  console.error(`[pack-thumbs] ERROR: sum of lengths (${sumLengths}) !== bin size (${totalSize})`);
  process.exit(1);
}
if (recordCount !== jpgFiles.length) {
  console.error(`[pack-thumbs] ERROR: index records (${recordCount}) !== jpg count (${jpgFiles.length})`);
  process.exit(1);
}

console.log(`[pack-thumbs] Verification OK: ${recordCount} records, sum == bin size`);
