# Проблемы и решения

13 конкретных проблем, встреченных при разработке. Формат: симптом → причина → решение.

---

## 1. Карта схлопывалась в height: 0

**Симптом:** контейнер карты рендерился с нулевой высотой, карта не отображалась.

**Причина:** MapLibre при инициализации вешает на контейнер класс `.maplibregl-map { position: relative }`. Это правило имеет ту же специфичность, что и `.map-container { position: absolute; inset: 0 }`, и перебивало его при определённом порядке подключения стилей.

**Решение:** правило через id-селектор `#map.map-container { position: absolute; inset: 0 }` имеет более высокую специфичность и не перебивается MapLibre.

---

## 2. Превью грузились из онлайн-фолбэка даже при наличии пакета в IDB

**Симптом:** первый рендер списка показывал онлайн-URL для превью вместо object URL из пакета. При офлайн фотографии не отображались.

**Причина:** список рисовался сразу после загрузки данных. Гидрация 8.3 МБ пакета из IDB (`loadThumbsPackFromIDB()`) запускалась параллельно — fire-and-forget — и ещё не завершалась к моменту первого `drawList()`.

**Решение:** в `main.ts` запуск гидрации — fire-and-forget параллельно с монтированием карты и загрузкой данных, но перед `drawList()` добавлен `await thumbsReady`. Пакет гидрируется параллельно с остальной инициализацией, и первый рендер всегда видит готовый пакет.

```typescript
const thumbsReady = loadThumbsPackFromIDB().catch(() => {});
// ... монтирование карты, загрузка данных ...
await thumbsReady;
drawList();
```

---

## 3. Отказ от OPFS в пользу IndexedDB Blob

**Симптом / предпосылка:** попытка хранить карту в Origin Private File System.

**Причина:** на iOS Safari `FileSystemWritableFileStream.createWritable()` не поддерживается. `createSyncAccessHandle()` работает только в Web Worker — требует дополнительной инфраструктуры и капризен при инициализации.

**Решение:** хранить карту и thumbs.bin как `Blob` в IndexedDB (store `blobs`). Чтение — через `blob.slice(offset, offset + length).arrayBuffer()` — ленивое, без воркера. У установленного PWA IDB не подпадает под 7-дневную очистку. Профиль памяти такой же: в памяти только запрошенные диапазоны байт.

Подробнее: [docs/offline-and-ios.md](offline-and-ios.md#indexeddb-карта-и-превью).

---

## 4. fake-indexeddb ронял Blob в тестах

**Симптом:** тесты, сохраняющие Blob в IDB и читающие обратно, получали plain object без `.size` и `.arrayBuffer()`.

**Причина:** `fake-indexeddb` внутри использует глобальный `structuredClone()`. jsdom-Blob Node.js не распознаёт как Transferable/Serializable — он превращается в `{}`.

**Решение:** в `tests/setup.ts` перезаписан глобальный `Blob` нативным из `node:buffer`:

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

**Симптом / задача:** pmtiles v4 изменил API по сравнению с v3; документация MapLibre описывала старый способ подключения.

**Причина и нюансы:**
- `Protocol.tile` — это метод объекта, при передаче в `addProtocol` теряет `this`
- Кастомный источник (`IDBBlobSource`) должен реализовать интерфейс `Source { getKey(), getBytes() }` из пакета `pmtiles`
- Источник регистрируется через `protocol.add(new PMTiles(source))`, ключ берётся из `getKey()`
- В стиле URL должен быть `pmtiles://<key>`, где `<key>` совпадает с `getKey()`

**Решение:**
```typescript
maplibregl.addProtocol('pmtiles', p.tile.bind(p));  // bind обязателен
protocol.add(new PMTiles(new IDBBlobSource(blob, 'minsk')));
// стиль: source.tiles = ['pmtiles://minsk/{z}/{x}/{y}']
```

Сетевой и IDB-источники должны быть зарегистрированы на одном экземпляре `Protocol`. Синглтон `getProtocol()` в `map/map.ts` обеспечивает это.

---

## 6. Обязательная атрибуция OpenMapTiles/OSM

**Симптом / задача:** карта рендерится из данных OSM через схему OpenMapTiles.

**Причина:** лицензии OSM (ODbL) и OpenMapTiles требуют явного указания авторства при публичном отображении карты.

**Решение:** атрибуция добавлена непосредственно в источник стиля в `style.ts`:

```typescript
attribution: '© <a href="...">OpenMapTiles</a> © <a href="...">OpenStreetMap contributors</a>'
```

MapLibre показывает атрибуцию через стандартный контрол (`compact: true`).

---

## 7. API kabinka.by: нестандартный параметр и обязательный заголовок

**Симптом:** запросы к API возвращали 401/400 или неверные результаты.

**Причина и нюансы:**
- Параметр долготы называется `lng` (не стандартный `lon`)
- Параметр `radius` максимум 50 000 (метров); больше — ошибка
- Все запросы к `/api/*` требуют заголовок `X-Device-ID`
- Поля `is_open_now` и `distance_meters` вычисляются сервером на момент запроса — в офлайн-режиме они бесполезны

**Решение:**
- Device ID хранится в `localStorage` (UUID, генерируется один раз через `crypto.randomUUID()`) — `src/core/device.ts`
- Для скрипта `build-data.mjs` ID хранится в файле `scripts/.device_id`
- `is_open_now` / `distance_meters` не сохраняются в `locations.json` — вычисляются клиентски
- Поле `distance_meters` добавлено в `VOLATILE_FIELDS` в `diff.ts`, чтобы серверное значение не приводило к ложным «изменениям» при diff

---

## 8. Карта не в git + деплой без CI

**Симптом / задача:** `minsk.pmtiles` (~31 МБ) нельзя коммитить в git; GitHub Actions не может собрать карту (нет Java + OSM в CI, долго).

**Причина:** бинарь большой, сборка занимает несколько минут и требует загрузки ~1.3 ГБ источников.

**Решение:**
- Карта собирается локально (`bash scripts/build-map.sh`), результат в `../minsk_map/` и `public/map/` (оба пути в `.gitignore`)
- `vite build` копирует `public/` в `dist/` — карта попадает в бандл при сборке
- Деплой: `bash scripts/deploy.sh` запускает `npm run build` и `npx gh-pages -d dist -b gh-pages`
- Ветка `main` не содержит бинарников; ветка `gh-pages` содержит полный `dist/` включая карту

---

## 9. Planetiler: водные полигоны при первом запуске

**Симптом:** первая сборка карты очень долгая (~15–20 минут).

**Причина:** Planetiler скачивает `water-polygons-split-3857.zip` (~780 МБ) из Natural Earth — это самый долгий этап.

**Решение:** файлы кэшируются в `.osm-cache/sources/`. Повторные сборки занимают несколько минут. OSM-экстракт Беларуси тоже кэшируется. Итоговый `minsk.pmtiles` при `MAXZOOM=15` весит ~31 МБ.

---

## 10. Node 26 + Vitest 4: проблема с localStorage

**Симптом:** тесты, использующие `localStorage`, падали — `localStorage` был `undefined`.

**Причина:** Node.js 26 добавил экспериментальный Web Storage API и выставил `globalThis.localStorage = undefined`. Vitest + jsdom не перезаписывает его, так что реальный jsdom-`localStorage` оказывался недоступен.

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

Также: `vitest.config.ts` вынесен в отдельный файл и импортирует из `'vitest/config'` (не из `'vite'`) — это требование Vitest 4.

---

## 11. Тёмная тема и iOS overscroll

**Симптом:** при тёмной теме на iOS во время резиновой прокрутки (overscroll) фон страницы оставался белым.

**Причина:** CSS-переменная `--bg` и класс `theme-dark` были на `#app` — контейнере приложения. `<body>` оставался без тёмного фона. iOS рисует overscroll-область по цвету `<body>`.

**Решение:** класс `theme-dark` переключается на `document.documentElement` (`<html>`):

```typescript
document.documentElement.classList.toggle('theme-dark', theme === 'dark');
```

CSS-переменные на `:root` / `html` достигают `body`, и overscroll закрашивается правильно.

---

## 12. Скрытые виды карточки и списка теряли hidden-состояние

**Симптом:** после `renderCard()` или `renderList()` элемент переставал быть скрытым (`hidden`), хотя должен был оставаться невидимым.

**Причина:** функции `renderCard` и `renderList` перезаписывали `element.className` целиком, затирая класс `.sheet-view` (и `hidden` из него).

**Решение:** добавлено CSS-правило, гарантирующее скрытие через атрибут `hidden`:

```css
.card[hidden], .list[hidden] { display: none; }
```

Атрибут `hidden` стал авторитетным источником видимости независимо от `className`.

---

## 13. Обновление данных не удаляло исчезнувшие из API точки

**Симптом:** удалённые из kabinka.by локации продолжали отображаться в приложении после обновления.

**Причина:** первая реализация `data-update.ts` делала наивный merge: итерировала по новым данным и обновляла совпадающие записи, но не проверяла, какие старые id исчезли из нового ответа API.

**Решение:** переработан полный проход с `diffLocations()`:
1. Загрузить полный список из API
2. Загрузить текущий сохранённый список
3. Вычислить diff: added / removed / changed
4. Применить все изменения, включая удаление `removed` записей
5. Сохранить результат

Частичное сохранение при прерывании (AbortSignal): уже обработанные записи записываются поверх старых и не регрессируют.

---

Смотрите также:
- [docs/architecture.md](architecture.md) — структура модулей
- [docs/offline-and-ios.md](offline-and-ios.md) — офлайн-стратегия целиком
