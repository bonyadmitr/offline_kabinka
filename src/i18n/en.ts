// English dictionary. Mirrors every key in `ru.ts` (enforced by tests). The
// obvious "chrome" (buttons, titles, labels) is translated; anything left as a
// Russian string is intentional scaffold to be filled in later. Data content
// from the API is never translated here.

import type { Dict } from './ru';

export const en = {
  // ── Common buttons / generic ──
  'common.apply': 'Apply',
  'common.reset': 'Reset',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.soon': 'soon',

  // ── Toolbar ──
  'toolbar.filters': 'Filters',
  'toolbar.settings': 'Settings',

  // ── Map controls ──
  'map.zoomIn': 'Zoom in',
  'map.zoomOut': 'Zoom out',
  'map.myLocation': 'My location',

  // ── Cluster / overlapping-point picker ──
  'map.pickTitle': 'Several points here',
  'map.pickClose': 'Close list',

  // ── Search ──
  'search.placeholder': 'Search by name or address',
  'search.label': 'Search',
  'search.clear': 'Clear',

  // ── List ──
  'list.empty': 'Nothing found',
  // English has a single plural rule: 1 → "place", otherwise "places".
  'list.placesWord': (p) => ((Number(p.n) || 0) === 1 ? 'place' : 'places'),
  'list.open': 'Open',
  'list.closed': 'Closed',

  // ── Card ──
  'card.verified': 'verified',
  'card.noRatings': 'No ratings yet',
  'card.cleanliness': 'Cleanliness',
  'card.equipment': 'Equipment',
  'card.loyalty': 'Loyalty',
  'card.reviewsWord': (p) => ((Number(p.n) || 0) === 1 ? 'review' : 'reviews'),
  'card.accessible': 'Accessible',
  'card.cabins': (p) => `Cabins: ${p.n}`,
  'card.urinals': (p) => `Urinals: ${p.n}`,
  'card.sinks': (p) => `Sinks: ${p.n}`,
  'card.hours': 'Opening hours',
  'card.open': 'Open',
  'card.closed': 'Closed',
  'card.break': (p) => `(break ${p.start}–${p.end})`,
  'card.priceFree': 'Free',
  'card.pricePaid': 'Paid',
  'card.pricePaidValue': (p) => `Paid — ${p.value} BYN`,
  'card.priceConditional': 'Conditionally free',
  'card.howToFind': 'How to find',
  'card.comments': 'Comments',
  'card.guest': 'Guest',
  'card.route': 'Route',
  'card.share': 'Share',

  // ── Day-of-week short names ──
  'day.mon': 'Mon',
  'day.tue': 'Tue',
  'day.wed': 'Wed',
  'day.thu': 'Thu',
  'day.fri': 'Fri',
  'day.sat': 'Sat',
  'day.sun': 'Sun',

  // ── Distance / price ──
  'unit.metres': (p) => `${p.v} m`,
  'unit.km': (p) => `${p.v} km`,
  'price.free': 'Free',
  'price.paid': (p) => `${p.value} BYN`,
  'price.paidShort': 'Paid',
  'price.conditionalShort': 'Conditional',

  // ── Gallery / viewer ──
  'gallery.empty': 'No photos',
  'gallery.photoOf': (p) => `Photo ${p.i} of ${p.n}`,
  'viewer.unavailable': 'Photo unavailable (IMG-01)',
  'viewer.prev': 'Previous photo',
  'viewer.next': 'Next photo',

  // ── Filters modal ──
  'filters.title': 'Filters',
  'filters.openNow': 'Open now',
  'filters.byGender': 'Access by gender',
  'filters.layoutBlock': 'Shared block',
  'filters.layoutMale': 'Male',
  'filters.layoutFemale': 'Female',
  'filters.layoutUnisex': 'Unisex',
  'filters.priceType': 'Payment type',
  'filters.priceFree': 'Free',
  'filters.priceConditional': 'Conditionally free',
  'filters.pricePaid': 'Paid',
  'filters.accessibleOnly': 'Wheelchair accessible only',
  'filters.amenities': 'Amenities',
  'filters.minRating': 'Min rating',
  'filters.minRatingLabel': 'Minimum rating',
  'filters.ratingAny': 'Any',
  'filters.ratingStars': (p) => `${p.r}★`,

  // ── Settings modal ──
  'settings.title': 'Settings',
  'settings.uiLanguage': 'Interface language',
  'settings.mapLanguage': 'Map language',
  'settings.theme': 'Theme',
  'settings.themeSystem': 'System',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.defaultNavigator': 'Default navigator',
  'settings.navYandexMaps': 'Yandex Maps',
  'settings.navYandexNavi': 'Yandex Navigator',
  'settings.navGoogle': 'Google',
  'settings.navApple': 'Apple',
  'settings.soonGroup': 'Coming soon',
  'settings.updatesGroup': 'Updates',
  'settings.refreshData': 'Refresh data',
  'settings.refreshMap': 'Refresh map',
  'settings.appSize': 'App size',
  'settings.install': 'How to install the app',
  'settings.version': 'Version',

  // ── Sheet ──
  'sheet.label': 'List of toilets',
  'sheet.resize': 'Drag to resize',

  // ── Desktop panel collapse ──
  'panel.collapse': 'Collapse list',
  'panel.show': 'List',

  // ── Share ──
  'share.copied': 'Link copied',

  // ── Offline package / downloader ──
  'offline.downloading': 'Downloading offline package',
  'offline.retry': 'Retry',
  'offline.stageMap': 'Downloading map…',
  'offline.stageThumbs': 'Downloading photos…',
  'offline.stageFinalize': 'Finishing…',
  'offline.done': 'Offline package downloaded',
  'offline.offer': (p) => `Download offline package (${p.n} MB)?`,
  'offline.offerDownload': 'Download',
  'offline.offerLater': 'Later',

  // ── Settings: storage / install (WU7b) ──
  'settings.appSizeTitle': 'App size',
  'settings.appSizeTotal': 'Total',
  'settings.appSizeMap': 'Map',
  'settings.appSizeThumbs': 'Photos (offline)',
  'settings.appSizeData': 'Data',
  'settings.appSizePhotos': 'Photo cache (estimate)',
  'settings.appSizeShell': 'Shell',
  'settings.appSizeMeasuring': 'Measuring…',
  'settings.clearPhotos': 'Clear photo cache',
  'settings.clearPhotosBtn': (p) => `Clear photo cache (${p.x})`,
  'settings.clearPhotosEmpty': 'Photo cache is empty',
  'settings.cleared': (p) => `Freed ${p.x}`,
  // ── Offline package management ──
  'settings.offlineTitle': 'Offline (map & photos)',
  'settings.offlineStatus': 'Status',
  'settings.offlineInstalled': (p) => `Downloaded (${p.x} MB)`,
  'settings.offlineNotInstalled': 'Not downloaded',
  'settings.offlineDownload': (p) => `Download offline package (${p.n} MB)`,
  'settings.offlineDelete': (p) => `Delete offline package (${p.n} MB)`,
  'settings.offlineDeleted': 'Offline package deleted. The map needs the internet now.',
  // ── Offline: two independent packages (map / photo thumbnails) ──
  'settings.offlineMapTitle': 'Map (offline)',
  'settings.offlineThumbsTitle': 'Photo thumbnails (offline)',
  'settings.offlineMapInstalled': (p) => `Downloaded (${p.x} MB)`,
  'settings.offlineMapNotInstalled': 'Not downloaded',
  'settings.offlineThumbsInstalled': (p) => `Downloaded (${p.x} MB)`,
  'settings.offlineThumbsNotInstalled': 'Not downloaded',
  'settings.offlineMapDownload': (p) => `Download (${p.n} MB)`,
  'settings.offlineMapDelete': (p) => `Delete (${p.n} MB)`,
  'settings.offlineThumbsDownload': (p) => `Download (${p.n} MB)`,
  'settings.offlineThumbsDelete': (p) => `Delete (${p.n} MB)`,
  'settings.offlineThumbsHint': 'Without the pack, thumbnails load from the network as they appear.',
  'settings.offlineMapDeleted': 'Offline map deleted. The map needs the internet now.',
  'settings.offlineThumbsDeleted': 'Offline photo thumbnails deleted.',
  'settings.installTitle': 'How to install the app',
  'settings.installBtn': 'Install',
  // Platform-specific install steps (shared by the banner + the settings help).
  'install.stepsIos': 'Tap "Share" (square with an ↑ arrow) at the bottom → "Add to Home Screen".',
  'install.stepsAndroid': 'Menu "⋮" (top right) → "Install app".',
  'install.stepsDesktop':
    'Click the install icon "⊞" in the address bar, or Menu "⋮" → "Install…".',

  // ── In-app updates (WU8) ──
  'update.dataTitle': 'Updating data',
  'update.mapTitle': 'Updating map',
  'update.phaseList': 'Fetching list…',
  'update.phaseDetails': (p) => `Details ${p.i}/${p.m}`,
  'update.noChanges': 'No new data',
  'update.summary': (p) => `Added: ${p.added}, removed: ${p.removed}, updated: ${p.changed}`,
  'update.mapNothing': 'The map is up to date, nothing to update',
  'update.mapDone': 'Map updated',

  // ── Install hint banner ──
  'install.bannerText': 'Install the app — the map and places work offline',
  // Short lead-in shown before the platform-specific steps when there is no
  // native install prompt (iOS, and desktop/Android without beforeinstallprompt).
  'install.bannerManual': 'Install the app to use it offline:',
  'install.bannerBtn': 'Install',
  'install.dismiss': 'Dismiss',

  // ── Units ──
  'unit.bytes': (p) => `${p.v} B`,
  'unit.kb': (p) => `${p.v} KB`,
  'unit.mb': (p) => `${p.v} MB`,

  // ── Routing ──
  'route.title': 'Route',
  'route.distance': 'Distance',
  'route.bearing': 'Bearing',
  'route.openInNavigator': 'Open in navigator',
  'route.compass': 'Compass (offline)',
  'route.pickNavigator': 'Which navigator?',
  'route.changeNavigator': 'Change navigator',
  'route.hideRoute': 'Hide route',
  'route.needGeo': 'Enable location to show the compass',
  'route.navOfflineNotice': 'The navigator needs the internet or an installed app. The compass works offline.',
  'route.compassUnavailable': 'Compass unavailable',
} satisfies Dict;
