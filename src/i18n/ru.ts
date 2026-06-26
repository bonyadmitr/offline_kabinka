// Russian dictionary — the source of truth for every user-facing UI string.
// Keys are flat dotted paths (e.g. 'card.route'); values are strings or, for
// pluralised/parameterised text, functions of the params. `en.ts` mirrors these
// keys exactly (enforced by tests/unit/i18n.test.ts).
//
// NB: data content from the API (titles, addresses, tag names, comment text) is
// never translated — only the app "chrome" lives here.

export type Dict = Record<string, string | ((p: Record<string, unknown>) => string)>;

export const ru = {
  // ── Common buttons / generic ──
  'common.apply': 'Применить',
  'common.reset': 'Сбросить',
  'common.back': 'Назад',
  'common.close': 'Закрыть',
  'common.cancel': 'Отмена',
  'common.soon': 'скоро',

  // ── Toolbar ──
  'toolbar.filters': 'Фильтры',
  'toolbar.settings': 'Настройки',

  // ── Map controls ──
  'map.zoomIn': 'Увеличить масштаб',
  'map.zoomOut': 'Уменьшить масштаб',
  'map.myLocation': 'Моё местоположение',

  // ── Search ──
  'search.placeholder': 'Поиск по названию или адресу',
  'search.label': 'Поиск',
  'search.clear': 'Очистить',

  // ── List ──
  'list.empty': 'Ничего не найдено',
  // n = number of places; returns the plural noun only ("место"/"места"/"мест").
  'list.placesWord': (p) => {
    const n = Number(p.n) || 0;
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'место';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'места';
    return 'мест';
  },
  'list.open': 'Открыто',
  'list.closed': 'Закрыто',

  // ── Card ──
  'card.verified': 'проверено',
  'card.noRatings': 'Пока нет оценок',
  'card.cleanliness': 'Чистота',
  'card.equipment': 'Оснащённость',
  'card.loyalty': 'Лояльность',
  // n = number of reviews; returns the plural noun ("оценка"/"оценки"/"оценок").
  'card.reviewsWord': (p) => {
    const n = Number(p.n) || 0;
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'оценка';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'оценки';
    return 'оценок';
  },
  'card.accessible': 'Доступно',
  'card.cabins': (p) => `Кабины: ${p.n}`,
  'card.urinals': (p) => `Писсуары: ${p.n}`,
  'card.sinks': (p) => `Раковины: ${p.n}`,
  'card.hours': 'Режим работы',
  'card.open': 'Открыто',
  'card.closed': 'Закрыто',
  'card.break': (p) => `(перерыв ${p.start}–${p.end})`,
  'card.priceFree': 'Бесплатно',
  'card.pricePaid': 'Платно',
  'card.pricePaidValue': (p) => `Платно — ${p.value} BYN`,
  'card.priceConditional': 'Условно-бесплатно',
  'card.howToFind': 'Как найти',
  'card.comments': 'Комментарии',
  'card.guest': 'Гость',
  'card.route': 'Маршрут',
  'card.share': 'Поделиться',

  // ── Day-of-week short names (index 1..7 = Mon..Sun) ──
  'day.mon': 'Пн',
  'day.tue': 'Вт',
  'day.wed': 'Ср',
  'day.thu': 'Чт',
  'day.fri': 'Пт',
  'day.sat': 'Сб',
  'day.sun': 'Вс',

  // ── Distance / price (list + card short forms) ──
  'unit.metres': (p) => `${p.v} м`,
  'unit.km': (p) => `${p.v} км`,
  'price.free': 'Бесплатно',
  'price.paid': (p) => `${p.value} BYN`,
  'price.paidShort': 'Платно',
  'price.conditionalShort': 'Условно',

  // ── Gallery / viewer ──
  'gallery.empty': 'Фотографии отсутствуют',
  'gallery.photoOf': (p) => `Фото ${p.i} из ${p.n}`,
  'viewer.unavailable': 'Фото недоступно (IMG-01)',
  'viewer.prev': 'Предыдущее фото',
  'viewer.next': 'Следующее фото',

  // ── Filters modal ──
  'filters.title': 'Фильтры',
  'filters.openNow': 'Открыто сейчас',
  'filters.byGender': 'Доступ по полу',
  'filters.layoutBlock': 'Общий блок',
  'filters.layoutMale': 'Мужской',
  'filters.layoutFemale': 'Женский',
  'filters.layoutUnisex': 'Совмещённый',
  'filters.priceType': 'Тип оплаты',
  'filters.priceFree': 'Бесплатно',
  'filters.priceConditional': 'Условно-бесплатно',
  'filters.pricePaid': 'Платно',
  'filters.accessibleOnly': 'Только доступные для инвалидов',
  'filters.amenities': 'Удобства',
  'filters.minRating': 'Рейтинг от',
  'filters.minRatingLabel': 'Минимальный рейтинг',
  'filters.ratingAny': 'Любой',
  'filters.ratingStars': (p) => `${p.r}★`,

  // ── Settings modal ──
  'settings.title': 'Настройки',
  'settings.uiLanguage': 'Язык интерфейса',
  'settings.mapLanguage': 'Язык карты',
  'settings.theme': 'Тема',
  'settings.themeSystem': 'Система',
  'settings.themeLight': 'Светлая',
  'settings.themeDark': 'Тёмная',
  'settings.listRadius': 'Радиус списка',
  'settings.radiusKm': (p) => `${p.km} км`,
  'settings.defaultNavigator': 'Навигатор по умолчанию',
  'settings.navYandexMaps': 'Яндекс Карты',
  'settings.navYandexNavi': 'Яндекс Навигатор',
  'settings.navGoogle': 'Google',
  'settings.navApple': 'Apple',
  'settings.soonGroup': 'Скоро',
  'settings.updatesGroup': 'Обновления',
  'settings.refreshData': 'Обновить данные',
  'settings.refreshMap': 'Обновить карту',
  'settings.appSize': 'Размер приложения',
  'settings.install': 'Как установить приложение',
  'settings.version': 'Версия',

  // ── Sheet ──
  'sheet.label': 'Список туалетов',
  'sheet.resize': 'Перетащите, чтобы изменить размер',

  // ── Desktop panel collapse ──
  'panel.collapse': 'Свернуть список',
  'panel.show': 'Список',

  // ── Share ──
  'share.copied': 'Ссылка скопирована',

  // ── Offline package / downloader ──
  'offline.downloading': 'Загрузка офлайн-пакета',
  'offline.retry': 'Повторить',
  'offline.stageMap': 'Скачивание карты…',
  'offline.stageThumbs': 'Скачивание фотографий…',
  'offline.stageFinalize': 'Подготовка…',
  'offline.done': 'Офлайн-пакет загружен',
  // n = megabytes.
  'offline.offer': (p) => `Скачать офлайн-пакет (${p.n} МБ)?`,
  'offline.offerDownload': 'Скачать',
  'offline.offerLater': 'Позже',

  // ── Settings: storage / install (WU7b) ──
  'settings.appSizeTitle': 'Размер приложения',
  'settings.appSizeTotal': 'Всего',
  'settings.appSizeMap': 'Карта',
  'settings.appSizeThumbs': 'Фотографии (офлайн)',
  'settings.appSizeData': 'Данные',
  'settings.appSizePhotos': 'Кеш фото (оценка)',
  'settings.appSizeShell': 'Оболочка',
  'settings.appSizeMeasuring': 'Подсчёт…',
  // x = human-readable size, e.g. "12 МБ".
  'settings.clearPhotos': 'Очистить кеш фото',
  'settings.clearPhotosBtn': (p) => `Очистить кеш фото (${p.x})`,
  'settings.clearPhotosEmpty': 'Кеш фото пуст',
  'settings.cleared': (p) => `Освобождено ${p.x}`,
  // ── Offline package management ──
  'settings.offlineTitle': 'Офлайн (карта и фото)',
  'settings.offlineStatus': 'Статус',
  // x = size in MB.
  'settings.offlineInstalled': (p) => `Скачан (${p.x} МБ)`,
  'settings.offlineNotInstalled': 'Не скачан',
  // n = size in MB.
  'settings.offlineDownload': (p) => `Скачать офлайн-пакет (${p.n} МБ)`,
  'settings.offlineDelete': (p) => `Удалить офлайн-пакет (${p.n} МБ)`,
  'settings.offlineDeleted': 'Офлайн-пакет удалён. Карта работает при интернете.',
  // ── Offline: two independent packages (map / photo thumbnails) ──
  'settings.offlineMapTitle': 'Карта (офлайн)',
  'settings.offlineThumbsTitle': 'Фото-превью (офлайн)',
  // x = size in MB.
  'settings.offlineMapInstalled': (p) => `Скачана (${p.x} МБ)`,
  'settings.offlineMapNotInstalled': 'Не скачана',
  'settings.offlineThumbsInstalled': (p) => `Скачаны (${p.x} МБ)`,
  'settings.offlineThumbsNotInstalled': 'Не скачаны',
  // n = size in MB.
  'settings.offlineMapDownload': (p) => `Скачать (${p.n} МБ)`,
  'settings.offlineMapDelete': (p) => `Удалить (${p.n} МБ)`,
  'settings.offlineThumbsDownload': (p) => `Скачать (${p.n} МБ)`,
  'settings.offlineThumbsDelete': (p) => `Удалить (${p.n} МБ)`,
  'settings.offlineThumbsHint': 'Без пакета превью грузятся из сети по мере показа.',
  'settings.offlineMapDeleted': 'Карта офлайн удалена. Карта работает при интернете.',
  'settings.offlineThumbsDeleted': 'Фото-превью офлайн удалены.',
  'settings.installTitle': 'Как установить приложение',
  'settings.installIosSteps': 'Нажмите «Поделиться», затем «На экран „Домой“».',
  'settings.installBtn': 'Установить',
  'settings.installUnavailable':
    'Откройте сайт в браузере и добавьте на главный экран через меню браузера.',

  // ── In-app updates (WU8) ──
  'update.dataTitle': 'Обновление данных',
  'update.mapTitle': 'Обновление карты',
  'update.phaseList': 'Получение списка…',
  // i = current index, m = total.
  'update.phaseDetails': (p) => `Детали ${p.i}/${p.m}`,
  'update.noChanges': 'Новых данных нет',
  // added/removed/changed counts.
  'update.summary': (p) => `Добавлено: ${p.added}, удалено: ${p.removed}, обновлено: ${p.changed}`,
  'update.mapNothing': 'Карта актуальна, обновлять нечего',
  'update.mapDone': 'Карта обновлена',

  // ── Install hint banner ──
  'install.bannerText': 'Установите приложение — карта и места будут работать офлайн',
  'install.bannerIos': 'Установите приложение: Поделиться → На экран „Домой“',
  'install.bannerBtn': 'Установить',
  'install.dismiss': 'Закрыть',

  // ── Units ──
  'unit.bytes': (p) => `${p.v} Б`,
  'unit.kb': (p) => `${p.v} КБ`,
  'unit.mb': (p) => `${p.v} МБ`,

  // ── Routing ──
  'route.title': 'Маршрут',
  'route.distance': 'Расстояние',
  'route.bearing': 'Азимут',
  'route.openInNavigator': 'Открыть в навигаторе',
  'route.hideRoute': 'Скрыть маршрут',
  'route.needGeo': 'Включите геолокацию, чтобы построить маршрут',
  'route.offlineNotice': 'Внешний навигатор требует интернета. Офлайн-линия уже построена.',
  'route.compassUnavailable': 'Компас недоступен',
} satisfies Dict;

export type RuKey = keyof typeof ru;
