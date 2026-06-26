---
name: test
description: Run the offline_kabinka test suites — vitest unit tests and Playwright e2e (online + real offline).
---

This project has two test suites.

## Unit tests (vitest)

```bash
npx vitest run
```
- Fast (~2 s), jsdom environment, config in `vitest.config.ts` (`tests/unit/**/*.test.ts`).
- Reading the output: the final summary should read `Test Files  N passed (N)` and `Tests  M passed (M)`. Any red `FAIL` line names the file and the failing assertion. There are currently 83 unit tests; all must stay green.
- `npm run test` and `npm run test:unit` are aliases for the same command.

## End-to-end tests (Playwright)

First-time setup (Chromium engine; the mobile project also runs on Chromium):
```bash
npx playwright install chromium
```

Run the e2e suite:
```bash
npx playwright test          # or: npm run test:e2e
```
- Config in `playwright.config.ts`. The `webServer` runs `npm run build && npm run preview -- --port 4174 --strictPort` so the service worker is ACTIVE (the SW is disabled in dev) — required for the offline test. Base URL: `http://localhost:4174/offline_kabinka/`.
- Two projects: `desktop` (1280×900) and `mobile` (iPhone 13 form factor on Chromium). 7 tests each → 14 total.
- Specs: `tests/e2e/online.spec.ts` (load, card open/close, filters, dark theme, search, deep link `#id=11`) and `tests/e2e/offline.spec.ts` (register SW → download the offline package into IndexedDB → go offline → reload → assert 263 places from precache, map canvas present, a list thumbnail is a `blob:` URL).
- Reading the output: green ✓ lines per test, ending in `N passed`. A failure prints the assertion, a DOM/accessibility snapshot, and writes artifacts under `test-results/` (an `error-context.md` per failure). Open those to diagnose.
- Useful flags: `--project=desktop` / `--project=mobile` to run one project, `npx playwright test tests/e2e/online.spec.ts` for one spec, `--headed` to watch, `--debug` to step.

### Notes / limitations
- Tiles render via WebGL; in headless Chromium the `#map canvas` exists but tile pixels may not paint, so tests assert on canvas presence/DOM state, never on rendered pixels.
- The offline test streams the ~31 MB map + thumb pack into IndexedDB from the local preview (fast); each project uses a fresh browser context, so the download runs per project.

Run BOTH suites before committing or deploying.
