import { addBanner, getBannerStack } from '../../src/ui/banner-stack';

afterEach(() => {
  document.querySelectorAll('.banner-stack').forEach((n) => n.remove());
});

const banner = (cls: string): HTMLElement => {
  const el = document.createElement('div');
  el.className = cls;
  return el;
};

test('both banners live in a single stack container (no overlap)', () => {
  addBanner(banner('install-banner'));
  addBanner(banner('offer-banner'));

  const stacks = document.querySelectorAll('.banner-stack');
  expect(stacks).toHaveLength(1);
  expect(stacks[0].childElementCount).toBe(2);
  // Both real banners are present.
  expect(stacks[0].querySelector('.install-banner')).not.toBeNull();
  expect(stacks[0].querySelector('.offer-banner')).not.toBeNull();
});

test('newest banner is prepended (sits nearest the bottom edge)', () => {
  addBanner(banner('install-banner'));
  addBanner(banner('offer-banner'));
  const stack = getBannerStack();
  // column-reverse in CSS renders the first child lowest; we prepend newest.
  expect(stack.firstElementChild?.classList.contains('offer-banner')).toBe(true);
});

test('the stack auto-removes once the last banner is gone', async () => {
  const b = banner('offer-banner');
  addBanner(b);
  expect(document.querySelector('.banner-stack')).not.toBeNull();

  b.remove();
  // MutationObserver fires on the next microtask/tick.
  await new Promise((r) => setTimeout(r, 0));
  expect(document.querySelector('.banner-stack')).toBeNull();
});
