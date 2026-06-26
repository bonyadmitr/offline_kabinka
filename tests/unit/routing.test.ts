import { googleUrl, yandexUrl, yandexNaviUrl, appleUrl } from '../../src/routing/index';

test('google url', () => expect(googleUrl(53.9, 27.5)).toContain('destination=53.9,27.5'));
test('google url is walking', () => expect(googleUrl(53.9, 27.5)).toContain('travelmode=walking'));
test('yandex url', () => expect(yandexUrl(53.9, 27.5)).toContain('rtext=~53.9,27.5'));
test('yandex navi deep link', () =>
  expect(yandexNaviUrl(53.9, 27.5)).toBe(
    'yandexnavi://build_route_on_map?lat_to=53.9&lon_to=27.5',
  ));
test('apple url', () => expect(appleUrl(53.9, 27.5)).toContain('daddr=53.9,27.5'));
