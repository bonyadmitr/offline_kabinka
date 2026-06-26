# Офлайн-стратегия и iOS-нюансы

## Что хранится и где

Офлайн-контент разделён по механизму хранения:

| Ресурс | Размер | Хранилище | Механизм |
|---|---|---|---|
| App shell (JS/CSS/HTML/иконки) | ~2 МБ | Cache Storage | SW precache (Workbox) |
| Глифы карты (`fonts/**/*.pbf`) | — | Cache Storage | SW precache (для офлайн-подписей) |
| `data/locations.json` (263 точки) | ~672 КБ | Cache Storage | SW precache |
| `thumbs/thumbs-index.json` | ~60 КБ | Cache Storage | SW precache |
| Полноразмерные фото (kabinka.by/storage/) | до 300 шт | Cache Storage | SW CacheFirst runtime |
| `thumbs/thumbs.bin` (1088 превью) | ~8.3 МБ | IndexedDB blob `thumbs` | Скачивается отдельным пакетом |
| `map/minsk.pmtiles` (вектор. карта) | ~31 МБ | IndexedDB blob `minsk` | Скачивается отдельным пакетом |

**Два независимых офлайн-пакета.** Карта (`minsk`) и фото-превью (`thumbs`) —
самостоятельные пакеты: их можно скачать и удалить раздельно в настройках
(`src/ui/settings.ts` → `downloadMapPackage`/`downloadThumbsPackage`,
`deleteMapPackage`/`deleteThumbsPackage`). При старте оффер предлагает докачать
недостающее (`ensureOfflinePackage` пропускает уже скачанное).

---

## Service Worker (Workbox)

Конфигурация в `vite.config.ts`, плагин `VitePWA`.

**Precache** включает все файлы по `**/*.{js,css,html,svg,png,woff2,json}` **плюс**
`fonts/**/*.pbf` (глифы карты), кроме:
- `**/*.pmtiles` — карта в precache не попадает
- `**/thumbs/thumbs.bin` — бинарный пакет превью в precache не попадает

Лимит размера файла в precache повышен до 3 МБ (по умолчанию Workbox 2 МБ, иначе
`locations.json` выбрасывался бы с предупреждением).

**Runtime caching** — CacheFirst для `https://kabinka.by/storage/`:
- имя кэша: `photos`
- максимум 300 записей
- TTL 30 дней
- `cacheableResponse: { statuses: [0, 200] }` — кэширует и opaque-ответы

**SW в dev отключён** (`devOptions.enabled: false`). Регистрация (`sw-register.ts`)
импортируется из `main.ts` динамически только в PROD.

---

## Глифы карты — локальные

Подписи на карте (`text-field`) рендерятся из глифов в `public/fonts/Noto Sans
Regular/`. Стиль ссылается на них через `GLYPHS_URL = BASE_URL +
'fonts/{fontstack}/{range}.pbf'` (`src/map/style.ts`), а SW их прекэширует
(`globPatterns` содержит `fonts/**/*.pbf`). Поэтому подписи работают офлайн с
первого запуска — внешний шрифт-сервер не нужен.

---

## IndexedDB: карта и превью

**Почему IndexedDB, а не OPFS?**  
На iOS Safari `OPFS.createWritable()` не поддерживается,
`createSyncAccessHandle()` работает только в Web Worker — капризно. IDB проще, не
требует воркера и даёт ту же персистентность. Подробнее:
[проблема 3](problems-and-solutions.md).

**Как читается карта:**  
`IDBBlobSource` реализует интерфейс `Source` из pmtiles. MapLibre запрашивает
диапазоны байт — источник выполняет `blob.slice(offset, offset +
length).arrayBuffer()`. Только нужные тайлы читаются в память.

**Как читаются превью:**  
При запуске `loadThumbsPackFromIDB()` отдаёт сам **Blob** из IDB в `setPack()` — не
читая его в `ArrayBuffer`. Дальше `getThumbObjectUrl(name)` режет JPEG через
`blob.slice(offset, len)` (лениво) и создаёт object URL. Так ~8.3 МБ не висят в
JS-heap всю сессию (важно для iOS). См. [проблему 12](problems-and-solutions.md).

---

## Точный расчёт размера приложения

`estimateUsage()` (`src/offline/storage.ts`) считает размер **по реальным данным**:
точные размеры blob-ов карты/превью из IDB и читаемые (same-origin) ответы Cache
для shell и данных. `navigator.storage.estimate().usage` **не** используется
намеренно — Chrome раздувает её паддингом для cross-origin opaque-фото (старый код
так показывал бредовые ~537 МБ). Единственная оценочная корзина — фото (количество
записей × номинал), поэтому в результате есть флаг `photosEstimated`.

---

## Персистентность на iOS

**Ключевое правило:** данные живут долго только если PWA установлен на экран
«Домой». У неустановленного сайта Safari чистит хранилище после 7 дней без
активности.

Что сделано:
1. **`navigator.storage.persist()`** — запрашивается при инициализации install-hint (`initInstallHint`). Одобренный запрос защищает IDB от автоматической очистки.
2. **Подсказка установки** (`ui/install-hint.ts`) — закрываемый баннер: на iOS — инструкция «Поделиться → На экран «Домой»», на Android/Chromium — кнопка установки через `beforeinstallprompt`. Баннеры идут через общий `ui/banner-stack.ts`, чтобы не перекрывать оффер пакета.

---

## Офлайн «открыто сейчас»

Серверное поле `is_open_now` не используется — оно актуально только на момент
API-запроса. Приложение вычисляет статус клиентски через `isOpenNow(working_hours)`
из `src/data/open-now.ts`:

- Временная зона: всегда **Europe/Minsk (UTC+3)** — без перехода на летнее время
- Текущее время: `Intl.DateTimeFormat` с `timeZone: 'Europe/Minsk'` от системного времени устройства
- Overnight-расписание (close < open, например `09:00 → 02:00`) обрабатывается
- Перерывы (`break_start` / `break_end`) учитываются

---

## Офлайн расстояния

Поле `distance_meters` от сервера не используется. Расстояние считается через
`haversine()` из `src/core/geo.ts` от позиции из контрола геолокации. Обновляется
при перерисовке списка.

---

## Полноразмерные фото без CORS-preflight

Фото грузятся обычным `<img src="...">` без дополнительных заголовков. Заголовок
`X-Device-ID` нужен только для запросов к `/api/*` — при подстановке его в запрос
фото вызвал бы CORS preflight на `/storage/`, который блокировал загрузку.

Workbox кэширует ответы с `kabinka.by/storage/` как opaque (режим `no-cors`) — это
нормально, statuses `[0, 200]` в конфиге CacheFirst явно разрешают opaque-ответы.

---

## Память и ограничения карты

Карта читается лениво — MapLibre запрашивает тайлы по мере прокрутки,
`IDBBlobSource.getBytes()` возвращает только нужный срез. Весь 31 МБ файл в памяти
одновременно не держится.

Дополнительные ограничения для экономии памяти:
- `maxBounds` = bbox Минска (27.30–27.78 / 53.78–54.02) — нельзя панорамировать за пределы города
- `maxZoom = 16` у карты, при этом архив строится с `maxzoom=15` (z16 — overzoom)

---

## Тема: система / светлая / тёмная

Предпочтение темы (`'system' | 'light' | 'dark'`, дефолт `'system'`) хранится в
`localStorage` и резолвится в *эффективную* тему через `effectiveTheme()`
(`src/core/theme.ts`). Когда выбрано `'system'`, `watchSystemTheme()` подписывается
на смену системной схемы и перекрашивает UI и карту вживую.

Класс `theme-dark` вешается на `document.documentElement` (а не на `#app`). Это
важно: CSS-переменная `--bg` должна достигать `<body>`, иначе при резиновой
прокрутке на iOS (overscroll) фон остаётся белым. Подробнее:
[проблема 11](problems-and-solutions.md).

---

## Компас на iOS

`DeviceOrientationEvent` на iOS требует явного разрешения. «Компас» в маршруте
запрашивает его через `DeviceOrientationEvent.requestPermission()` при нажатии (user
gesture). Результат кэшируется в `orientationPermission` на время сессии. На iOS
доступно `webkitCompassHeading` — уже в градусах от севера по часовой стрелке, без
конвертации; на остальных движках `alpha` пересчитывается.

---

Смотрите также:
- [docs/architecture.md](architecture.md) — детали модулей `offline/` и механизм blobstore
- [docs/problems-and-solutions.md](problems-and-solutions.md) — все технические проблемы с IDB, OPFS, iOS
