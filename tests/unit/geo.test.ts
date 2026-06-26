import { haversine, bearing } from '../../src/core/geo';

test('haversine ~ known', () => {
  expect(haversine(53.9, 27.56, 53.9, 27.56)).toBe(0);
  expect(haversine(53.9, 27.56, 53.91, 27.56)).toBeGreaterThan(1000);
});

test('bearing north ~0', () => {
  expect(Math.round(bearing(53.9, 27.56, 53.95, 27.56))).toBe(0);
});
