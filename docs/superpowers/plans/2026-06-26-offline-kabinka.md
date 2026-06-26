# Offline Kabinka — План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Офлайн-PWA-просмотрщик туалетов Минска на MapLibre+PMTiles с фильтрами, карточками, фото, обновлением данных/карты и деплоем на GitHub Pages.

**Architecture:** Статический Vite+TypeScript SPA без UI-фреймворка (vanilla + мини-стор). Данные — вшитый `locations.json` + переопределение из IndexedDB. Карта — векторные PMTiles в OPFS, читаются через Web Worker. Офлайн — Service Worker (оболочка) + менеджер загрузки тяжёлых ассетов с прогрессом. Чистая логика (open-now/фильтры/diff/routing) изолирована и покрыта юнит-тестами.

**Tech Stack:** Vite, TypeScript, MapLibre GL JS, pmtiles, idb, Vitest, Playwright, Planetiler (сборка карты), gh (деплой).

**Спецификация:** `docs/superpowers/specs/2026-06-26-offline-kabinka-design.md`. **Референс kabinka.by/map:** `../../../../docs/kabinka-map-ui.md`. **API:** `../../../../docs/API.md`.

**Рабочая папка:** `/Users/y.bondar/Downloads/OfflineMaps/app_web_offline_kabinka`. **Исходные ассеты:** данные `../data/locations.json`, превью `../thumbs/`, выход карты `../minsk_map/`.

---

## Карта файлов (ответственность)

| Файл | Ответственность |
|---|---|
| `src/core/types.ts` | Доменные типы (Location, Tag, Photo, WorkingHour, Comment, фильтры) |
| `src/core/errors.ts` | Каталог кодов ошибок + `AppError` + `toUserMessage()` |
| `src/core/store.ts` | Мини pub/sub стор состояния приложения |
| `src/core/device.ts` | Генерация/хранение `deviceId` (UUID, один раз) |
| `src/core/geo.ts` | Haversine, азимут (bearing) |
| `src/data/types.ts` | (см. core/types) — реэкспорт при необходимости |
| `src/data/repository.ts` | Загрузка локаций: baseline + IndexedDB-override |
| `src/data/open-now.ts` | «Открыто сейчас» по Europe/Minsk |
| `src/data/filter.ts` | Клиентская фильтрация + поиск |
| `src/data/diff.ts` | Diff наборов (added/removed/changed) |
| `src/data/idb.ts` | Обёртка IndexedDB (idb) для данных и версий |
| `src/map/map.ts` | Инициализация MapLibre, pmtiles-протокол, источники |
| `src/map/style.ts` | Стили light/dark × язык RU/EN (фабрика стиля) |
| `src/map/markers.ts` | Маркеры по price_type + рейтинг, кластеризация |
| `src/map/controls.ts` | Зум (+ мобайл), геолокация, рецентр |
| `src/routing/index.ts` | `Router` интерфейс; `LineRouter`, `DeeplinkRouter`; deep-link билдеры |
| `src/offline/idb.ts` | (см. data/idb) общая БД |
| `src/offline/opfs.ts` | OPFS: запись/чтение файлов (через worker) |
| `src/offline/pmtiles-worker.ts` | Worker: чтение диапазонов pmtiles из OPFS |
| `src/offline/thumbs.ts` | Загрузка/распаковка `thumbs.bin` по индексу → object URLs |
| `src/offline/downloader.ts` | Менеджер загрузки ассетов с прогрессом + ошибками |
| `src/offline/storage.ts` | `estimate()`, разбивка по бакетам, clear-cache, persist |
| `src/offline/sw-register.ts` | Регистрация Service Worker |
| `public/sw.js` | Service Worker (precache оболочки, runtime-cache фото) |
| `src/update/data-update.ts` | In-app обновление данных (прогресс/ошибки/diff) |
| `src/update/map-update.ts` | In-app обновление карты (версия/прогресс/ошибки) |
| `src/i18n/index.ts` | Словари, `t()`, переключение языка UI |
| `src/i18n/ru.ts`, `src/i18n/en.ts` | Строки (ru полный, en каркас) |
| `src/ui/shell.ts` | Каркас: карта + sheet/панель, монтирование |
| `src/ui/sheet.ts` | Bottom-sheet (3 состояния, мобайл) / панель (десктоп) |
| `src/ui/list.ts` | Список ближайших |
| `src/ui/card.ts` | Детальная карточка |
| `src/ui/gallery.ts` | Галерея + полноэкранный просмотрщик фото |
| `src/ui/filters.ts` | Модалка фильтров |
| `src/ui/settings.ts` | Модалка настроек |
| `src/ui/search.ts` | Поиск |
| `src/ui/share.ts` | Шаринг-ссылка + открытие по `#id` |
| `src/ui/toast.ts` | Тосты/прогресс/ошибки (с кодами) |
| `src/ui/install-hint.ts` | Закрываемая подсказка установки PWA |
| `src/main.ts` | Точка входа, склейка |
| `scripts/build-data.mjs` | Пересборка baseline из API |
| `scripts/build-map.sh` | OSM→pmtiles в `../minsk_map/` + `map-version.json` |
| `scripts/pack-thumbs.mjs` | `../thumbs/*.jpg` → `thumbs.bin` + `thumbs-index.json` |
| `scripts/deploy.sh` | Сборка dist + вкладка ассетов + публикация на Pages |
| `.claude/skills/*` | Проектные скилы (deploy/test/build-map/update-data/run/optimize-size) |

---

## Фаза 0 — Каркас и инструменты

### Task 1: Инициализация проекта

**Files:** Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `index.html`, `src/main.ts`

- [ ] **Step 1:** В `app_web_offline_kabinka` инициализировать проект:
```bash
cd /Users/y.bondar/Downloads/OfflineMaps/app_web_offline_kabinka
npm init -y
npm i maplibre-gl pmtiles idb
npm i -D vite typescript vitest @vitest/coverage-v8 jsdom playwright @playwright/test
npx playwright install chromium
git init && git branch -M main
```
- [ ] **Step 2:** `vite.config.ts` с `base: '/offline_kabinka/'`, vitest (environment `jsdom`), worker формат ES:
```ts
import { defineConfig } from 'vite';
export default defineConfig({
  base: '/offline_kabinka/',
  worker: { format: 'es' },
  test: { environment: 'jsdom', globals: true, include: ['tests/unit/**/*.test.ts'] },
});
```
- [ ] **Step 3:** `tsconfig.json` (target ES2022, module ESNext, strict, moduleResolution bundler, types vitest/globals). `index.html` с `#app`, `<meta viewport>` (`viewport-fit=cover` для iOS notch). Минимальный `src/main.ts` (console.log).
- [ ] **Step 4:** `.gitignore`:
```
node_modules
dist
*.pmtiles
public/map/
public/thumbs/thumbs.bin
public/thumbs/thumbs-index.json
.osm-cache/
test-results/
playwright-report/
```
- [ ] **Step 5:** Проверить запуск: `npm run dev` (vite) поднимается. Commit:
```bash
git add -A && git commit -m "chore: scaffold Vite+TS PWA project"
```

### Task 2: Доменные типы

**Files:** Create: `src/core/types.ts`

- [ ] **Step 1:** Описать типы (точно по структуре `../data/locations.json`):
```ts
export type LayoutType = 'block' | 'separate_male' | 'separate_female' | 'unisex';
export type PriceType = 'free' | 'paid' | 'conditional_free';
export interface WorkingHour { day: number; open: string | null; close: string | null; break_start?: string | null; break_end?: string | null; is_closed?: boolean; }
export interface Tag { id: number; slug: string; name: string; icon?: string; }
export interface Photo { remote: string; url: string; thumb: string; }
export interface Comment { id: number; location_id: number; user_device_id?: string; comment_text: string; status?: string; is_verified?: boolean; author_name?: string; author_emoji?: string; created_at?: string; }
export interface Location {
  id: number; title: string; description?: string | null; address?: string;
  latitude: number; longitude: number;
  layout_type: LayoutType; price_type: PriceType; price_value?: number | null; condition_text?: string | null;
  is_accessible: boolean; is_verified: boolean;
  cabins_count?: number; urinals_count?: number; sinks_count?: number;
  rating_overall?: number; rating_cleanliness_avg?: number; rating_equipment_avg?: number; rating_loyalty_avg?: number;
  reviews_count?: number;
  tags: Tag[]; photos: Photo[]; working_hours: WorkingHour[]; comments: Comment[];
}
export interface FilterState {
  openNow: boolean; layoutTypes: Set<LayoutType>; priceTypes: Set<PriceType>;
  accessibleOnly: boolean; tagSlugs: Set<string>; minRating: number; query: string;
}
```
- [ ] **Step 2:** Commit: `git add -A && git commit -m "feat: domain types"`

### Task 3: Каталог ошибок

**Files:** Create: `src/core/errors.ts`, Test: `tests/unit/errors.test.ts`

- [ ] **Step 1 (test):**
```ts
import { AppError, toUserMessage } from '../../src/core/errors';
test('toUserMessage includes code', () => {
  expect(toUserMessage(new AppError('NET-01'))).toMatch(/NET-01/);
});
test('unknown error maps to generic with code', () => {
  expect(toUserMessage(new Error('boom'))).toMatch(/UNK-01/);
});
```
- [ ] **Step 2:** Run `npx vitest run tests/unit/errors.test.ts` → FAIL.
- [ ] **Step 3 (impl):**
```ts
export type ErrCode = 'NET-01'|'NET-02'|'API-01'|'API-02'|'MAP-01'|'MAP-02'|'DATA-01'|'STOR-01'|'IMG-01'|'GEO-01'|'UNK-01';
const MESSAGES: Record<ErrCode,string> = {
  'NET-01':'Нет интернета — обновление недоступно',
  'NET-02':'Сервер долго не отвечает, попробуйте позже',
  'API-01':'Сервер обновления недоступен',
  'API-02':'Не удалось разобрать ответ сервера',
  'MAP-01':'Не удалось скачать карту',
  'MAP-02':'Файл карты повреждён',
  'DATA-01':'Недостаточно места для данных',
  'STOR-01':'Хранилище недоступно',
  'IMG-01':'Фото недоступно',
  'GEO-01':'Доступ к геолокации не получен',
  'UNK-01':'Непредвиденная ошибка',
};
export class AppError extends Error { constructor(public code: ErrCode, public cause?: unknown){ super(code);} }
export function toUserMessage(e: unknown): string {
  const code: ErrCode = e instanceof AppError ? e.code : 'UNK-01';
  return `${MESSAGES[code]} (${code})`;
}
```
- [ ] **Step 4:** Run test → PASS. **Step 5:** Commit `feat: error code catalog`.

### Task 4: Стор и device-id

**Files:** Create: `src/core/store.ts`, `src/core/device.ts`, Test: `tests/unit/device.test.ts`

- [ ] **Step 1:** `store.ts` — типизированный pub/sub:
```ts
export class Store<T extends object> {
  private subs = new Set<(s: T)=>void>();
  constructor(private state: T){}
  get(){ return this.state; }
  set(patch: Partial<T>){ this.state = {...this.state, ...patch}; this.subs.forEach(f=>f(this.state)); }
  subscribe(f:(s:T)=>void){ this.subs.add(f); return ()=>this.subs.delete(f); }
}
```
- [ ] **Step 2 (test device):** генерится один раз и стабилен:
```ts
import { getDeviceId } from '../../src/core/device';
test('deviceId stable across calls', () => { expect(getDeviceId()).toBe(getDeviceId()); });
test('deviceId is uuid', () => { expect(getDeviceId()).toMatch(/^[0-9a-f-]{36}$/i); });
```
- [ ] **Step 3 (impl device):** `crypto.randomUUID()`, кэш в `localStorage['offline_kabinka.device_id']`.
- [ ] **Step 4:** Run tests → PASS. **Step 5:** Commit `feat: store + persistent device id`.

---

## Фаза 1 — Слой данных (чистая логика, TDD)

### Task 5: «Открыто сейчас» (Europe/Minsk)

**Files:** Create: `src/data/open-now.ts`, Test: `tests/unit/open-now.test.ts`

- [ ] **Step 0 (разведка формата):** `cd ../ && jq -c '.[0].working_hours' data/locations.json` и пара других — убедиться в реальных значениях (HH:MM, is_closed, есть ли круглосуточные). Зафиксировать в комментарии модуля.
- [ ] **Step 1 (test):** покрыть кейсы (передаём фиктивное «сейчас» как `{day,minutes}`):
```ts
import { isOpenNow, minskNow } from '../../src/data/open-now';
const wh = (o:string,c:string,extra={}) => [{day:1,open:o,close:c,...extra}];
test('inside hours → open', () => expect(isOpenNow(wh('10:00','22:00'), {day:1,minutes:12*60})).toBe(true));
test('before open → closed', () => expect(isOpenNow(wh('10:00','22:00'), {day:1,minutes:9*60})).toBe(false));
test('during break → closed', () => expect(isOpenNow(wh('10:00','22:00',{break_start:'13:30',break_end:'14:00'}), {day:1,minutes:13*60+45})).toBe(false));
test('overnight 22→06 at 02:00 → open', () => expect(isOpenNow([{day:7,open:'22:00',close:'06:00'}], {day:1,minutes:2*60})).toBe(true));
test('is_closed → closed', () => expect(isOpenNow([{day:1,open:null,close:null,is_closed:true}], {day:1,minutes:12*60})).toBe(false));
test('24h (00:00-00:00) → open', () => expect(isOpenNow(wh('00:00','00:00'), {day:1,minutes:3*60})).toBe(true));
test('minskNow returns plausible day/minutes', () => { const n=minskNow(new Date('2026-06-26T09:00:00Z')); expect(n.day).toBeGreaterThanOrEqual(1); expect(n.minutes).toBe(12*60); }); // 09:00Z = 12:00 Minsk
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3 (impl):**
```ts
import type { WorkingHour } from '../core/types';
export interface Now { day: number; minutes: number; }
const WD: Record<string,number> = {Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7};
export function minskNow(date = new Date()): Now {
  const p = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Minsk',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
  const g=(t:string)=>p.find(x=>x.type===t)!.value;
  return { day: WD[g('weekday')], minutes: (Number(g('hour'))%24)*60 + Number(g('minute')) };
}
const m=(t:string)=>{const[h,mm]=t.split(':').map(Number);return h*60+mm;};
function dayOpen(h:WorkingHour, mins:number): boolean {
  if (h.is_closed || !h.open || !h.close) return false;
  if (h.open === h.close) return true; // 24h
  const o=m(h.open), c=m(h.close);
  const inWin = c>o ? (mins>=o && mins<c) : (mins>=o || mins<c);
  if (!inWin) return false;
  if (h.break_start && h.break_end){ const bs=m(h.break_start), be=m(h.break_end); if (mins>=bs && mins<be) return false; }
  return true;
}
export function isOpenNow(hours: WorkingHour[], now: Now = minskNow()): boolean {
  const today = hours.find(h=>h.day===now.day);
  if (today && dayOpen(today, now.minutes)) return true;
  // overnight spillover from previous day
  const prevDay = now.day===1?7:now.day-1;
  const prev = hours.find(h=>h.day===prevDay);
  if (prev && prev.open && prev.close && m(prev.close)<m(prev.open)){
    // previous day's window crosses midnight into today's early hours
    if (now.minutes < m(prev.close)) return true;
  }
  return false;
}
```
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat: open-now in Europe/Minsk with breaks/overnight`.

### Task 6: Гео-утилиты (Haversine, bearing)

**Files:** Create: `src/core/geo.ts`, Test: `tests/unit/geo.test.ts`

- [ ] **Step 1 (test):**
```ts
import { haversine, bearing } from '../../src/core/geo';
test('haversine ~ known', () => { expect(haversine(53.9,27.56,53.9,27.56)).toBe(0); expect(haversine(53.9,27.56,53.91,27.56)).toBeGreaterThan(1000); });
test('bearing north ~0', () => { expect(Math.round(bearing(53.9,27.56,53.95,27.56))).toBe(0); });
```
- [ ] **Step 2:** FAIL. **Step 3 (impl):** стандартные формулы (R=6371000). **Step 4:** PASS. **Step 5:** Commit `feat: geo utils`.

### Task 7: Репозиторий данных (baseline + IndexedDB)

**Files:** Create: `src/data/idb.ts`, `src/data/repository.ts`, Test: `tests/unit/repository.test.ts`

- [ ] **Step 1:** Скопировать baseline в `public/data`: `mkdir -p public/data && cp ../data/locations.json public/data/locations.json`.
- [ ] **Step 2 (idb):** через `idb`: БД `offline_kabinka`, стор `kv` (ключи: `locations`, `locationsUpdatedAt`, `mapVersion`).
- [ ] **Step 3 (test repo):** если в IDB нет — берём baseline (мок fetch); если есть — IDB:
```ts
import { loadLocations, saveLocations } from '../../src/data/repository';
test('falls back to baseline when idb empty', async () => { /* mock fetch returns [{id:1,...}] */ const arr=await loadLocations(); expect(arr.length).toBeGreaterThan(0); });
```
- [ ] **Step 4 (impl):** `loadLocations()` — читает IDB.`locations`; если пусто — `fetch(import.meta.env.BASE_URL+'data/locations.json')`. `saveLocations(arr)` — пишет IDB + `locationsUpdatedAt`. Ошибки записи → `AppError('DATA-01')`.
- [ ] **Step 5:** Run → PASS. **Step 6:** Commit `feat: data repository with IndexedDB override`.

### Task 8: Фильтрация и поиск

**Files:** Create: `src/data/filter.ts`, Test: `tests/unit/filter.test.ts`

- [ ] **Step 1 (test):** покрыть openNow, layoutTypes, priceTypes, accessibleOnly, tagSlugs, minRating, query (по title/address, регистронезависимо), и комбинацию:
```ts
import { applyFilters, defaultFilter } from '../../src/data/filter';
const L = (o:any) => ({id:1,title:'БЦ Stella',address:'ул. Толстого',latitude:53.9,longitude:27.5,layout_type:'block',price_type:'free',is_accessible:true,tags:[{slug:'hand-dryer',name:'Сушилка',id:1}],working_hours:[],photos:[],comments:[],rating_overall:4.5,...o});
test('query matches title ci', () => expect(applyFilters([L({})], {...defaultFilter(), query:'stella'}).length).toBe(1));
test('priceType filters out', () => expect(applyFilters([L({price_type:'paid'})], {...defaultFilter(), priceTypes:new Set(['free'])}).length).toBe(0));
test('minRating', () => expect(applyFilters([L({rating_overall:3})], {...defaultFilter(), minRating:4}).length).toBe(0));
test('tag filter', () => expect(applyFilters([L({})], {...defaultFilter(), tagSlugs:new Set(['hand-dryer'])}).length).toBe(1));
```
- [ ] **Step 2:** FAIL. **Step 3 (impl):** `defaultFilter()` (пустые Set, minRating 0, openNow false), `applyFilters(list, f)` — последовательная фильтрация; openNow через `isOpenNow`. **Step 4:** PASS. **Step 5:** Commit `feat: client-side filtering and search`.

### Task 9: Diff обновления

**Files:** Create: `src/data/diff.ts`, Test: `tests/unit/diff.test.ts`

- [ ] **Step 1 (test):**
```ts
import { diffLocations } from '../../src/data/diff';
const L=(id:number,t='a')=>({id,title:t} as any);
test('added/removed/changed', () => {
  const d=diffLocations([L(1),L(2,'x')],[L(2,'y'),L(3)]);
  expect(d.added).toEqual([3]); expect(d.removed).toEqual([1]); expect(d.changed).toEqual([2]);
});
test('no changes', () => { const d=diffLocations([L(1)],[L(1)]); expect(d.added.length+d.removed.length+d.changed.length).toBe(0); });
```
- [ ] **Step 2:** FAIL. **Step 3 (impl):** Map по id; `changed` — сравнение стабильного `JSON.stringify` значимых полей (исключить волатильное `distance_meters`). **Step 4:** PASS. **Step 5:** Commit `feat: dataset diff`.

---

## Фаза 2 — Ядро карты (онлайн dev-тайлы пока нет своих)

### Task 10: Инициализация MapLibre + стиль RU

**Files:** Create: `src/map/style.ts`, `src/map/map.ts`

- [ ] **Step 1 (style.ts):** фабрика `buildStyle({lang:'ru'|'en', theme:'light'|'dark', pmtilesUrl})` → MapLibre style JSON со слоями OpenMapTiles (background, water, landuse, roads, buildings, place/road labels). `text-field: ['coalesce',['get',`name:${lang}`],['get','name']]`. Источник `{type:'vector', url:'pmtiles://'+pmtilesUrl}`. Тёмная тема — другой набор `paint`.
- [ ] **Step 2 (map.ts):** регистрация протокола pmtiles:
```ts
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);
export function createMap(container:HTMLElement, style:any){
  return new maplibregl.Map({ container, style, center:[27.5667,53.9023], zoom:12, maxBounds:[[27.30,53.78],[27.78,54.02]], maxZoom:16, attributionControl:true });
}
```
- [ ] **Step 3:** На этапе dev (своя карта ещё не собрана — Task 22) использовать MapLibre demo-стиль или собранный позже `public/map/minsk.pmtiles`. Временный экран показывает карту Минска.
- [ ] **Step 4:** Ручная проверка `npm run dev` — карта рендерится, подписи на русском (когда pmtiles готов). **Step 5:** Commit `feat: maplibre + pmtiles protocol + ru style`.

### Task 11: Маркеры и кластеризация

**Files:** Create: `src/map/markers.ts`

- [ ] **Step 1:** GeoJSON-источник из локаций (`cluster:true, clusterRadius:50, clusterMaxZoom:14`). Слой кластеров (круги + count). Слой точек — `symbol`/`circle` с цветом по `price_type` (free `#2e9e5b`, conditional `#2f6fd0`, paid `#7a3fb0`) и текстом `rating_overall`.
- [ ] **Step 2:** Клик по точке → `store.set({selectedId})`; клик по кластеру → зум. Курсор pointer.
- [ ] **Step 3:** Метод `updateMarkers(map, locations)` пересобирает данные источника (для фильтров).
- [ ] **Step 4:** Ручная проверка: точки видны, цвета верные, кластеры схлопываются. **Step 5:** Commit `feat: price-colored markers + clustering`.

### Task 12: Контролы — зум и геолокация

**Files:** Create: `src/map/controls.ts`

- [ ] **Step 1:** Кастомные кнопки зума `+/−` (видимы и на мобиле — улучшение); `map.zoomIn/zoomOut`.
- [ ] **Step 2:** Геолокация: `navigator.geolocation.getCurrentPosition` → маркер пользователя + круг точности, `flyTo`. Ошибка/отказ → тост `GEO-01`.
- [ ] **Step 3:** Ручная проверка на мобильном вьюпорте (DevTools). **Step 4:** Commit `feat: zoom + geolocation controls`.

---

## Фаза 3 — UI-оболочка (приложение становится «рабочим» онлайн)

### Task 13: Каркас и sheet/панель

**Files:** Create: `src/ui/shell.ts`, `src/ui/sheet.ts`, `src/main.ts` (обновить), CSS в `src/styles.css`

- [ ] **Step 1:** `shell.ts` монтирует карту на весь экран + контейнер панели. Мобайл (`<768px`): bottom-sheet 3 состояния (collapsed/middle/expanded), drag по ручке (pointer events), snap-точки, `env(safe-area-inset-bottom)`. Десктоп: левая панель 400px.
- [ ] **Step 2:** `main.ts` склейка: загрузка данных → создать карту/маркеры → подписка на стор (selectedId, filter).
- [ ] **Step 3:** Ручная проверка обоих вьюпортов. **Step 4:** Commit `feat: app shell + responsive sheet/panel`.

### Task 14: Список ближайших

**Files:** Create: `src/ui/list.ts`

- [ ] **Step 1:** Рендер отсортированного по расстоянию списка (если есть геопозиция) или по рейтингу. Каждая строка: миниатюра (первый thumb), название, адрес, бейдж «открыто/закрыто», расстояние, цена. Клик → `selectedId`.
- [ ] **Step 2:** Реакция на фильтр (перерисовка). **Step 3:** Ручная проверка. **Step 4:** Commit `feat: nearby list`.

### Task 15: Детальная карточка

**Files:** Create: `src/ui/card.ts`

- [ ] **Step 1:** По `selectedId` рендер: галерея (Task 16) → название + бейдж verified + адрес → блок рейтинга (общий + 3 оси: чистота/оснащённость/лояльность как шкалы) → чипы (♿ если accessible, кабины/писсуары/раковины) → теги (эмодзи+имя) → режим работы (таблица Пн–Вс, сегодня подсвечено, статус через `isOpenNow`) → цена (free/paid X BYN/условно + condition_text) → кнопка «Маршрут» (Task 21) → комментарии (чтение) → «Сообщить об ошибке» (внешняя ссылка) → кнопка «Поделиться» (Task 20).
- [ ] **Step 2:** Кнопка «назад» к списку. **Step 3:** Ручная проверка на нескольких id (с фото/без, платный, с перерывом). **Step 4:** Commit `feat: location detail card`.

### Task 16: Галерея и просмотрщик фото

**Files:** Create: `src/ui/gallery.ts`

- [ ] **Step 1:** Карусель thumbs (scroll-snap), точки-индикаторы. Источник thumb: пока (до Task 24) — `../thumbs` через dev или прямые url; после — object URL из `thumbs.ts`.
- [ ] **Step 2:** Тап → полноэкранный оверлей: грузим полноразмер `https://kabinka.by/storage/locations/{id}/photo_N.jpg` обычным `<img>` (без заголовков). Свайп между фото, пинч-зум (pointer events) с фолбэком double-tap. Ошибка `<img>` → плейсхолдер + код `IMG-01`.
- [ ] **Step 3:** Ручная проверка (онлайн открытие полноразмера, офлайн — только thumb + сообщение). **Step 4:** Commit `feat: photo gallery + fullscreen viewer`.

### Task 17: Модалка фильтров

**Files:** Create: `src/ui/filters.ts`

- [ ] **Step 1:** Модалка: открыто сейчас (toggle), пол (layout_type чекбоксы), оплата (3), доступность (toggle), удобства (11 тегов из данных), мин. рейтинг (1–5). Применение → `store.set({filter})` → список+маркеры обновляются. Кнопка «Сбросить».
- [ ] **Step 2:** Бейдж количества активных фильтров на кнопке «Фильтры». **Step 3:** Ручная проверка. **Step 4:** Commit `feat: client-side filters modal`.

### Task 18: Модалка настроек (каркас)

**Files:** Create: `src/ui/settings.ts`

- [ ] **Step 1:** Секции (часть кнопок пока заглушки, наполняются в Фазах 5–6): язык UI (RU/EN), язык карты (RU/EN), тёмная тема, радиус списка, навигатор по умолчанию, «Обновить данные», «Обновить карту», размер приложения, «Очистить кеш», подсказка установки, device-id, версия.
- [ ] **Step 2:** Тема и языки применяются сразу (тема — css-класс + перестроение стиля карты; язык карты — `map.setStyle(buildStyle(...))`; язык UI — перерисовка). **Step 3:** Ручная проверка переключений. **Step 4:** Commit `feat: settings modal skeleton + theme/lang switches`.

### Task 19: Поиск

**Files:** Create: `src/ui/search.ts`

- [ ] **Step 1:** Поле поиска (в шапке панели/sheet). Ввод → `store.set({filter:{...,query}})`. Результаты в списке; выбор центрирует карту на точке.
- [ ] **Step 2:** Ручная проверка (по названию и адресу). **Step 3:** Commit `feat: offline search`.

### Task 20: Шаринг-ссылка

**Files:** Create: `src/ui/share.ts`

- [ ] **Step 1:** Кнопка «Поделиться» в карточке → `navigator.share` (если есть) или копирование `location.origin+BASE_URL+'#id='+id`. При загрузке приложения читаем `#id=` → открыть карточку + центрировать.
- [ ] **Step 2:** Ручная проверка (открыть ссылку с `#id`). **Step 3:** Commit `feat: shareable deep links`.

### Task 21: Маршруты (гибрид)

**Files:** Create: `src/routing/index.ts`, Test: `tests/unit/routing.test.ts`

- [ ] **Step 1 (test):** deep-link билдеры и азимут:
```ts
import { yandexUrl, googleUrl, appleUrl } from '../../src/routing/index';
test('google url', () => expect(googleUrl(53.9,27.5)).toContain('destination=53.9,27.5'));
test('yandex url', () => expect(yandexUrl(53.9,27.5)).toContain('rtext=~53.9,27.5'));
```
- [ ] **Step 2:** FAIL. **Step 3 (impl):** `Router` интерфейс; `DeeplinkRouter` (билдеры url по навигатору из настроек); `LineRouter` — добавляет на карту слой-линию [user→point] + popup с расстоянием (`haversine`) + стрелка-компас по `bearing` и `deviceorientation` (фолбэк: без стрелки, только линия+расстояние). Кнопка «Маршрут» в карточке: онлайн → меню навигаторов; всегда → показать линию/компас.
- [ ] **Step 4:** PASS + ручная проверка. **Step 5:** Commit `feat: hybrid routing (line+compass / deeplinks)`.

### Task 22: i18n

**Files:** Create: `src/i18n/index.ts`, `src/i18n/ru.ts`, `src/i18n/en.ts`, Test: `tests/unit/i18n.test.ts`

- [ ] **Step 1 (test):** нет пропущенных ключей в `ru`; `en` имеет те же ключи (каркас, значения могут дублировать ru как fallback):
```ts
import { ru } from '../../src/i18n/ru'; import { en } from '../../src/i18n/en';
test('en has all ru keys', () => { for (const k of Object.keys(ru)) expect(en).toHaveProperty(k); });
```
- [ ] **Step 2:** FAIL. **Step 3 (impl):** `t(key)` по текущему UI-языку с fallback на ru; ключи для всех UI-строк (заменить хардкод в ui/*). `en` заполнить ключевыми строками, остальное = ru (каркас, дозаполнить позже). **Step 4:** PASS. **Step 5:** Commit `feat: i18n (ru full, en scaffold)`.

---

## Фаза 4 — Конвейер ассетов (собираем реальные офлайн-данные)

### Task 23: Скрипт обновления данных (build-data.mjs)

**Files:** Create: `scripts/build-data.mjs`

- [ ] **Step 1:** Node-скрипт: читает `X-Device-ID` (генерит и кэширует в `scripts/.device_id`), `GET /api/v1/locations?lat=53.9&lng=27.56&radius=50000&per_page=500` → по каждой `GET /locations/{id}` (детали) + `GET /locations/{id}/comments` (в try/catch, не фатально), проставляет `photos[].{remote,url,thumb}`, пишет `public/data/locations.json`. Вежливая задержка ~80мс. Лог «N/M».
- [ ] **Step 2:** Прогон `node scripts/build-data.mjs` → файл обновлён, валидный JSON, 263±. **Step 3:** Commit `feat: build-data script (unified API fetch)`.

### Task 24: Упаковка превью (pack-thumbs) + загрузчик

**Files:** Create: `scripts/pack-thumbs.mjs`, `src/offline/thumbs.ts`, Test: `tests/unit/thumbs.test.ts`

- [ ] **Step 1 (pack):** читает `../thumbs/*.jpg`, пишет `public/thumbs/thumbs.bin` (конкатенация) + `public/thumbs/thumbs-index.json` (`{ "11_photo_0.jpg":[offset,length], ... }`). Прогон `node scripts/pack-thumbs.mjs`.
- [ ] **Step 2 (test unpack):** по индексу и буферу отдаёт правильный срез:
```ts
import { sliceFromIndex } from '../../src/offline/thumbs';
test('slice by index', () => { const buf=new Uint8Array([0,1,2,3,4]).buffer; const b=sliceFromIndex(buf,{ "a":[1,3] },'a'); expect(b!.size).toBe(3); });
```
- [ ] **Step 3 (impl):** `sliceFromIndex(buffer,index,name)→Blob`; `getThumbUrl(name)` — из OPFS-буфера (Фаза 5) или dev-fallback на `/thumbs/`. Кэш object URL. **Step 4:** PASS. **Step 5:** Commit `feat: thumbs packing + unpack loader`.

### Task 25: Сборка карты Минска (build-map.sh)

**Files:** Create: `scripts/build-map.sh`

- [ ] **Step 1:** Проверить Java 21+ (`java -version`); если нет — `brew install openjdk@21` (или зафиксировать инструкцию). Скачать Planetiler jar (кэш в `.osm-cache/`).
- [ ] **Step 2:** Скачать экстракт Беларуси (Geofabrik `belarus-latest.osm.pbf`, кэш). Запустить Planetiler с bbox Минска (`--bounds=27.30,53.78,27.78,54.02`), `--maxzoom=16`, профиль OpenMapTiles → выход `../minsk_map/minsk.pmtiles`.
- [ ] **Step 3:** Сгенерировать `../minsk_map/map-version.json` (`{version: <дата/хэш>, bytes, sha256}`). Замерить итоговый размер, записать в комментарий/README.
- [ ] **Step 4:** Скопировать в `public/map/` для локального запуска: `mkdir -p public/map && cp ../minsk_map/minsk.pmtiles ../minsk_map/map-version.json public/map/`.
- [ ] **Step 5:** Прогон, проверка что MapLibre (Task 10) рендерит реальную карту Минска с русскими подписями. **Step 6:** Commit `feat: build-map pipeline (OSM→pmtiles)` (бинарь не коммитим — gitignore).

---

## Фаза 5 — Офлайн/PWA

### Task 26: Манифест, иконки, Service Worker (оболочка)

**Files:** Create: `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*`, `src/offline/sw-register.ts`

- [ ] **Step 1:** Манифест (name, short_name, start_url `./`, scope `./`, display `standalone`, иконки 192/512, theme/background). Иконки сгенерировать (можно из существующего ассета/простого SVG).
- [ ] **Step 2:** `sw.js`: precache оболочки (html/js/css/иконки/манифест) на `install`; `fetch` — cache-first для оболочки; runtime-cache (отдельный bucket `photos-cache`) для `kabinka.by/storage/...`.
- [ ] **Step 3:** Регистрация SW в `main.ts` (только prod). Ручная проверка: офлайн-перезагрузка отдаёт оболочку. **Step 4:** Commit `feat: PWA manifest + service worker (shell + photo cache)`.

### Task 27: OPFS + pmtiles из OPFS через worker

**Files:** Create: `src/offline/opfs.ts`, `src/offline/pmtiles-worker.ts`

- [ ] **Step 1 (opfs):** `writeFile(name, stream, onProgress)` и `readFileChunk(name, offset, length)`; запись через `createSyncAccessHandle()` **в Web Worker** (iOS не поддерживает createWritable). `exists(name)`, `size(name)`, `remove(name)`.
- [ ] **Step 2 (pmtiles-worker):** реализовать pmtiles `Source` поверх OPFS-чтения диапазонов (worker), чтобы MapLibre читал тайлы из локального файла офлайн. Зарегистрировать как источник вместо сетевого, если файл есть в OPFS.
- [ ] **Step 3:** Ручная проверка: после загрузки карты в OPFS — рендер офлайн (DevTools offline). **Step 4:** Commit `feat: OPFS storage + pmtiles OPFS source`.

### Task 28: Менеджер загрузки офлайн-пакета (прогресс/ошибки)

**Files:** Create: `src/offline/downloader.ts`, `src/ui/toast.ts`

- [ ] **Step 1:** `downloadAsset(url, name, onProgress)` — `fetch` + `ReadableStream` reader, считает прогресс по `content-length`, пишет в OPFS. Ошибки → `AppError('MAP-01'/'NET-01'/...)`.
- [ ] **Step 2:** `ensureOfflinePackage(onProgress)` — последовательно: карта (`map/minsk.pmtiles`), превью (`thumbs/thumbs.bin`+index), данные (если нужно). Пропускает уже скачанное (по `exists`+версии). Общий прогресс (взвешенный по размеру).
- [ ] **Step 3:** `toast.ts` — компонент прогресса (бар + проценты + текущий этап) и ошибок (текст+код+кнопка «повторить»). Первый запуск: предложить «Скачать офлайн-пакет (~N МБ)» с прогрессом.
- [ ] **Step 4:** Ручная проверка: чистый старт → прогресс → офлайн работает. Симуляция offline на середине → понятная ошибка с кодом + повтор. **Step 5:** Commit `feat: offline package downloader with progress + errors`.

### Task 29: Подсказка установки PWA

**Files:** Create: `src/ui/install-hint.ts`

- [ ] **Step 1:** Детект iOS Safari (не standalone) → закрываемая подсказка «Поделиться → На экран „Домой“» (флаг закрытия в localStorage). На Android/desktop — использовать `beforeinstallprompt`, если есть. Дублировать кнопку «Как установить» в настройках. Запросить `navigator.storage.persist()`.
- [ ] **Step 2:** Ручная проверка (iOS-вьюпорт + standalone-режим). **Step 3:** Commit `feat: install hint + persistent storage request`.

### Task 30: Размер приложения и очистка кеша

**Files:** Create: `src/offline/storage.ts`; Modify: `src/ui/settings.ts`

- [ ] **Step 1:** `estimateUsage()` — `navigator.storage.estimate()` + разбивка: карта (OPFS size), превью (OPFS), данные (IDB прибл.), оболочка+фото (Cache API: суммировать `caches`). Вернуть человекочитаемо.
- [ ] **Step 2:** `clearTransient()` — удалить `photos-cache` (Cache API) + temp апдейта; не трогать офлайн-пакет. `reinstallPackage()` — удалить пакет и заново `ensureOfflinePackage`.
- [ ] **Step 3:** В настройках: показать «Приложение занимает X МБ» (разбивка), кнопка «Очистить кеш (Y МБ)» (Y=transient), «Переустановить офлайн-пакет».
- [ ] **Step 4:** Ручная проверка цифр и очистки. **Step 5:** Commit `feat: storage usage readout + clear cache`.

---

## Фаза 6 — Обновления (данные и карта) в приложении

### Task 31: In-app обновление данных (прогресс/ошибки/diff)

**Files:** Create: `src/update/data-update.ts`; Modify: `src/ui/settings.ts`

- [ ] **Step 1:** `updateData(onProgress)` — портирует логику `build-data.mjs` в браузер: список (1 запрос) → детали+комментарии по точкам (прогресс «N/M», комментарии в try/catch). Использует `deviceId` в `X-Device-ID`. Ошибки сети/сервера → коды `NET-01`/`NET-02`/`API-01`/`API-02`.
- [ ] **Step 2:** По завершении: `diffLocations(old,new)` → `saveLocations(new)` → отчёт «Добавилось X, убралось Y (обновлено Z)» или «Новых данных нет». Прерывание сохраняет частичный прогресс.
- [ ] **Step 3:** Кнопка «Обновить данные» в настройках с прогрессом и итогом. **Step 4:** Ручная проверка (онлайн успех; offline → код; «нет изменений»). **Step 5:** Commit `feat: in-app data update with progress, errors, diff report`.

### Task 32: In-app обновление карты (версия/прогресс/ошибки)

**Files:** Create: `src/update/map-update.ts`; Modify: `src/ui/settings.ts`

- [ ] **Step 1:** `checkMapUpdate()` — `fetch BASE_URL+'map/map-version.json'`, сравнить с версией в IDB (`mapVersion`). Нет нового → вернуть `{updateAvailable:false}`.
- [ ] **Step 2:** `updateMap(onProgress)` — скачать новый `minsk.pmtiles` в OPFS (прогресс), при успехе заменить и обновить `mapVersion`, пересоздать источник карты. Ошибки → `MAP-01`/`MAP-02`/`NET-01`.
- [ ] **Step 3:** Кнопка «Обновить карту»: нет нового → сразу «Обновлять нечего»; есть → прогресс. **Step 4:** Ручная проверка (подменить map-version.json локально). **Step 5:** Commit `feat: in-app map update with version check`.

---

## Фаза 7 — Тесты, скилы, деплой, документация, оптимизация

### Task 33: Playwright e2e

**Files:** Create: `playwright.config.ts`, `tests/e2e/*.spec.ts`

- [ ] **Step 1:** Конфиг (baseURL dev-сервера, проект mobile Safari-вьюпорт + desktop). Мокать API/ассеты где нужно.
- [ ] **Step 2:** Сценарии: загрузка и показ карты+списка; клик по точке открывает карточку; фильтр уменьшает список; открытие настроек; переключение темы/языка UI; состояние прогресса обновления данных (мок); показ ошибки с кодом (мок offline/5xx); шаринг `#id` открывает карточку; поиск.
- [ ] **Step 3:** `npx playwright test` зелёный. **Step 4:** Commit `test: playwright e2e for key flows`.

### Task 34: Проектные скилы

**Files:** Create: `.claude/skills/{deploy,test,build-map,update-data,run,optimize-size}/SKILL.md`

- [ ] **Step 1:** Через навык **writing-skills** создать скилы с точными командами: `deploy` (deploy.sh + проверка gh), `test` (vitest+playwright), `build-map` (build-map.sh, требования Java), `update-data` (build-data.mjs), `run` (vite dev + офлайн-проверка), `optimize-size` (чек-лист Фазы Task 37).
- [ ] **Step 2:** Commit `chore: project skills for deploy/test/build/run`.

### Task 35: Деплой на Pages (deploy.sh)

**Files:** Create: `scripts/deploy.sh`

- [ ] **Step 1:** Проверить `gh auth status` и логин = `bonyadmitr`. Создать репозиторий `bonyadmitr/offline_kabinka` (`gh repo create --public` если нет), `git remote add origin`.
- [ ] **Step 2:** `deploy.sh`: `npm run build` → в `dist/` доложить `public/map/*` и `public/thumbs/*` (если vite их не положил) → опубликовать на Pages (предпочесть Pages-артефакт через минимальный workflow `.github/workflows/deploy.yml`, который собирает и деплоит; карта/превью кладутся в `public/` локально перед пушем кода, но т.к. они gitignore — workflow получает их из шага сборки: `build-map`/`pack-thumbs` запускаются в CI **или** ассеты грузятся как Release-asset и докачиваются). **Принять решение по факту:** если CI-сборка карты дорога — публиковать `dist/` напрямую с локали в ветку `gh-pages` (force, single-commit), исходный `main` без бинарей.
- [ ] **Step 3:** Включить Pages (`gh api` / настройки), дождаться `https://bonyadmitr.github.io/offline_kabinka`, проверить работу + установку на телефоне. **Step 4:** Commit `chore: deploy script + GitHub Pages`.

### Task 36: Документация

**Files:** Create: `README.md`, `docs/architecture.md`, `docs/offline-and-ios.md`, `docs/problems-and-solutions.md`

- [ ] **Step 1:** README: что это, как запускать (`run`), обновлять данные/карту, собирать, деплоить; требования (Node, Java). Архитектура (модули, потоки данных). Офлайн+iOS-нюансы. **Проблемы и решения** (вести по ходу реализации: CORS фото, OPFS-запись через worker, таймзона open-now, размер карты, и т.д.).
- [ ] **Step 2:** Commit `docs: full project documentation`.

### Task 37: Пост-оптимизация размера

**Files:** Modify: по результатам замеров

- [ ] **Step 1:** Замерить итог (`du -h` карты/превью, размер JS-бандла). Применить: урезать zoom/слои карты при избытке, агрессивнее превью при необходимости, code-splitting, дроп неиспользуемых зависимостей, brotli-precompress. Замерить до/после, записать в docs.
- [ ] **Step 2:** Финальный прогон тестов + ручная офлайн-проверка на iOS-вьюпорте. **Step 3:** Commit `perf: size optimization pass`.

---

## Самопроверка плана (выполнено)

- **Покрытие спеки:** карта§5→T10-12,22,25,32; данные§4→T5-9,23,31; офлайн§6→T24,26-30; UI§7→T13-21; маршруты§8→T21; ошибки§9→T3,28,31,32; фото§10→T16; i18n§11→T22; деплой§12→T35; тесты§14→T5-9,21,24,33; скилы§18→T34; докум.§16→T36; оптимизация§15→T37. Пробелов нет.
- **Плейсхолдеры:** код-шаги содержат реальный код/тесты; UI-шаги — конкретные контракты + ручная/Playwright-проверка. Вагового «add error handling» нет (ошибки кодифицированы в T3).
- **Согласованность типов:** `Location`/`FilterState` (T2) используются в T5-9,14-17; `AppError`/коды (T3) — в T28/31/32; `isOpenNow`/`minskNow` (T5) — в T8,15; `haversine`/`bearing` (T6) — в T14,21; `sliceFromIndex` (T24) — в T16; имена методов сверены.
