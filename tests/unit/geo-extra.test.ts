import { haversine, bearing } from '../../src/core/geo';

// Minsk ↔ Vilnius: known approximate great-circle distance ~168 km.
// WGS84 coords: Minsk 53.9024,27.5618 — Vilnius 54.6872,25.2797.
test('haversine Minsk↔Vilnius ≈ 168 km ±5 km', () => {
  const dist = haversine(53.9024, 27.5618, 54.6872, 25.2797);
  // Accept 163_000..173_000 m to allow for slight formula differences.
  expect(dist).toBeGreaterThan(163_000);
  expect(dist).toBeLessThan(173_000);
});

// Bearing south: point directly south → ~180°.
test('bearing south ≈ 180°', () => {
  const b = bearing(53.9, 27.5, 53.5, 27.5);
  expect(b).toBeGreaterThan(179);
  expect(b).toBeLessThan(181);
});

// Bearing east: point directly east → ~90°.
test('bearing east ≈ 90°', () => {
  const b = bearing(53.9, 27.5, 53.9, 28.5);
  expect(b).toBeGreaterThan(89);
  expect(b).toBeLessThan(91);
});

// Bearing west: point directly west → ~270°.
test('bearing west ≈ 270°', () => {
  const b = bearing(53.9, 27.5, 53.9, 26.5);
  expect(b).toBeGreaterThan(269);
  expect(b).toBeLessThan(271);
});
