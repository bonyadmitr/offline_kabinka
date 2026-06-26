/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/offline_kabinka/',
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Dev SW disabled so the dev server never serves a stale/precaching SW.
      devOptions: { enabled: false },
      manifest: {
        name: 'Туалеты Минска',
        short_name: 'Туалеты',
        description: 'Офлайн-карта общественных туалетов Минска',
        lang: 'ru',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#15151a',
        theme_color: '#1b1b1f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell PLUS the small JSON payloads that must work
        // offline: data/locations.json (~672 KB), thumbs/thumbs-index.json and
        // map/map-version.json. The large offline binaries (the map *.pmtiles
        // and thumbs.bin) are NOT json, so the glob never matches them — they
        // are streamed into IndexedDB by the WU7b downloader instead.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // Bump the precache budget so locations.json fits (Workbox warns/drops
        // files larger than the 2 MiB default; ours is well under, but be safe).
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globIgnores: [
          '**/*.pmtiles',
          // thumbs.bin lives under thumbs/ and is not json, but list it
          // explicitly so it can never be pulled into the precache manifest.
          '**/thumbs/thumbs.bin',
        ],
        navigateFallback: 'index.html',
        // Full-size photos from the card gallery: cache-first, capped + expiring.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/kabinka\.by\/storage\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'photos',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
        storageQuota: 10000000,
      },
    },
  },
});
