// @vitest-environment jsdom
import { getDeviceId } from '../../src/core/device';

test('deviceId stable across calls', () => {
  expect(getDeviceId()).toBe(getDeviceId());
});

test('deviceId is uuid', () => {
  expect(getDeviceId()).toMatch(/^[0-9a-f-]{36}$/i);
});
