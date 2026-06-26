import { renderGallery } from '../../src/ui/gallery';
import type { Location, Photo } from '../../src/core/types';

const photo = (n: number): Photo =>
  ({ thumb: `thumbs/1/photo_${n}.jpg`, remote: `/storage/locations/1/photo_${n}.jpg` }) as Photo;

const L = (photos: Photo[]): Location =>
  ({
    id: 1,
    title: 'X',
    latitude: 53.9,
    longitude: 27.5,
    layout_type: 'block',
    price_type: 'free',
    is_accessible: false,
    is_verified: false,
    tags: [],
    photos,
    working_hours: [],
    comments: [],
  }) as Location;

test('carousel renders non-draggable images', () => {
  const el = document.createElement('div');
  renderGallery(el, L([photo(0), photo(1)]));
  const imgs = el.querySelectorAll<HTMLImageElement>('.gallery-slide img');
  expect(imgs.length).toBe(2);
  imgs.forEach((img) => expect(img.draggable).toBe(false));
});

test('multi-photo carousel shows prev/next arrows', () => {
  const el = document.createElement('div');
  renderGallery(el, L([photo(0), photo(1), photo(2)]));
  expect(el.querySelector('.gallery-arrow-prev')).not.toBeNull();
  expect(el.querySelector('.gallery-arrow-next')).not.toBeNull();
});

test('single photo: no arrows, no dots', () => {
  const el = document.createElement('div');
  renderGallery(el, L([photo(0)]));
  expect(el.querySelector('.gallery-arrow')).toBeNull();
  expect(el.querySelector('.gallery-dots')).toBeNull();
});

test('arrow click does not bubble to the slide (no viewer open)', () => {
  const el = document.createElement('div');
  renderGallery(el, L([photo(0), photo(1)]));
  const next = el.querySelector<HTMLButtonElement>('.gallery-arrow-next')!;
  // jsdom has no scrollBy; stub it so the handler runs without throwing.
  const track = el.querySelector<HTMLElement>('.gallery-track')!;
  (track as unknown as { scrollBy: () => void }).scrollBy = () => {};
  next.click();
  // The fullscreen viewer is appended to <body>; it must NOT have opened.
  expect(document.querySelector('.viewer')).toBeNull();
});
