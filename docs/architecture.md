# Архитектура offline_kabinka

## Обзор

Приложение — ванильный TypeScript без UI-фреймворка. Точка входа: `src/main.ts`.
Состояние хранится в единственном `Store<AppState>` с pub/sub подписками. Карта —
MapLibre GL JS с векторными тайлами через pmtiles. Сервис-воркер (Workbox)
прекэширует оболочку; большие бинарники живут в IndexedDB.

Движок карты вынесен в **ленивый чанк**: `src/ui/scaffold.ts` строит весь DOM
(лист/тулбар/настройки + пустой `#map`) синхронно и без импорта MapLibre, а
`src/main.ts` динамически импортирует `src/ui/shell.ts` (и весь MapLibre-стек) уже
после первого рендера списка. Входной JS-чанк получается небольшим (~90 КБ),
тяжёлый map-чанк (~1 МБ) грузится отдельно.

---

## Модульная структура `src/`

```
src/
├── core/           Типы, ошибки, Store, тема, утилиты, настройки
├── data/           Репозиторий, IDB, фильтрация, diff, расписание
├── map/            Карта MapLibre, стиль, маркеры, контролы, picker точек
├── offline/        Blobstore, downloader, pmtiles-source/key, thumbs, storage, sw-register
├── update/         Обновление данных и карты
├── routing/        Маршрут: deep-link в навигатор + офлайн-компас
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
| NET-02 | Сервер долго не отвечает |
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

### `theme.ts`

Предпочтение темы — **`'system' | 'light' | 'dark'`**, отдельно от *эффективной*
темы (`'light' | 'dark'`), которая и применяется:

- `systemPrefersDark()` — читает `matchMedia('(prefers-color-scheme: dark)')`
- `effectiveTheme(pref)` — резолвит `'system'` в текущую системную, иначе фиксирует
- `watchSystemTheme(cb)` — подписка на смену системной схемы (live-переключение, когда выбрано `'system'`); возвращает функцию отписки

### `device.ts`, `geo.ts`, `settings.ts`

- `getDeviceId()` — UUID в `localStorage` (`crypto.randomUUID()`), нужен для заголовка `X-Device-ID` при запросах к API
- `haversine()`, `bearing()` — WGS84-расстояние (в метрах) и азимут (0–360°) для офлайн-расстояний и компаса
- `loadTheme()` / `saveTheme()` (дефолт `'system'`) — персистентная тема в `localStorage`
- Навигатор: `loadNavigator()` (дефолт `'yandex_maps'`), `saveNavigator(id)`,
  `hasChosenNavigator()` — был ли навигатор выбран явно (проверяет наличие ключа
  `offline_kabinka.navigator` в `localStorage`). На этом построено запоминание
  навигатора в `routing/`: пока выбор не сделан — панель маршрута спрашивает один
  раз, затем сохраняет; `loadNavigator()` при этом всегда возвращает рабочий дефолт

---

## `data/` — данные

### `idb.ts`

База данных `offline_kabinka` (IndexedDB v2), два object store:

- `kv` — ключ-значение для сериализуемых данных (locations, thumbsIndex, mapVersion и т.д.)
- `blobs` — бинарные Blob-объекты (карта `minsk`, превью `thumbs`)

Экспортирует `getKV` / `setKV` и `getDatabase()` (общий коннект для blobstore).

### `repository.ts`

- `loadLocations()` — сначала читает из IDB (`kv.locations`); если пусто — загружает `public/data/locations.json` (baseline, прекэширован SW)
- `saveLocations(arr)` — сохраняет в IDB (+ `locationsUpdatedAt`)

### `filter.ts`

`applyFilters(list, filter)` — полностью клиентская: поиск по названию/адресу,
фильтры по типу, цене, доступности, тегам (логика «любой из выбранных»),
рейтингу, «открыто сейчас». `defaultFilter()` — пустой фильтр.

### `open-now.ts`

`isOpenNow(working_hours)` — вычисляет текущее состояние по расписанию. Временная
зона Europe/Minsk (UTC+3, постоянно). Поддерживает overnight-окна (close < open) и
перерывы (`break_start` / `break_end`).

`minskNow(date?)` — текущее время в Минске через `Intl.DateTimeFormat`.

### `diff.ts`

`diffLocations(oldArr, newArr)` → `{ added, removed, changed }` (массивы id).
Поле `distance_meters` исключено через `VOLATILE_FIELDS`, чтобы серверное значение
не давало ложных «изменений». Используется при обновлении данных для отчёта.

---

## `map/` — карта

### `map.ts`

- `createMap(container, style)` — создаёт `maplibregl.Map` с центром Минска (27.5667, 53.9023), zoom 12, minZoom 9, **maxZoom 16**, maxBounds = bbox Минска (27.30–27.78 / 53.78–54.02). Атрибуция показывается развёрнуто (`attributionControl: { compact: false }`)
- `registerPmtiles()` — регистрирует `pmtiles` протокол в MapLibre (`maplibregl.addProtocol('pmtiles', p.tile.bind(p))`); ровно один раз через флаг `__registered`
- `getProtocol()` — общий синглтон `Protocol` для сетевых и IDB-источников
- `setMapLanguage(map, lang)` — меняет `text-field` у слоёв `LABEL_LAYER_IDS` через `coalesce([name:ru/name:en], [name])`

> `maxZoom` карты — 16, но сам архив строится с `maxzoom=15` (`scripts/build-map.sh`):
> на z16 MapLibre дотягивает тайлы overzoom-ом. См. [проблему 9](problems-and-solutions.md).

### `style.ts`

`buildStyle({ lang, theme, pmtilesUrl })` — собирает `StyleSpecification`
(OpenMapTiles-схема):

- Источник: `pmtiles://<pmtilesUrl>` (подставляет bare key `minsk` или сетевой URL)
- Глифы: **локальные** — `GLYPHS_URL = BASE_URL + 'fonts/{fontstack}/{range}.pbf'` (шрифт `Noto Sans Regular` из `public/fonts/`, прекэшируется SW). Работает офлайн, без внешнего сервера
- Атрибуция: «© OpenMapTiles © OpenStreetMap contributors» — задана прямо на источнике (обязательна по лицензии)
- Темы: `light` / `dark` — разные палитры (`PALETTE`) для фона, воды, дорог, зданий, текста. `theme` здесь — уже *эффективная* тема

### `markers.ts`, `pick-list.ts`, `controls.ts`

`markers.ts` — источник `points` с кластеризацией (`cluster: true`, `clusterRadius
50`, `clusterMaxZoom 14`): слои кластеров со счётчиком (`clusters` /
`cluster-count`), одиночные точки (`unclustered`) с цветом по типу цены
(зелёный/синий/фиолетовый) и подписью рейтинга (`point-rating`). Поведение клика:

- **Клик по одиночной точке** — `queryRenderedFeatures(e.point, { layers:
  ['unclustered'] })`; если под пикселем оказалась ровно одна точка → `onSelect(id)`
  открывает карточку. Если несколько перекрывающихся точек (`> 1`) → попап
  `point-picker` со списком.
- **Клик по кластеру** — `getClusterExpansionZoom`: если зум *разобьёт* кластер
  (`zoom > текущего && zoom <= maxZoom`) → `easeTo` к нему. Если дальше не разбивается
  (точки co-located или уже максимальный зум) → `getClusterLeaves` и тот же попап
  `point-picker` (при одном листе — сразу `onSelect`).

**Picker точек** (`openPicker`) — один MapLibre `Popup` за раз (`closeButton`,
`closeOnClick`, класс `point-picker-popup`): заголовок (`map.pickTitle` —
«Несколько точек здесь») + список `point-picker__item` (цветная точка по
`price_type` + название), доступный с клавиатуры (фокус на первый пункт). Клик по
строке → `onSelect(id)`, закрытие попапа и `flyTo` к точке (zoom ≥ 16).
`updateMarkers()` закрывает устаревший picker перед сменой данных (после фильтра).

### `pick-list.ts`

`buildPickList(features)` — **чистая** функция (без импорта MapLibre, тестируется
отдельно): из набора MapLibre-фич (листья кластера или перекрывающиеся `unclustered`)
строит `PickItem[]` (`{ id, title, priceType }`). Отбрасывает фичи без конечного
числового `id`, дедуплицирует по `id`, сохраняет порядок. Используется
`markers.ts` для наполнения picker'а.

`controls.ts` — кастомные контролы (не штатные MapLibre): кнопки зума `+`/`−`
(в т.ч. на мобиле) и геолокация (`navigator.geolocation`, слой точки пользователя +
круг точности). Ошибка/отказ геолокации → `AppError('GEO-01')` через колбэк
`onError`.

---

## `offline/` — офлайн-хранилище

### `pmtiles-key.ts`

Один экспорт — константа `PMTILES_KEY = 'minsk'` (ключ карты в IndexedDB).
Вынесена в отдельный модуль без зависимостей нарочно: `downloader`/`storage`/
`map-update` импортируют только её и не тянут за собой `pmtiles-source.ts` (→
MapLibre) в свой чанк.

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

`useStoredPmtilesIfPresent(key)` — если Blob в IDB есть, регистрирует его на
`Protocol` и возвращает bare key.  
`resolvePmtilesUrl(key)` — возвращает bare key (`'minsk'`) или сетевой URL
(`BASE_URL + 'map/minsk.pmtiles'`).  
`buildStyle()` добавляет префикс `pmtiles://` к тому, что вернул `resolvePmtilesUrl`.

### `downloader.ts`

`downloadToBlob(url, onProgress, notOkCode?)` — стриминг в Blob со *stall*-таймаутом
(60 с, сбрасывается на каждом чанке). При офлайн — `NET-01`, при таймауте — `NET-02`.

Два независимых пакета качаются раздельно:
- `downloadMapPackage(onProgress)` — стримит `minsk.pmtiles` в IDB и пишет маркер версии
- `downloadThumbsPackage(onProgress)` — стримит `thumbs.bin` в IDB, тянет и сохраняет индекс, гидрирует in-memory пакет

`ensureOfflinePackage(onProgress)` — скачивает оба пакета, пропуская уже скачанные;
прогресс взвешен по размерам. Порядок: 1) карта → 2) thumbs.bin + индекс → 3)
гидрация in-memory пакета.

`loadThumbsPackFromIDB()` — при запуске: читает Blob + индекс из IDB и передаёт их в
`setPack()` (Blob **не** читается целиком в память).

Размеры для лейблов кнопок: `mapPackageBytes()` (из `map-version.json`),
`thumbsPackageBytes()` (HEAD за Content-Length), `packageBytes()`,
`pendingPackageBytes()` — каждый с офлайн-фолбэком на известные значения.

### `thumbs.ts`

Пакет превью держится как **ленивый Blob** прямо из IndexedDB (не `ArrayBuffer`),
так что ~8.3 МБ не висят в JS-heap всю сессию (важно для iOS).

`setPack(blob, index)` — регистрирует Blob + `ThumbIndex` (имя → [offset, length]).  
`getThumbObjectUrl(name)` — режет JPEG через `blob.slice(offset, len)` (лениво) и
кэширует object URL.  
`clearPack()` — сбрасывает пакет и отзывает object URL'ы (при удалении превью).  
`sliceFromIndex(buffer, index, name)` — чистая функция нарезки, тестируется отдельно.

### `storage.ts`

`estimateUsage()` → `{ total, breakdown: { map, thumbs, data, photos, shell },
photosEstimated }` (байты). Размер считается **точно** — по реальным размерам
blob-ов из IDB и читаемых ответов Cache, а **не** через
`navigator.storage.estimate().usage` (Chrome раздувал opaque-фото до ~537 МБ).
Фото — единственная оценочная корзина (entry count × номинал), отсюда флаг
`photosEstimated`.

`clearTransient()` — удаляет Workbox-кэш `photos` (полноразмерные фото), возвращает
освобождённые байты.  
`deleteMapPackage()` — удаляет blob карты + маркер версии.  
`deleteThumbsPackage()` — удаляет blob превью + индекс и сбрасывает in-memory пакет
(`clearPack`).  
`deletePackage()` — удаляет оба пакета (карта + превью).  
`mapDownloaded()` / `thumbsDownloaded()` — есть ли пакет в IDB. `formatBytes()` —
человекочитаемый размер.

### `sw-register.ts`

`registerServiceWorker()` — тонкая обёртка над `registerSW` из
`virtual:pwa-register` (`injectRegister: 'auto'`, `registerType: 'autoUpdate'`).
Импортируется из `main.ts` динамически **только в PROD** (в dev SW нет).

---

## `update/` — обновление данных и карты

### `data-update.ts`

In-app синхронизация с `kabinka.by/api/v1`: список (`per_page=500`) → детали →
комментарии → merge → `diffLocations` → сохранение. Заголовок `X-Device-ID`
обязателен. Поддерживает прерывание через `AbortSignal` с частичным сохранением
(уже обновлённые записи не теряются).

### `map-update.ts`

`checkMapUpdate()` — сравнивает версию из `map-version.json` с маркером
`mapVersion` в IDB (мягко на ошибках/офлайне; если маркера нет, но blob карты уже
есть — принимает текущую версию).  
`updateMap(onProgress)` — скачивает новый `.pmtiles`, делает sanity-check по магии
`PMTiles` (иначе `MAP-02`), сохраняет, обновляет маркер. Caller перестраивает стиль
без перезагрузки страницы.

---

## `routing/` — маршрут

`startRoute(map, loc, opts)` строит панель маршрута с **двумя независимыми
кнопками**, ни одна не блокирует другую:

- **«Открыть в навигаторе»** (`route.openInNavigator`) — работает **без
  геолокации**. Deep-link в Яндекс Карты / Яндекс Навигатор / Google / Apple через
  `navigatorUrl(id, lat, lng, from?)`. Аргумент `from` передаётся **только если есть
  позиция пользователя** (`opts.getUserPos()`): тогда маршрут строится откуда→куда,
  иначе навигатор сам берёт текущую позицию (только пункт назначения). Открытие:
  `http(s)`-ссылки — в новой вкладке (`window.open`), кастомные схемы (`yandexnavi://`)
  — через `window.location.href`.
  - **Запоминание навигатора:** в первый раз (`hasChosenNavigator()` == false)
    показывается инлайн-выбор навигатора (`route.pickNavigator`), выбор сохраняется
    (`saveNavigator`) и сразу открывается. Дальше открывает выбранным навигатором
    без вопросов. Кнопка **«Сменить навигатор»** (`route.changeNavigator`) скрыта,
    пока выбор не сделан, и появляется после первого выбора.
- **«Компас (офлайн)»** (`route.compass`) — **отдельная кнопка, требует
  геолокацию**. Рисует прямую линию user→destination (`GeoJSON LineString`),
  вписывает её в кадр (`fitBounds`) и показывает расстояние + азимут со
  стрелкой-компасом (`DeviceOrientationEvent`, `webkitCompassHeading` на iOS). Если
  позиции нет — дёргает `opts.onNeedGeo()` и выходит, **не** блокируя кнопку
  навигатора. Компас стартует только по нажатию (не автоматически).

Чистые билдеры ссылок `googleUrl`, `yandexUrl`, `yandexNaviUrl`, `appleUrl` и
диспетчер `navigatorUrl` покрыты тестами. Одна сессия компаса за раз; «Скрыть
маршрут» (`hideRoute`) сносит линию, панель и слушатель ориентации.

---

## `ui/` — интерфейс

| Файл | Назначение |
|---|---|
| `scaffold.ts` | Синхронный DOM-каркас без MapLibre: пустой `#map`, тулбар (фильтры), кнопка настроек, host под sheet. Сюда первым делом рисуется список |
| `shell.ts` | MapLibre-слой (ленивый чанк): `attachMap()` создаёт карту в `#map`, контролы, резолвит источник pmtiles |
| `sheet.ts` | Мобайл: bottom-sheet с 3 состояниями (`collapsed`/`middle`/`expanded`) + drag. В **свёрнутом** состоянии контент списка скрыт (CSS `.sheet[data-state='collapsed'] .sheet-scroll { display: none }`) — видна чистая полоса с грабером и резюме «N мест» (`setSummary()`, заполняется из `main.ts` как `${n} ${t('list.placesWord', {n})}`, без обрезанных строк). Десктоп: фиксированная левая панель, сворачивается (карта на весь экран) и открывается кнопкой «Показать список» |
| `list.ts` | Список локаций с расстояниями |
| `card.ts` | Карточка локации: данные, фото, маршрут, шаринг |
| `gallery.ts` | Карусель фото (стрелки ‹ ›, `draggable=false`) + полноэкранный просмотр + pinch/double-tap zoom + swipe |
| `lazy-thumb.ts` | Ленивая загрузка превью через общий `IntersectionObserver` (rootMargin 200px): `src` ставится при входе в кадр |
| `thumb-url.ts` | Резолвер превью: IDB-пакет (object URL) → dev-файл → онлайн-фолбэк |
| `filters.ts` | Модальное окно фильтров; применяются **мгновенно** — каждое изменение контрола сразу зовёт `onApply`. Кнопки «Применить» нет: в футере только «Сбросить»; закрытие — ✕ / фон / Esc |
| `settings.ts` | Настройки: язык UI/карты, тема (система/светлая/тёмная), навигатор, размер приложения, два офлайн-пакета, установка, обновление данных/карты |
| `search.ts` | Поле поиска по названию и адресу |
| `share.ts` | Web Share API + clipboard fallback, deep-link `#id=NN` |
| `toast.ts` | Тосты + оверлей прогресса загрузки |
| `modal.ts` | Лёгкий доступный модал/боттом-шит (body + footer, focus-trap, Esc/клик по фону) |
| `format.ts` | `formatDistance`, `formatPrice`, `esc` (экранирование для innerHTML) |
| `install-hint.ts` | Подсказка установки PWA. `detectPlatform()` → `ios`/`android`/`desktop` выбирает конкретные шаги (`install.stepsIos`/`stepsAndroid`/`stepsDesktop`). Где есть `beforeinstallprompt` (Android/desktop Chromium) — кнопка «Установить»; иначе (iOS и пр.) — пошаговая инструкция. Плюс разовый запрос `storage.persist()` |
| `banner-stack.ts` | Общий нижний стек баннеров (установка + оффер пакета не перекрывают друг друга) |

---

## `i18n/`

`t(key, params?)` — функция перевода с **фолбэком на русский** для непереведённых
ключей. Активный словарь переключается через `setLang(lang)` (хранится в
`localStorage` под `offline_kabinka.uiLang`).  
`ru.ts` — полный словарь (источник правды).  
`en.ts` — почти полный (несколько строк добираются фолбэком на `ru`).

---

## Поток данных при запуске

```
bootstrap()
  │
  ├── registerServiceWorker()          (только PROD, динамический импорт)
  ├── loadThumbsPackFromIDB()          (fire-and-forget → thumbsReady)
  ├── Store<AppState> = new Store(...) (theme=loadTheme(), navigator=loadNavigator())
  │
  ├── mountScaffold(root, { theme })   синхронный DOM без MapLibre
  │
  ├── loadLocations()                  → IDB → locations.json (SW-кэш)
  ├── await thumbsReady                ← ждём пакет превью перед первым рендером
  ├── drawList()                       первый рендер (карта ещё не загружена)
  │
  ├── selectFromHash()                 deep-link #id=NN
  ├── initInstallHint()                баннер установки + storage.persist()
  ├── maybeOfferOfflinePackage()       оффер, если карта не скачана
  │
  └── attachMapStack()                 ленивый import MapLibre-стека:
        ├── attachMap(mapEl, …)        создаёт карту (IDB-blob или сеть)
        ├── addMarkers() on 'load'
        └── дренаж отложенных flyTo/route
```

---

## Ключевые ограничения

- Глифы и данные (`locations.json`, индексы) — в прекэше SW; работают офлайн с первого запуска
- Полноразмерные фото грузятся с `kabinka.by/storage/` без доп. заголовков — кэшируются SW CacheFirst до 300 фото, 30 дней
- Карта и thumbs.bin не в git, собираются и деплоятся локально

---

Смотрите также:
- [docs/offline-and-ios.md](offline-and-ios.md) — детали офлайн-стратегии и iOS-нюансы
- [docs/problems-and-solutions.md](problems-and-solutions.md) — конкретные проблемы и решения
