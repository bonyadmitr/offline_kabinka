import { defineConfig, devices } from '@playwright/test';

// Base path of the deployed app. The preview server serves the built site under
// this prefix, matching production (GitHub Pages: /offline_kabinka/).
const BASE_URL = 'http://localhost:4174/offline_kabinka/';

/**
 * Playwright e2e config.
 *
 * The webServer runs a PRODUCTION build + `vite preview` so the service worker is
 * active (SW is disabled in dev). The build also assembles the 31 MB map and the
 * thumbnail pack into dist/, which the offline spec streams into IndexedDB — so
 * the offline test exercises the real precache + IDB path, not a mock.
 *
 * Notes / limitations:
 *  - Tiles render with WebGL; in headless Chromium the canvas exists but tile
 *    pixels may not paint. Tests therefore assert on the presence/state of
 *    `#map canvas` and DOM, never on rendered pixels.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // Generous per-test timeout: the offline spec streams ~40 MB into IndexedDB.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Serial workers: the single preview server + a 31 MB map download per spec
  // make parallel runs flaky and slow; correctness over speed here.
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      // iPhone 13 form factor (viewport, deviceScaleFactor, touch, mobile UA),
      // but driven by Chromium — only Chromium is installed in this environment,
      // and the iPhone 13 descriptor defaults to WebKit. browserName overrides
      // that so the mobile project runs on the installed engine.
      name: 'mobile',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],

  webServer: {
    // Build (SW + 31 MB map + thumb pack into dist) then serve it with the SW active.
    command: 'npm run build && npm run preview -- --port 4174 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Build + first map load over a large dist can be slow on a cold cache.
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
