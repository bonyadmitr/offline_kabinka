# offline_kabinka — офлайн-карта туалетов Минска

Статический PWA-просмотрщик общественных туалетов Минска на офлайн-картах OpenStreetMap.  
Источник данных — [kabinka.by](https://kabinka.by). Только просмотр (без отправки данных).

**Деплой:** https://bonyadmitr.github.io/offline_kabinka/

---

## Содержание

- [Стек](#стек)
- [Быстрый старт](#быстрый-старт)
- [Тесты](#тесты)
- [Обслуживание данных и ассетов](#обслуживание-данных-и-ассетов)
- [Деплой](#деплой)
- [Улучшения по сравнению с Kabinka](#улучшения-по-сравнению-с-kabinka)
- [Документация](#документация)

---

## Стек

| Слой | Инструмент |
|---|---|
| Сборка | Vite 8 + TypeScript 6 |
| UI | Vanilla TS, без фреймворка (pub/sub Store) |
| Карта | MapLibre GL JS 5 + pmtiles 4 (векторные тайлы) |
| PWA / SW | vite-plugin-pwa 1 (Workbox) |
| Хранилище | IndexedDB (idb 8) + собственный blobstore |
| Тесты | Vitest 4 (83 юнит-теста) + Playwright (e2e, online + offline) |

---

## Быстрый старт

```bash
npm install
```

### Dev-сервер (без Service Worker)

```bash
npm run dev
```

SW отключён в dev (`devOptions.enabled: false` в `vite.config.ts`). Карта работает в онлайн-режиме из сети.

### Продакшн-превью (с Service Worker и офлайн-пакетом)

```bash
npm run build && npm run preview
```

Для прод-превью нужны собранные ассеты в `public/`:
- `public/map/minsk.pmtiles` — результат `bash scripts/build-map.sh`
- `public/thumbs/thumbs.bin` и `public/thumbs/thumbs-index.json` — результат `node scripts/pack-thumbs.mjs`

---

## Тесты

### Юнит-тесты (Vitest, 83 теста)

```bash
npx vitest run
# или
npm test
```

Среда: jsdom + fake-indexeddb. Без сборки.

### E2E-тесты (Playwright)

Первый запуск — установить браузер:

```bash
npx playwright install chromium
```

Запустить тесты:

```bash
npx playwright test
```

E2E требуют собранного проекта (`public/map/minsk.pmtiles` и `public/thumbs/thumbs.bin`). Playwright сам запускает `npm run build && npm run preview` через `webServer` в `playwright.config.ts`. Тесты работают в двух проектах: `desktop` (1280×900) и `mobile` (iPhone 13 viewport, Chromium).

---

## Обслуживание данных и ассетов

### Обновить данные из API

```bash
node scripts/build-data.mjs
```

Делает запросы к `kabinka.by/api/v1`: список → детали → комментарии. Пишет в `public/data/locations.json`.

Переменные окружения:
- `LIMIT=N` — обработать только первые N локаций (отладка)
- `OUT=path` — путь вывода (по умолчанию `public/data/locations.json`)

### Пересобрать карту

Требуется Java 21:

```bash
brew install openjdk@21
```

```bash
bash scripts/build-map.sh
```

Скачивает OSM Беларуси + water-polygons (~1.3 ГБ, кэшируется в `.osm-cache/`), строит `minsk.pmtiles` через Planetiler, кладёт файл в `../minsk_map/` и копирует в `public/map/`. Карта не коммитится в git.

Переменная окружения: `MAXZOOM=16` — увеличить детализацию (крупнее файл; по умолчанию 15).

### Упаковать превью

```bash
node scripts/pack-thumbs.mjs
```

Читает `../thumbs/*.jpg`, пишет `public/thumbs/thumbs.bin` и `public/thumbs/thumbs-index.json`.  
Исходные JPEG лежат за пределами репозитория (`~/Downloads/OfflineMaps/thumbs/`).

---

## Деплой

```bash
bash scripts/deploy.sh
```

Собирает продакшн-бандл и публикует `dist/` в ветку `gh-pages` через `npx gh-pages`. Большие бинарники (карта, thumbs.bin) не коммитятся в `main` — они попадают только в `gh-pages` через `dist/`.

Требования перед деплоем:
- `public/map/minsk.pmtiles` собран
- `public/thumbs/thumbs.bin` собран
- GitHub Pages репозитория [bonyadmitr/offline_kabinka](https://github.com/bonyadmitr/offline_kabinka) настроен на ветку `gh-pages`

> Одноразовая настройка (создание репозитория + Pages) уже выполнена.

---

## Улучшения по сравнению с Kabinka

По сравнению с нативным приложением Kabinka PWA добавляет:

- **Офлайн-фильтрация** — вся фильтрация и поиск клиентские, работают без сети
- **Офлайн «открыто сейчас»** — считается по расписанию из базы в зоне Europe/Minsk
- **Офлайн расстояния** — haversine от текущего положения
- **Зум-кнопки на мобиле** — MapLibre по умолчанию их не добавляет
- **Поиск по названию и адресу**
- **Шаринг-ссылка** — `#id=NN` deep-link, открывает конкретную точку
- **Гибридный маршрут** — офлайн: прямая линия + компас; онлайн: deep-link в Яндекс/Google/Apple Maps
- **Упакованные превью** — 1088 фото в одном `thumbs.bin`, без сетевых запросов офлайн
- **IDB-blob хранилище** — карта и превью в IndexedDB, чтение диапазонами через `blob.slice()`

---

## Документация

- [docs/architecture.md](docs/architecture.md) — структура модулей, поток данных, AppState
- [docs/offline-and-ios.md](docs/offline-and-ios.md) — офлайн-стратегия, iOS-нюансы, персистентность
- [docs/problems-and-solutions.md](docs/problems-and-solutions.md) — 13 конкретных проблем и их решений
