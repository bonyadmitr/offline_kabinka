# Проблемы и решения

Конкретные проблемы, встреченные при разработке. Формат: симптом → причина →
решение. В конце — отдельный раздел про решения, от которых **отказались**.

---

## 1. Карта схлопывалась в height: 0

**Симптом:** контейнер карты рендерился с нулевой высотой, карта не отображалась.

**Причина:** MapLibre при инициализации вешает на контейнер класс
`.maplibregl-map { position: relative }`. Это правило имеет ту же специфичность, что
и `.map-container { position: absolute; inset: 0 }`, и перебивало его при
определённом порядке подключения стилей.

**Решение:** правило через id-селектор `#map.map-container { position: absolute;
inset: 0 }` имеет более высокую специфичность и не перебивается MapLibre.

---

## 2. Превью грузились из онлайн-фолбэка даже при наличии пакета в IDB

**Симптом:** первый рендер списка показывал онлайн-URL для превью вместо object URL
из пакета. При офлайн фотографии не отображались.

**Причина:** список рисовался сразу после загрузки данных. Гидрация пакета из IDB
(`loadThumbsPackFromIDB()`) запускалась параллельно — fire-and-forget — и ещё не
завершалась к моменту первого `drawList()`.

**Решение:** в `main.ts` гидрация остаётся fire-and-forget параллельно с монтажом и
загрузкой данных, но перед `drawList()` добавлен `await thumbsReady`. Первый рендер
всегда видит готовый пакет.

```typescript
const thumbsReady = loadThumbsPackFromIDB().catch(() => {});
// ... монтирование каркаса, загрузка данных ...
await thumbsReady;
drawList();
```

---

## 3. Отказ от OPFS в пользу IndexedDB Blob

**Симптом / предпосылка:** попытка хранить карту в Origin Private File System.

**Причина:** на iOS Safari `FileSystemWritableFileStream.createWritable()` не
поддерживается. `createSyncAccessHandle()` работает только в Web Worker — требует
дополнительной инфраструктуры и капризен при инициализации.

**Решение:** хранить карту и thumbs.bin как `Blob` в IndexedDB (store `blobs`).
Чтение — через `blob.slice(offset, offset + length).arrayBuffer()` — ленивое, без
воркера. У установленного PWA IDB не подпадает под 7-дневную очистку. Профиль
памяти такой же: в памяти только запрошенные диапазоны байт.

Подробнее: [docs/offline-and-ios.md](offline-and-ios.md).

---

## 4. fake-indexeddb ронял Blob в тестах

**Симптом:** тесты, сохраняющие Blob в IDB и читающие обратно, получали plain
object без `.size` и `.arrayBuffer()`.

**Причина:** `fake-indexeddb` внутри использует глобальный `structuredClone()`.
jsdom-Blob Node.js не распознаёт как Transferable/Serializable — он превращается в
`{}`.

**Решение:** в `tests/setup.ts` перезаписан глобальный `Blob` нативным из
`node:buffer`:

```typescript
import { Blob as NodeBlob } from 'node:buffer';
Object.defineProperty(globalThis, 'Blob', {
  value: NodeBlob,
  writable: true,
  configurable: true,
});
```

Нативный Node-Blob `structuredClone` умеет клонировать корректно.

---

## 5. Интеграция pmtiles v4 с MapLibre

**Симптом / задача:** pmtiles v4 изменил API по сравнению с v3; документация
MapLibre описывала старый способ подключения.

**Причина и нюансы:**
- `Protocol.tile` — это метод объекта, при передаче в `addProtocol` теряет `this`
- Кастомный источник (`IDBBlobSource`) должен реализовать интерфейс `Source { getKey(), getBytes() }` из пакета `pmtiles`
- Источник регистрируется через `protocol.add(new PMTiles(source))`, ключ берётся из `getKey()`
- В стиле URL должен быть `pmtiles://<key>`, где `<key>` совпадает с `getKey()`

**Решение:**
```typescript
maplibregl.addProtocol('pmtiles', p.tile.bind(p));  // bind обязателен
protocol.add(new PMTiles(new IDBBlobSource(blob, 'minsk')));
// стиль: source.url = 'pmtiles://minsk'
```

Сетевой и IDB-источники должны быть зарегистрированы на одном экземпляре
`Protocol`. Синглтон `getProtocol()` в `map/map.ts` обеспечивает это.

---

## 6. Обязательная атрибуция OpenMapTiles/OSM

**Симптом / задача:** карта рендерится из данных OSM через схему OpenMapTiles.

**Причина:** лицензии OSM (ODbL) и OpenMapTiles требуют явного указания авторства
при публичном отображении карты.

**Решение:** атрибуция добавлена непосредственно в источник стиля в `style.ts`:

```typescript
attribution: '© <a href="…">OpenMapTiles</a> © <a href="…">OpenStreetMap</a> contributors'
```

Чтобы кредит был **видимым**, а не спрятанным за иконкой ⓘ, карта создаётся с
`attributionControl: { compact: false }` (`map/map.ts`).

---

## 7. API kabinka.by: нестандартный параметр и обязательный заголовок

**Симптом:** запросы к API возвращали 401/400 или неверные результаты.

**Причина и нюансы:**
- Параметр долготы называется `lng` (не стандартный `lon`)
- Параметр `radius` максимум 50 000 (метров); больше — ошибка
- Все запросы к `/api/*` требуют заголовок `X-Device-ID`
- Поля `is_open_now` и `distance_meters` вычисляются сервером на момент запроса — в офлайн-режиме они бесполезны

**Решение:**
- Device ID хранится в `localStorage` (UUID, `crypto.randomUUID()`) — `src/core/device.ts`
- Для скрипта `build-data.mjs` ID хранится в файле `scripts/.device_id`
- `is_open_now` / `distance_meters` не используются — вычисляются клиентски
- `distance_meters` добавлено в `VOLATILE_FIELDS` в `diff.ts`, чтобы серверное значение не давало ложных «изменений» при diff

---

## 8. Карта не в git + деплой без CI

**Симптом / задача:** `minsk.pmtiles` (~31 МБ) нельзя коммитить в git; GitHub
Actions не может собрать карту (нет Java + OSM в CI, долго).

**Причина:** бинарь большой, сборка занимает несколько минут и требует загрузки
~1.3 ГБ источников.

**Решение:**
- Карта собирается локально (`bash scripts/build-map.sh`), результат в `../minsk_map/` и `public/map/` (оба пути в `.gitignore`)
- `vite build` копирует `public/` в `dist/` — карта попадает в бандл при сборке
- Деплой: `bash scripts/deploy.sh` собирает прод-бандл и публикует `dist/` в ветку `gh-pages` **из временной папки вне репозитория** через `git init` + `git add -A -f` + force-push

> **Почему не `npx gh-pages`** — см. раздел «Неудачные решения» ниже: его кэш под
> `node_modules` наследовал `.gitignore` и молча выкидывал карту из деплоя.

Ветка `main` не содержит бинарников; ветка `gh-pages` содержит полный `dist/`
включая карту. Каждый деплой — свежий одиночный коммит, старые блобы не копятся.

---

## 9. Planetiler: исходники при первом запуске

**Симптом:** первая сборка карты очень долгая.

**Причина:** Planetiler скачивает OSM-экстракт Беларуси, Natural Earth и
water-polygons (~1.3–1.7 ГБ) — это самый долгий этап.

**Решение:** источники кэшируются **вне репозитория, в `../maps`** (`SRC_DIR` в
`scripts/build-map.sh`); временные файлы и jar — под `.osm-cache/`. Повторные сборки
занимают несколько минут. Архив строится с `--maxzoom=15` (переопределяется
`MAXZOOM`); при `MAXZOOM=15` `minsk.pmtiles` весит ~31 МБ. Карта в MapLibre открыта
до `maxZoom 16` — z16 дотягивается overzoom-ом.

---

## 10. Node 26 + Vitest 4: проблема с localStorage

**Симптом:** тесты, использующие `localStorage`, падали — `localStorage` был
`undefined`.

**Причина:** Node.js 26 добавил экспериментальный Web Storage API и выставил
`globalThis.localStorage = undefined`. Vitest + jsdom не перезаписывает его, так что
реальный jsdom-`localStorage` оказывался недоступен.

**Решение:** в `tests/setup.ts` явно прокидывается jsdom-`localStorage`:

```typescript
const jsdomLocalStorage = (window as any)._localStorage;
if (jsdomLocalStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: jsdomLocalStorage,
    writable: true,
    configurable: true,
  });
}
```

Также: `vitest.config.ts` вынесен в отдельный файл и импортирует из
`'vitest/config'` (не из `'vite'`) — это требование Vitest 4.

---

## 11. Тёмная тема и iOS overscroll

**Симптом:** при тёмной теме на iOS во время резиновой прокрутки (overscroll) фон
страницы оставался белым.

**Причина:** CSS-переменная `--bg` и класс `theme-dark` были на `#app` — контейнере
приложения. `<body>` оставался без тёмного фона. iOS рисует overscroll-область по
цвету `<body>`.

**Решение:** класс `theme-dark` переключается на `document.documentElement`
(`<html>`):

```typescript
document.documentElement.classList.toggle('theme-dark', dark);
```

CSS-переменные на `:root` / `html` достигают `body`, и overscroll закрашивается
правильно.

---

## 12. thumbs.bin в памяти: ArrayBuffer → ленивый Blob

**Симптом / задача:** ранний код читал весь пакет превью (~8.3 МБ) из IDB в
`ArrayBuffer` и держал его в памяти всю сессию — заметная нагрузка на JS-heap, особенно на iOS.

**Причина:** `setPack()` принимал `ArrayBuffer`, и нарезка шла из него
(`buffer.slice`). Буфер не освобождался.

**Решение:** пакет держится как сам **Blob** из IndexedDB.
`getThumbObjectUrl(name)` режет JPEG через `blob.slice(offset, len)` — это лениво:
срез материализует байты только при чтении (например, `URL.createObjectURL`). Так
весь пакет в heap не висит. Чистая `sliceFromIndex()` оставлена для юнит-теста.

---

## 13. Скрытые виды карточки и списка теряли hidden-состояние

**Симптом:** после `renderCard()` или `renderList()` элемент переставал быть скрытым
(`hidden`), хотя должен был оставаться невидимым.

**Причина:** функции перезаписывали `element.className` целиком, затирая класс
`.sheet-view` (и `hidden` из него).

**Решение:** добавлено CSS-правило, гарантирующее скрытие через атрибут `hidden`:

```css
.card[hidden], .list[hidden] { display: none; }
```

Атрибут `hidden` стал авторитетным источником видимости независимо от `className`.

---

## 14. Обновление данных не удаляло исчезнувшие из API точки

**Симптом:** удалённые из kabinka.by локации продолжали отображаться после
обновления.

**Причина:** первая реализация `data-update.ts` делала наивный merge: обновляла
совпадающие записи, но не проверяла, какие старые id исчезли из ответа API.

**Решение:** переработан полный проход с `diffLocations()`:
1. Загрузить полный список из API
2. Загрузить текущий сохранённый список
3. Вычислить diff: added / removed / changed
4. Применить все изменения, включая удаление `removed` записей
5. Сохранить результат

Частичное сохранение при прерывании (AbortSignal): уже обработанные записи
записываются поверх старых и не регрессируют.

---

## 15. Деплой обрывался на push большого `gh-pages`

**Симптом:** `bash scripts/deploy.sh` падал на `git push` ветки `gh-pages` (~40 МБ:
карта ~31 МБ + thumbs.bin ~8 МБ + shell) с ошибкой `RPC failed; curl 55 ... broken
pipe` — push не доходил до конца.

**Причина:** git по умолчанию буферизует тело POST-запроса небольшим
`http.postBuffer`; на крупном одиночном пуше HTTP/RPC-поток рвался, а сетевые
разрывы при ~40 МБ за один заход случались и сами по себе.

**Решение:** в `scripts/deploy.sh` перед пушем поднят буфер и добавлены ретраи:

```bash
git config http.postBuffer 524288000   # 500 МБ — чтобы RPC не резался
n=0; until git push -f "$REPO_URL" gh-pages; do
  n=$((n+1)); [ "$n" -ge 3 ] && { echo "ERROR: gh-pages push failed after $n attempts" >&2; exit 1; }
  echo "push failed, retry $n…" >&2
done
```

Push повторяется до 3 раз на транзиентных разрывах; больший `postBuffer` снимает
сам обрыв `curl 55`.

---

## 16. Нет app-управляемого кеша тайлов карты

**Симптом / вопрос (вывод по отзыву):** искали «временное» хранилище карты, которое
можно почистить, и почему оно не отражается в «Размере приложения».

**Причина:** такого хранилища нет by design. Онлайн-карта (пока не скачана пакетом)
грузится range-запросами в **браузерный HTTP-кеш** — им управляет браузер, не
приложение. `minsk.pmtiles` **не попадает в precache** (в `vite.config.ts`
`globPatterns` — только `*.{js,css,html,svg,png,woff2,json}` + `fonts/**/*.pbf`, а
`globIgnores` явно содержит `**/*.pmtiles`) и **не входит в `runtimeCaching`** (там
единственное правило — `CacheFirst` для `kabinka.by/storage/`, т.е. фото). Офлайн
карта берётся из **IDB-блоба** `minsk`, а не из кеша.

**Решение / следствие:** отдельной «временной» корзины карты для очистки не
существует. `clearTransient()` чистит только Workbox-кэш `photos` (полноразмерные
фото) и блоба карты не касается. Онлайн-тайлы карты **не учитываются** в
`estimateUsage()` — «Размер приложения» считает blob карты из IDB, blob превью,
shell, данные и (оценочно) фото. Подробнее:
[docs/offline-and-ios.md](offline-and-ios.md) → «Карта: нет app-управляемого кеша
тайлов».

---

# Неудачные решения и почему отказались

Подходы, которые пробовали или напрашивались, но заменили:

- **OPFS для карты → IndexedDB-Blob.** На iOS Safari `createWritable()` нет, а
  `createSyncAccessHandle()` только в воркере и капризен. IDB проще и держит ту же
  персистентность у установленного PWA. (см. проблему 3 выше)

- **`npx gh-pages` → temp-dir + `git add -f` + force-push.** Кэш `gh-pages` живёт
  под `node_modules` и наследует репозиторный `.gitignore` (где `*.pmtiles`,
  `public/map/`, `dist`), из-за чего 31 МБ-карта молча не попадала в деплой. Сейчас
  публикуем из папки вне репозитория с принудительным `git add -A -f`. (см. проблему 8 выше)

- **`navigator.storage.estimate().usage` → точный расчёт.** Chrome добавляет
  паддинг к cross-origin opaque-фото, и оценка раздувалась до ~537 МБ. Заменено на
  суммирование реальных размеров blob-ов из IDB и читаемых ответов Cache
  (`estimateUsage`, поле `photosEstimated` для оценочной фото-корзины).

- **`X-Device-ID` на запросах фото → без заголовка.** Любой кастомный заголовок на
  `/storage/` инициировал CORS preflight, который ломал загрузку. Фото грузятся
  простым `<img>` без заголовков; `X-Device-ID` остаётся только на `/api/*`. (см. проблему 7 выше)

- **Карта в git → бинарь вне репозитория.** ~31 МБ нельзя держать в `main`; собирается
  локально, кладётся в `../minsk_map/` + `public/map/` (gitignored), едет только в
  `gh-pages`. (см. проблему 8 выше)

- **Высокий maxzoom архива → `maxzoom=15`.** Каждый уровень кратно раздувает
  `.pmtiles`. Архив строится до z15; карта открыта до `maxZoom 16` (overzoom). (см. проблему 9 выше)

- **thumbs.bin как `ArrayBuffer` в памяти → ленивый Blob.** Держать ~8.3 МБ в heap
  всю сессию накладно на iOS; перешли на `blob.slice()`. (см. проблему 12 выше)

- **Статический импорт MapLibre → code-split.** Движок (~1 МБ) тянул входной чанк и
  задерживал первый показ списка. Вынесен в ленивый чанк (`ui/scaffold.ts` строит
  DOM без MapLibre; `ui/shell.ts` грузится динамически из `main.ts`;
  `offline/pmtiles-key.ts` отделяет константу, чтобы не тащить движок в чанки
  downloader/storage).

---

Смотрите также:
- [docs/architecture.md](architecture.md) — структура модулей
- [docs/offline-and-ios.md](offline-and-ios.md) — офлайн-стратегия целиком
- Референс UI (вне этого репозитория): `../docs/kabinka-map-ui.md`
