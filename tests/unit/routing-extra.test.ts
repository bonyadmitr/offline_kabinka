import { navigatorUrl, googleUrl, yandexUrl, yandexNaviUrl, appleUrl } from '../../src/routing/index';
import type { LatLng } from '../../src/routing/index';

// navigatorUrl delegates to the right builder for each provider ID
test('navigatorUrl yandex_maps → yandexUrl output', () => {
  const direct = yandexUrl(53.9, 27.5);
  expect(navigatorUrl('yandex_maps', 53.9, 27.5)).toBe(direct);
});

test('navigatorUrl yandex_navi → yandexNaviUrl output', () => {
  const direct = yandexNaviUrl(53.9, 27.5);
  expect(navigatorUrl('yandex_navi', 53.9, 27.5)).toBe(direct);
});

test('navigatorUrl google → googleUrl output', () => {
  const direct = googleUrl(53.9, 27.5);
  expect(navigatorUrl('google', 53.9, 27.5)).toBe(direct);
});

test('navigatorUrl apple → appleUrl output', () => {
  const direct = appleUrl(53.9, 27.5);
  expect(navigatorUrl('apple', 53.9, 27.5)).toBe(direct);
});

// builders correctly embed the `from` origin when provided
const from: LatLng = { lat: 54.0, lng: 27.6 };

test('googleUrl with from includes origin coords', () => {
  const url = googleUrl(53.9, 27.5, from);
  expect(url).toContain('origin=54,27.6');
  expect(url).toContain('destination=53.9,27.5');
});

test('yandexUrl with from encodes both endpoints in rtext', () => {
  const url = yandexUrl(53.9, 27.5, from);
  // rtext=start~finish
  expect(url).toContain('rtext=54,27.6~53.9,27.5');
});

test('yandexNaviUrl with from includes lat_from/lon_from', () => {
  const url = yandexNaviUrl(53.9, 27.5, from);
  expect(url).toContain('lat_from=54');
  expect(url).toContain('lon_from=27.6');
  expect(url).toContain('lat_to=53.9');
  expect(url).toContain('lon_to=27.5');
});

test('appleUrl with from includes saddr', () => {
  const url = appleUrl(53.9, 27.5, from);
  expect(url).toContain('saddr=54,27.6');
  expect(url).toContain('daddr=53.9,27.5');
});

test('navigatorUrl passes from to the underlying builder', () => {
  // Spot-check one provider with from to make sure navigatorUrl threads it through.
  const direct = googleUrl(53.9, 27.5, from);
  expect(navigatorUrl('google', 53.9, 27.5, from)).toBe(direct);
});
