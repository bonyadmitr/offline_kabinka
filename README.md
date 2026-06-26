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
| Карта | MapLibre GL JS 5 + pmtiles 4 (векторные тайлы), ленивый чанк |
| PWA / SW | vite-plugin-pwa 1 (Workbox) |
| Хранилище | IndexedDB (idb 8) + собственный blobstore |
| Тесты | Vitest 4 (143 юнит-теста) + Playwright (e2e, online + offline) |

Движок карты вынесен в ленивый чанк: входной JS грузится без MapLibre, а сам
движок подгружается динамически уже после первого показа списка (см.
`src/ui/scaffold.ts`, `src/ui/shell.ts`, `src/main.ts`).

---

## Быстрый старт

```bash
npm install
```

### Dev-сервер (без Service Worker)

```bash
npm run dev
```

Открыть http://localhost:5173/offline_kabinka/ (база пути — `/offline_kabinka/`).
SW отключён в dev (`devOptions.enabled: false` в `vite.config.ts`), поэтому офлайн
там не проверить. Превью в dev отдаются как статические файлы из `public/thumbs/`,
карта работает онлайн из сети.

### Продакшн-превью (с Service Worker и офлайн-пакетами)

```bash
npm run build && npm run preview
```

Открыть http://localhost:4173/offline_kabinka/ . SW активен — можно принять баннер
скачивания офлайн-пакетов и проверить работу без сети.

Для полного офлайн-сценария нужны собранные ассеты в `public/`:
- `public/map/minsk.pmtiles` (+ `public/map/map-version.json`) — результат `bash scripts/build-map.sh`
- `public/thumbs/thumbs.bin` (+ `public/thumbs/thumbs-index.json`) — результат `node scripts/pack-thumbs.mjs`

---

## Тесты

### Юнит-тесты (Vitest, 143 теста)

```bash
npx vitest run
# или
npm test            # алиасы: npm run test:unit
```

Среда: jsdom + fake-indexeddb. Конфиг в `vite.config.ts` (блок `test`, шаблон
`tests/unit/**/*.test.ts`). Без сборки, ~2 c.

### E2E-тесты (Playwright)

Первый запуск — установить браузер:

```bash
npx playwright install chromium
```

Запустить тесты:

```bash
npx playwright test     # или: npm run test:e2e
```

`webServer` в `playwright.config.ts` сам поднимает `npm run build && npm run
preview -- --port 4174 --strictPort`, чтобы Service Worker был активен (он
отключён в dev). Тесты идут в двух проектах: `desktop` (1280×900) и `mobile`
(iPhone 13, Chromium) — по 7 тестов, всего 14. Специи: `tests/e2e/online.spec.ts`
и `tests/e2e/offline.spec.ts` (регистрация SW → скачивание пакетов в IndexedDB →
офлайн → перезагрузка → проверка списка из прекэша, наличия canvas карты и
`blob:`-URL у превью).

---

## Обслуживание данных и ассетов

### Обновить данные из API

```bash
node scripts/build-data.mjs
```

Делает запросы к `kabinka.by/api/v1`: список → детали → комментарии. Пишет в
`public/data/locations.json` (сейчас ~263 локации). Заголовок `X-Device-ID`
проставляется автоматически — id хранится в `scripts/.device_id` (gitignored).

Переменные окружения:
- `LIMIT=N` — обработать только первые N локаций (отладка)
- `OUT=path` — путь вывода (по умолчанию `public/data/locations.json`)

### Пересобрать карту

Требуется Java 21:

```bash
brew install openjdk@21
bash scripts/build-map.sh
```

Скачивает OSM Беларуси + Natural Earth + water-polygons (~1.3–1.7 ГБ, кэшируется в
`../maps` вне репозитория) и строит `minsk.pmtiles` через Planetiler, обрезая по
bbox Минска. Файл и `map-version.json` кладутся в `../minsk_map/` и копируются в
`public/map/`. Карта не коммитится в git.

Переменная окружения: `MAXZOOM` (по умолчанию 15; `16` — крупнее и детальнее, `14`
— мельче). Итоговый архив при `MAXZOOM=15` весит ~31 МБ.

### Упаковать превью

```bash
node scripts/pack-thumbs.mjs
```

Читает `../thumbs/*.jpg`, пишет `public/thumbs/thumbs.bin` (1088 превью) и
`public/thumbs/thumbs-index.json`. Исходные JPEG лежат за пределами репозитория
(`~/Downloads/OfflineMaps/thumbs/`).

---

## Деплой

```bash
bash scripts/deploy.sh
```

Скрипт собирает прод-бандл (`npm run build`) и публикует содержимое `dist/` в ветку
`gh-pages` **из временной папки вне репозитория**: `git init` → `git add -A -f` →
force-push. Флаг `-f` принудительно добавляет файлы мимо `.gitignore` (где числятся
`*.pmtiles`, `public/map/`, `dist` …) — иначе игнор-правила молча выкинули бы 31 МБ
карты из деплоя. Поэтому здесь **не** `npx gh-pages`: его кэш живёт под
`node_modules` и наследует те же игнор-правила (см. [проблему 8](docs/problems-and-solutions.md)).

Требования перед деплоем (скрипт их проверяет):
- `public/map/minsk.pmtiles` собран
- `public/thumbs/thumbs.bin` собран
- `gh auth status` — активный аккаунт `bonyadmitr`
- GitHub Pages репозитория [bonyadmitr/offline_kabinka](https://github.com/bonyadmitr/offline_kabinka) настроен на ветку `gh-pages`

> Одноразовая настройка (создание репозитория + Pages) уже выполнена.

Ветка `main` не содержит больших бинарников — они попадают только в `gh-pages`
через `dist/`. Каждый деплой — свежий одиночный коммит с force-push, поэтому
`gh-pages` не накапливает старые 31 МБ-блобы.

---

## Улучшения по сравнению с Kabinka

По сравнению с нативным приложением Kabinka PWA добавляет:

- **Офлайн-фильтрация и поиск** — вся фильтрация и поиск клиентские, работают без сети
- **Офлайн «открыто сейчас»** — считается по расписанию из базы в зоне Europe/Minsk
- **Офлайн расстояния** — haversine от текущего положения
- **Зум-кнопки на мобиле** — MapLibre по умолчанию их не добавляет
- **Поиск по названию и адресу**
- **Шаринг-ссылка** — `#id=NN` deep-link, открывает конкретную точку
- **Маршрут** — навигатор (Яндекс Карты/Навигатор, Google, Apple) + офлайн-компас (линия и азимут)
- **Тема система/светлая/тёмная** — следует за системной по умолчанию
- **Упакованные превью** — 1088 фото в одном `thumbs.bin`, без сетевых запросов офлайн
- **Два независимых офлайн-пакета** — карта и фото-превью качаются/удаляются раздельно
- **IDB-blob хранилище** — карта и превью в IndexedDB, чтение диапазонами через `blob.slice()`

---

## Документация

- [docs/architecture.md](docs/architecture.md) — структура модулей, поток данных, AppState
- [docs/offline-and-ios.md](docs/offline-and-ios.md) — офлайн-стратегия, iOS-нюансы, персистентность
- [docs/problems-and-solutions.md](docs/problems-and-solutions.md) — конкретные проблемы и их решения
