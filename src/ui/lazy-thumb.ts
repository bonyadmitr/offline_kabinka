/**
 * Lazy thumbnail resolver using a shared IntersectionObserver.
 *
 * Marks images with `data-thumb` as pending and sets their `src` only when
 * they enter the viewport (plus a 200 px root margin so the image is already
 * loading before it fully appears). After setting `src` the element is
 * unobserved so the observer entry is cleaned up.
 *
 * `thumbUrl` already memoises name → object-URL, so repeated reveals of the
 * same thumb do not create extra object URLs.
 */

import { thumbUrl } from './thumb-url';

// Singleton observer shared across all list rows and gallery slides.
let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const img = entry.target as HTMLImageElement;
          const name = img.dataset['thumb'];
          if (name) {
            img.src = thumbUrl(name);
            // Remove the data attribute so a re-observe call (if any) is a no-op.
            delete img.dataset['thumb'];
          }
          observer!.unobserve(img);
        }
      },
      { rootMargin: '200px' },
    );
  }
  return observer;
}

/**
 * Enrol an image element for lazy loading.
 *
 * The image's `src` is left empty until the element enters the viewport.
 * Pass `thumbName` as the stored thumb path (e.g. "thumbs/38_photo_0.jpg")
 * — it will be forwarded to `thumbUrl` at reveal time.
 */
export function lazyThumb(img: HTMLImageElement, thumbName: string): void {
  img.dataset['thumb'] = thumbName;
  getObserver().observe(img);
}

/**
 * Reset the shared observer. Called in unit tests between cases so observer
 * state doesn't leak between tests.
 */
export function resetLazyObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}
