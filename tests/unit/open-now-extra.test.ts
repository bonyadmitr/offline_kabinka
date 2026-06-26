import { isOpenNow } from '../../src/data/open-now';
import type { WorkingHour } from '../../src/core/types';

// Overnight span via the PREVIOUS DAY's entry (the prevDay branch in isOpenNow).
//
// Scenario: Saturday (day 6) is open 22:00 → 03:00 (overnight, close < open).
// "Now" is Sunday (day 7) at 01:00 (60 minutes) — we're inside Saturday's
// overnight window and within the close time (03:00 = 180 min), so → open.
test('overnight window from previous day: still open past midnight', () => {
  const hours: WorkingHour[] = [
    { day: 6, open: '22:00', close: '03:00', is_closed: false },
  ];
  const now = { day: 7, minutes: 60 }; // Sunday 01:00
  expect(isOpenNow(hours, now)).toBe(true);
});

// Same setup but "now" is past the close time → closed.
test('overnight window from previous day: past close time → closed', () => {
  const hours: WorkingHour[] = [
    { day: 6, open: '22:00', close: '03:00', is_closed: false },
  ];
  const now = { day: 7, minutes: 200 }; // Sunday 03:20 — after 03:00
  expect(isOpenNow(hours, now)).toBe(false);
});

// Edge: prevDay wraps across the week boundary (Sunday→Monday: day 1 → prevDay 7).
test('prevDay wraps: day 1 (Monday) checks day 7 (Sunday) overnight', () => {
  const hours: WorkingHour[] = [
    { day: 7, open: '23:00', close: '02:00', is_closed: false },
  ];
  const now = { day: 1, minutes: 60 }; // Monday 01:00 is inside Sunday's overnight
  expect(isOpenNow(hours, now)).toBe(true);
});
