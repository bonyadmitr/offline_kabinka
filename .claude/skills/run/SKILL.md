---
name: run
description: Run the offline_kabinka app locally — dev (no SW) or production preview (SW active, for offline testing).
---

The app uses the base path `/offline_kabinka/`, so every local URL includes that prefix.

## Dev (fast, hot reload, service worker DISABLED)
```bash
npm run dev
```
Open http://localhost:5173/offline_kabinka/ . Use this for normal UI work. The SW is intentionally off in dev (`devOptions.enabled: false` in `vite.config.ts`), so offline behavior can NOT be tested here. In dev, thumbnails are served as static files from `public/thumbs/`.

## Production preview (service worker ACTIVE — use for offline testing / PWA)
```bash
npm run build
npm run preview
```
Open the printed URL, http://localhost:4173/offline_kabinka/ . This serves the built `dist/` with the SW registered, so you can:
- accept the "Скачать офлайн-пакет" banner to stream the map + thumbnails into IndexedDB,
- go offline (DevTools → Network → Offline, or the OS) and reload to confirm the app still loads (shell from precache, map + thumbnails from IndexedDB).

To match the e2e port exactly:
```bash
npm run build && npm run preview -- --port 4174 --strictPort
```
→ http://localhost:4174/offline_kabinka/

Notes:
- Requires the offline assets present locally for the full offline flow: `public/map/minsk.pmtiles` (see `build-map`) and `public/thumbs/thumbs.bin` (+ index).
- Do not leave a preview server bound to port 4174 when running `npx playwright test` unless you intend Playwright to reuse it; otherwise stop it first (`lsof -ti:4174 | xargs kill`).
