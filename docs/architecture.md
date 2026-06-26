# Архитектура offline_kabinka

## Обзор

Приложение — ванильный TypeScript без UI-фреймворка. Точка входа: `src/main.ts`. Состояние хранится в единственном `Store<AppState>` с pub/sub подписками. Карта — MapLibre GL JS с векторными тайлами через pmtiles. Сервис-воркер (Workbox) прекэширует оболочку; большие бинарники живут в IndexedDB.

---

## Модульная структура `src/`

```
src/
├── core/           Типы, ошибки, Store, утилиты
├── data/           Репозиторий, IDB, фильтрация, diff, расписание
├── map/            Карта MapLibre, стиль, маркеры, контролы
├── offline/        Blobstore, downloader, pmtiles-source, thumbs, storage
├── update/         Обновление данных и карты
├── routing/        Гибридный маршрут (линия + компас + deep-links)
├── ui/             Вся разметка и взаимодействие
├── i18n/           Переводы (ru + en)
└── main.ts         Склейка всего вышеперечисленного
```

---

## `core/` — ядро

### `types.ts`

Типы предметной области:

- `Location` — локация с полями id, title, latitude/longitude, layout_type, price_type, is_accessible, is_verified, рейтинги, tags, photos, working_hours, comments
- `WorkingHour` — запись расписания: day (1=Пн..7=Вс), open/close (строки `HH:MM`), break_start/break_end, is_closed
- `Tag`, `Photo`, `Comment` — вспомогательные типы
- `FilterState` — openNow, layoutTypes, priceTypes, accessibleOnly, tagSlugs, minRating, query

### `errors.ts`

`AppError extends Error` с кодом `ErrCode`. Коды:

| Код | Значение |
|---|---|
| NET-01 | Нет интернета |
| NET-02 | Таймаут сервера |
| API-01 | Сервер обновления недоступен |
| API-02 | Не удалось разобрать ответ |
| MAP-01 | Не удалось скачать карту |
| MAP-02 | Файл карты повреждён |
| DATA-01 | Недостаточно места / ошибка данных |
| STOR-01 | Хранилище недоступно |
| IMG-01 | Фото недоступно |
| GEO-01 | Геолокация не получена |
| UNK-01 | Непредвиденная ошибка |

`toUserMessage(e)` переводит `AppError` в локализованную строку для UI.

### `store.ts`

```typescript
class Store<T extends object> {
  get(): T
  set(patch: Partial<T>): void   // иммутабельный merge, вызывает подписчиков
  subscribe(f: (s: T) => void): () => void
}
```

Используется один экземпляр `Store<AppState>` в `main.ts`.

### `device.ts`, `geo.ts`, `settings.ts`

- `getDeviceId()` — UUID в `localStorage`, нужен для заголовка `X-Device-ID` при запросах к API
- `haversine()`, `bearing()` — WGS84-расстояние и азимут для офлайн-расстояний и компаса
- `loadRadius()` / `saveRadius()`, `loadNavigator()` / `saveNavigator()` — персистентные пользовательские настройки

---

## `data/` — данные

### `idb.ts`

База данных `offline_kabinka` (IndexedDB v2), два object store:

- `kv` — ключ-значение для сериализуемых данных (locations, thumbsIndex, mapVersion и т.д.)
- `blobs` — бинарные Blob-объекты (карта `minsk`, превью `thumbs`)

Экспортирует `getKV` / `setKV` и `getDatabase()` (общий коннект для blobstore).

### `repository.ts`

- `loadLocations()` — сначала читает из IDB (`kv.locations`); если нет — загружает `public/data/locations.json` (baseline, прекэширован SW)
- `saveLocations(arr)` — сохраняет в IDB

### `filter.ts`

`applyFilters(list, filter)` — полностью клиентская: поиск по названию/адресу, фильтры по типу, цене, доступности, тегам, рейтингу, «открыто сейчас».

### `open-now.ts`

`isOpenNow(working_hours)` — вычисляет текущее состояние по расписанию. Временная зона Europe/Minsk (UTC+3, постоянно). Поддерживает overnight-окна (close < open), перерывы.

`minskNow(date?)` — текущее время в Минске через `Intl.DateTimeFormat`.

### `diff.ts`

`diffLocations(oldArr, newArr)` → `{ added, removed, changed }` (массивы id). Используется при обновлении данных для отчёта о количестве изменений.

---

## `map/` — карта

### `map.ts`

- `createMap(container, style)` — создаёт `maplibregl.Map` с центром Минска (27.5667, 53.9023), zoom 12, minZoom 9, maxZoom 16, maxBounds = bbox Минска (27.30–27.78 / 53.78–54.02)
- `registerPmtiles()` — регистрирует `pmtiles` протокол в MapLibre (`maplibregl.addProtocol('pmtiles', p.tile.bind(p))`); вызывается ровно один раз через флаг `__registered`
- `getProtocol()` — общий синглтон `Protocol` для сетевых и IDB-источников
- `setMapLanguage(map, lang)` — меняет `text-field` у слоёв `LABEL_LAYER_IDS` через `coalesce([name:ru/name:en], [name])`

### `style.ts`

`buildStyle({ lang, theme, pmtilesUrl })` — собирает `StyleSpecification` (OpenMapTiles-схема):

- Источник: `pmtiles://<pmtilesUrl>` (подставляет bare key `minsk` или сетевой URL)
- Шрифты: `https://demotiles.maplibre.org/font/...` (требует сеть; TODO: хостить локально)
- Атрибуция: OpenMapTiles + OpenStreetMap (обязательна по лицензии)
- Темы: light / dark — разные палитры для фона, воды, дорог, зданий, текста

### `markers.ts`, `controls.ts`

Маркеры точек с цветом по типу цены, рейтингом, кластеризацией. Контролы: zoom (включая мобайл), геолокация.

---

## `offline/` — офлайн-хранилище

### `blobstore.ts`

CRUD для Blob в `idb.blobs`:

```typescript
putBlob(key, blob)      // запись
getBlob(key)            // чтение, null если нет
blobSize(key)           // размер, 0 если нет
deleteBlob(key)         // удаление
```

Ошибки преобразуются в `AppError('DATA-01')` / `AppError('STOR-01')`.

### `pmtiles-source.ts`

`IDBBlobSource` реализует интерфейс `Source` из pmtiles:

```typescript
getKey(): string           // → 'minsk'
getBytes(offset, length)   // → blob.slice(offset, offset+length).arrayBuffer()
```

`useStoredPmtilesIfPresent(key)` — если Blob в IDB есть, регистрирует его на `Protocol` и возвращает bare key.  
`resolvePmtilesUrl(key)` — возвращает bare key (`'minsk'`) или сетевой URL (`BASE_URL + 'map/minsk.pmtiles'`).  
`buildStyle()` добавляет префикс `pmtiles://` к тому, что вернул `resolvePmtilesUrl`.

### `downloader.ts`

`downloadToBlob(url, onProgress)` — стриминг в Blob с stall-таймаутом (60 с). При офлайн — `NET-01`, при таймауте — `NET-02`.

`ensureOfflinePackage(onProgress)` — скачивает карту и thumbs.bin, если их нет в IDB. Прогресс взвешен по размерам файлов. Порядок: 1) карта → 2) thumbs.bin + индекс → 3) гидрация in-memory пакета.

`loadThumbsPackFromIDB()` — при запуске: читает Blob + индекс из IDB, вызывает `setPack()` для in-memory кэша object URL.

### `thumbs.ts`

`setPack(buf, index)` — регистрирует распакованный `ArrayBuffer` + `ThumbIndex` (map: имя → [offset, length]).  
`getThumbObjectUrl(name)` — нарезает JPEG из буфера, создаёт object URL, кэширует.  
`sliceFromIndex(buffer, index, name)` — чистая функция нарезки, тестируется отдельно.

### `storage.ts`

`estimateUsage()` → `{ total, breakdown: { map, thumbs, data, photos, shell } }` (байты).  
`clearTransient()` — удаляет Workbox-кэш `photos` (полноразмерные фото).  
`reinstallPackage(onProgress)` — удаляет Blob-ы и маркеры версий, перезапускает `ensureOfflinePackage`.

---

## `update/` — обновление данных и карты

### `data-update.ts`

In-app синхронизация с kabinka.by API: список → детали → комментарии → diff → сохранение. Поддерживает прерывание через `AbortSignal` с частичным сохранением (уже обновлённые записи не теряются).

### `map-update.ts`

`checkMapUpdate()` — сравнивает версию из `map-version.json` с маркером в IDB.  
`updateMap(onProgress)` — скачивает новый `.pmtiles`, сохраняет, обновляет маркер. Caller перестраивает стиль без перезагрузки страницы.

---

## `routing/` — маршрут

Гибридный режим:

- **Офлайн (всегда):** прямая линия user→destination на карте (`GeoJSON LineString`), панель с расстоянием и азимутом, стрелка-компас (`DeviceOrientationEvent`, `webkitCompassHeading` на iOS).
- **Онлайн (deep-links):** кнопки открытия в Яндекс Картах / Яндекс Навигаторе / Google / Apple Maps.

Функции `googleUrl`, `yandexUrl`, `yandexNaviUrl`, `appleUrl` — чистые, покрыты тестами.

---

## `ui/` — интерфейс

| Файл | Назначение |
|---|---|
| `shell.ts` | Монтирование корня: `#map`, toolbar, sheet |
| `sheet.ts` | Bottom-sheet (мобайл: 3 состояния) / боковая панель 400px (десктоп) |
| `list.ts` | Список локаций с расстояниями |
| `card.ts` | Карточка локации: данные, фото, маршрут, шаринг |
| `gallery.ts` | Карусель фото + полноэкранный просмотр + pinch-zoom |
| `filters.ts` | Модальное окно фильтров |
| `settings.ts` | Настройки: язык UI/карты, тема, навигатор, радиус, обновление данных/карты |
| `search.ts` | Поле поиска по названию и адресу |
| `share.ts` | Web Share API + clipboard fallback, deep-link `#id=NN` |
| `toast.ts` | Тосты + оверлей прогресса загрузки |
| `install-hint.ts` | Подсказка установки PWA (iOS / beforeinstallprompt) |
| `thumb-url.ts` | Резолвер превью: IDB-пакет → dev-URL → онлайн |

---

## `i18n/`

`t(key, vars?)` — функция перевода. Активный словарь переключается через `setLang(lang)` (сохраняется в `localStorage`).  
`ru.ts` — полный словарь.  
`en.ts` — каркас (переводы ключевых строк обвязки).

---

## Поток данных при запуске

```
bootstrap()
  │
  ├── registerServiceWorker()          (только PROD, async)
  ├── loadThumbsPackFromIDB()          (fire-and-forget, thumbsReady)
  ├── Store<AppState> = new Store(...)
  │
  ├── mountShell(root, opts)
  │     └── resolvePmtilesUrl()        → IDB blob key или сетевой URL
  │
  ├── loadLocations()                  → IDB → locations.json (SW-кэш)
  ├── await thumbsReady                ← ждём пакет превью
  ├── drawList()                       первый рендер
  │
  ├── map.once('load', initMarkers)
  ├── selectFromHash()                 deep-link
  └── maybeOfferOfflinePackage()       оффер если пакет не скачан
```

---

## Ключевые ограничения

- Шрифты карты подключаются с `demotiles.maplibre.org` — нужна сеть для первой загрузки (см. `style.ts` TODO)
- Полноразмерные фото загружаются с `kabinka.by/storage/` без доп. заголовков — кэшируются SW CacheFirst до 300 фото, 30 дней
- Карта и thumbs.bin не в git, собираются и деплоятся локально

---

Смотрите также:
- [docs/offline-and-ios.md](offline-and-ios.md) — детали офлайн-стратегии и iOS-нюансы
- [docs/problems-and-solutions.md](problems-and-solutions.md) — конкретные проблемы и решения
