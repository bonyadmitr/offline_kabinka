import { isOpenNow, minskNow } from '../../src/data/open-now';

const wh = (o: string, c: string, extra = {}) => [{ day: 1, open: o, close: c, ...extra }];

test('inside hours → open', () => expect(isOpenNow(wh('10:00', '22:00'), { day: 1, minutes: 12 * 60 })).toBe(true));
test('before open → closed', () => expect(isOpenNow(wh('10:00', '22:00'), { day: 1, minutes: 9 * 60 })).toBe(false));
test('during break → closed', () => expect(isOpenNow(wh('10:00', '22:00', { break_start: '13:30', break_end: '14:00' }), { day: 1, minutes: 13 * 60 + 45 })).toBe(false));
test('overnight 22→06 at 02:00 → open', () => expect(isOpenNow([{ day: 7, open: '22:00', close: '06:00' }], { day: 1, minutes: 2 * 60 })).toBe(true));
test('is_closed → closed', () => expect(isOpenNow([{ day: 1, open: null, close: null, is_closed: true }], { day: 1, minutes: 12 * 60 })).toBe(false));
test('24h (00:00-00:00) → open', () => expect(isOpenNow(wh('00:00', '00:00'), { day: 1, minutes: 3 * 60 })).toBe(true));
test('minskNow returns plausible day/minutes', () => {
  const n = minskNow(new Date('2026-06-26T09:00:00Z'));
  expect(n.day).toBeGreaterThanOrEqual(1);
  expect(n.minutes).toBe(12 * 60);
});
