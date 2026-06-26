import { shareUrl, shareLocation, showToast } from '../../src/ui/share';
import type { Location } from '../../src/core/types';

const L = (o: Partial<Location> = {}): Location =>
  ({
    id: 42,
    title: 'БЦ Stella',
    latitude: 53.9,
    longitude: 27.5,
    layout_type: 'block',
    price_type: 'free',
    is_accessible: false,
    is_verified: false,
    tags: [],
    photos: [],
    working_hours: [],
    comments: [],
    ...o,
  }) as Location;

afterEach(() => {
  document.querySelectorAll('.toast').forEach((n) => n.remove());
  // Reset any spies on navigator.
  delete (navigator as { share?: unknown }).share;
});

test('shareUrl builds origin + base + #id=', () => {
  // jsdom origin is http://localhost, BASE_URL defaults to '/'.
  expect(shareUrl(L({ id: 7 }))).toBe('http://localhost/#id=7');
});

test('uses navigator.share when available', async () => {
  const calls: ShareData[] = [];
  (navigator as { share?: (d: ShareData) => Promise<void> }).share = (d) => {
    calls.push(d);
    return Promise.resolve();
  };
  await shareLocation(L({ id: 5, title: 'X' }));
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({ title: 'X', url: 'http://localhost/#id=5' });
  // No toast on native share success.
  expect(document.querySelector('.toast')).toBeNull();
});

test('falls back to clipboard + toast when share is absent', async () => {
  const written: string[] = [];
  // jsdom may not implement clipboard.writeText; define it.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (t: string) => (written.push(t), Promise.resolve()) },
  });

  await shareLocation(L({ id: 9 }));
  expect(written).toEqual(['http://localhost/#id=9']);
  const toast = document.querySelector('.toast');
  expect(toast?.textContent).toBe('Ссылка скопирована');
});

test('showToast is replaceable and accessible', () => {
  showToast('one');
  showToast('two');
  const toasts = document.querySelectorAll('.toast');
  expect(toasts).toHaveLength(1); // reuses the same node
  expect(toasts[0].textContent).toBe('two');
  expect(toasts[0].getAttribute('role')).toBe('status');
});
