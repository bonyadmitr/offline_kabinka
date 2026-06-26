# Офлайн-стратегия и iOS-нюансы

## Что хранится и где

Офлайн-контент разделён на три категории по механизму хранения:

| Ресурс | Размер | Хранилище | Механизм |
|---|---|---|---|
| App shell (JS/CSS/HTML/иконки) | ~2 МБ | Cache Storage | SW precache (Workbox) |
| `data/locations.json` (263 точки) | ~672 КБ | Cache Storage | SW precache |
| `thumbs/thumbs-index.json` | ~60 КБ | Cache Storage | SW precache |
| Полноразмерные фото (kabinka.by/storage/) | до 300 шт | Cache Storage | SW CacheFirst runtime |
| `thumbs/thumbs.bin` (1088 превью) | ~8.3 МБ | IndexedDB blob `thumbs` | Скачивается по кнопке/первому запуску |
| `map/minsk.pmtiles` (вектор. карта) | ~31 МБ | IndexedDB blob `minsk` | Скачивается по кнопке/первому запуску |

---

## Service Worker (Workbox)

Конфигурация в `vite.config.ts`, плагин `VitePWA`.

**Precache** включает все файлы, соответствующие `**/*.{js,css,html,svg,png,woff2,json}`, кроме:
- `**/*.pmtiles` — карта в precache не попадает
- `**/thumbs/thumbs.bin` — бинарный пакет превью в precache не попадает

Лимит размера файла в precache повышен до 3 МБ (по умолчанию Workbox 2 МБ, иначе `locations.json` выбрасывался бы с предупреждением).

**Runtime caching** — CacheFirst для `https://kabinka.by/storage/`:
- имя кэша: `photos`
- максимум 300 записей
- TTL 30 дней
- `cacheableResponse: { statuses: [0, 200] }` — кэширует и opaque-ответы

**SW в dev отключён** (`devOptions.enabled: false`). В dev-сборке виртуальный модуль `virtual:pwa-register` не подключается.

---

## IndexedDB: карта и превью

**Почему IndexedDB, а не OPFS?**  
На iOS Safari `OPFS.createWritable()` не поддерживается, `createSyncAccessHandle()` работает только в Web Worker — капризно. IDB проще, не требует воркера и даёт ту же персистентность. Подробнее: [проблема 3](problems-and-solutions.md#3-отказ-от-opfs-в-пользу-indexeddb-blob).

**Как читается карта:**  
`IDBBlobSource` реализует интерфейс `Source` из pmtiles. MapLibre запрашивает диапазоны байт — источник выполняет `blob.slice(offset, offset + length).arrayBuffer()`. Только нужные тайлы читаются в память.

**Как читаются превью:**  
При запуске `loadThumbsPackFromIDB()` читает `thumbs` Blob целиком в `ArrayBuffer` и регистрирует в `setPack()`. Дальше `getThumbObjectUrl(name)` нарезает JPEG-ы из буфера через `buffer.slice(offset, length)` и создаёт object URL — без сетевых запросов.

---

## Персистентность на iOS

**Ключевое правило:** данные живут долго только если PWA установлен на экран «Домой». У неустановленного сайта Safari чистит хранилище после 7 дней без активности.

Что сделано:
1. **`navigator.storage.persist()`** — запрашивается при установке (install hint). Одобренный запрос защищает IDB от автоматической очистки.
2. **Подсказка установки** (`ui/install-hint.ts`) — закрываемый баннер с инструкцией «Добавить на экран «Домой»» (iOS) или промпт beforeinstallprompt (Android/Chrome). Появляется при первом запуске.

---

## Офлайн «открыто сейчас»

Серверное поле `is_open_now` не используется — оно актуально только на момент API-запроса.  
Приложение вычисляет статус клиентски через `isOpenNow(working_hours)` из `src/data/open-now.ts`:

- Временная зона: всегда **Europe/Minsk (UTC+3)** — без перехода на летнее время
- Текущее время: `Intl.DateTimeFormat` с `timeZone: 'Europe/Minsk'` от системного времени устройства
- Overnight-расписание (close < open, например `09:00 → 02:00`) обрабатывается
- Перерывы (`break_start` / `break_end`) учитываются

---

## Офлайн расстояния

Поле `distance_meters` от сервера не используется. Расстояние считается через `haversine()` из `src/core/geo.ts` от позиции из MapLibre `geolocate`-контрола. Обновляется при перерисовке списка.

---

## Полноразмерные фото без CORS-preflight

Фото грузятся обычным `<img src="...">` без дополнительных заголовков. Заголовок `X-Device-ID` нужен только для запросов к `/api/*` — при подстановке его в запрос фото вызывал бы CORS preflight, который блокировал загрузку.

Workbox кэширует ответы с `kabinka.by/storage/` как opaque (режим `no-cors`) — это нормально, statuses `[0, 200]` в конфиге CacheFirst явно разрешает opaque-ответы.

---

## Память и ограничения карты

Карта читается лениво — MapLibre запрашивает тайлы по мере прокрутки, `IDBBlobSource.getBytes()` возвращает только нужный срез. Весь 31 МБ файл в памяти одновременно не держится.

Дополнительные ограничения для экономии памяти:
- `maxBounds` = bbox Минска (27.30–27.78 / 53.78–54.02) — нельзя панорамировать за пределы города
- `maxZoom = 16` — избыточная детализация не запрашивается

---

## Тёмная тема и iOS overscroll

Класс `theme-dark` вешается на `document.documentElement` (а не на `#app`). Это важно: CSS-переменная `--bg` должна достигать `<body>`, иначе при резиновой прокрутке на iOS (overscroll) фон остаётся белым. Подробнее: [проблема 11](problems-and-solutions.md#11-тёмная-тема-и-ios-overscroll).

---

## Компас на iOS

`DeviceOrientationEvent` на iOS требует явного разрешения от пользователя. Маршрут запрашивает его через `DeviceOrientationEvent.requestPermission()` при нажатии кнопки «Маршрут» (user gesture). Разрешение кэшируется в переменной `orientationPermission` на время сессии. На iOS доступно `webkitCompassHeading` — уже в градусах от севера по часовой стрелке, без конвертации.

---

Смотрите также:
- [docs/architecture.md](architecture.md) — детали модулей `offline/` и механизм blobstore
- [docs/problems-and-solutions.md](problems-and-solutions.md) — все технические проблемы с IDB, OPFS, iOS
