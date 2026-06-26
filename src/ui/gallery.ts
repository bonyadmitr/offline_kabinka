import type { Location, Photo } from '../core/types';
import { thumbUrl } from './thumb-url';

// Full-size originals live on the public API. We deliberately load them with a plain
// <img> (no headers) so the browser issues a simple GET with no CORS preflight.
const STORAGE_BASE = 'https://kabinka.by/storage/locations';

function photoIndex(photo: Photo): number {
  // remote: "/storage/locations/{id}/photo_{N}.jpg"
  const m = photo.remote.match(/photo_(\d+)\.jpg/i);
  return m ? Number(m[1]) : 0;
}

function fullUrl(locationId: number, photo: Photo): string {
  return `${STORAGE_BASE}/${locationId}/photo_${photoIndex(photo)}.jpg`;
}

/**
 * Render the in-card carousel of thumbnails. Tapping a thumb opens a fullscreen viewer.
 * No photos → a placeholder block.
 */
export function renderGallery(container: HTMLElement, location: Location): void {
  const photos = location.photos ?? [];
  container.replaceChildren();
  container.className = 'gallery';

  if (photos.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'gallery-empty';
    empty.innerHTML = `<span class="gallery-empty-icon">📷</span><span>Фотографии отсутствуют</span>`;
    container.appendChild(empty);
    return;
  }

  const track = document.createElement('div');
  track.className = 'gallery-track';

  const dots = document.createElement('div');
  dots.className = 'gallery-dots';

  photos.forEach((photo, i) => {
    const slide = document.createElement('button');
    slide.type = 'button';
    slide.className = 'gallery-slide';
    slide.setAttribute('aria-label', `Фото ${i + 1} из ${photos.length}`);

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    img.src = thumbUrl(photo.thumb);
    img.addEventListener('error', () => slide.classList.add('img-broken'));
    slide.appendChild(img);

    slide.addEventListener('click', () => openViewer(location, i));
    track.appendChild(slide);

    const dot = document.createElement('span');
    dot.className = 'gallery-dot' + (i === 0 ? ' active' : '');
    dots.appendChild(dot);
  });

  // Update active dot as the user scrolls the carousel.
  if (photos.length > 1) {
    track.addEventListener('scroll', () => {
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      const children = dots.children;
      for (let i = 0; i < children.length; i++) {
        children[i].classList.toggle('active', i === idx);
      }
    }, { passive: true });
  }

  container.appendChild(track);
  if (photos.length > 1) container.appendChild(dots);
}

// ─── Fullscreen viewer ─────────────────────────────────────────────────────────

interface ViewerState {
  index: number;
  scale: number;
  tx: number;
  ty: number;
}

/** Open a fullscreen overlay viewing the location's photos, starting at `start`. */
export function openViewer(location: Location, start: number): void {
  const photos = location.photos ?? [];
  if (photos.length === 0) return;

  const state: ViewerState = { index: start, scale: 1, tx: 0, ty: 0 };

  const overlay = document.createElement('div');
  overlay.className = 'viewer';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const stage = document.createElement('div');
  stage.className = 'viewer-stage';

  const img = document.createElement('img');
  img.className = 'viewer-img';
  img.alt = '';
  img.draggable = false;

  const fallback = document.createElement('div');
  fallback.className = 'viewer-fallback';
  fallback.innerHTML = `<span class="gallery-empty-icon">📷</span><span>Фото недоступно (IMG-01)</span>`;
  fallback.style.display = 'none';

  stage.appendChild(img);
  stage.appendChild(fallback);

  const counter = document.createElement('div');
  counter.className = 'viewer-counter';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'viewer-btn viewer-close';
  closeBtn.setAttribute('aria-label', 'Закрыть');
  closeBtn.textContent = '✕';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'viewer-btn viewer-prev';
  prevBtn.setAttribute('aria-label', 'Предыдущее фото');
  prevBtn.innerHTML = '‹';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'viewer-btn viewer-next';
  nextBtn.setAttribute('aria-label', 'Следующее фото');
  nextBtn.innerHTML = '›';

  overlay.append(stage, counter, closeBtn, prevBtn, nextBtn);
  document.body.appendChild(overlay);
  document.body.classList.add('viewer-open');

  function resetTransform(): void {
    state.scale = 1;
    state.tx = 0;
    state.ty = 0;
    applyTransform();
  }

  function applyTransform(): void {
    img.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
    img.classList.toggle('zoomed', state.scale > 1);
  }

  function show(i: number): void {
    state.index = (i + photos.length) % photos.length;
    resetTransform();
    fallback.style.display = 'none';
    img.style.display = '';
    img.src = fullUrl(location.id, photos[state.index]);
    counter.textContent = `${state.index + 1} / ${photos.length}`;
    const single = photos.length <= 1;
    prevBtn.style.display = single ? 'none' : '';
    nextBtn.style.display = single ? 'none' : '';
  }

  img.addEventListener('error', () => {
    img.style.display = 'none';
    fallback.style.display = '';
  });

  function close(): void {
    overlay.remove();
    document.body.classList.remove('viewer-open');
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(state.index - 1);
    else if (e.key === 'ArrowRight') show(state.index + 1);
  }

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => show(state.index - 1));
  nextBtn.addEventListener('click', () => show(state.index + 1));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === stage) close();
  });
  document.addEventListener('keydown', onKey);

  attachGestures(stage, img, state, applyTransform, resetTransform, {
    next: () => show(state.index + 1),
    prev: () => show(state.index - 1),
  });

  show(start);
}

// ─── Touch / pointer gestures: swipe, pinch-zoom, double-tap-zoom, pan ──────────

interface SwipeNav { next: () => void; prev: () => void; }

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function attachGestures(
  stage: HTMLElement,
  img: HTMLImageElement,
  state: ViewerState,
  apply: () => void,
  reset: () => void,
  nav: SwipeNav,
): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let startScale = 1;
  let startDist = 0;
  let startTx = 0;
  let startTy = 0;
  let panStart: { x: number; y: number } | null = null;
  let swipeStartX = 0;
  let lastTap = 0;

  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      startDist = dist(p1, p2);
      startScale = state.scale;
    } else if (pointers.size === 1) {
      swipeStartX = e.clientX;
      if (state.scale > 1) {
        panStart = { x: e.clientX - state.tx, y: e.clientY - state.ty };
      }
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2 && startDist > 0) {
      const [p1, p2] = [...pointers.values()];
      const ratio = dist(p1, p2) / startDist;
      state.scale = Math.min(4, Math.max(1, startScale * ratio));
      apply();
    } else if (pointers.size === 1 && state.scale > 1 && panStart) {
      state.tx = e.clientX - panStart.x;
      state.ty = e.clientY - panStart.y;
      apply();
    }
  });

  function endPointer(e: PointerEvent): void {
    pointers.delete(e.pointerId);

    if (pointers.size === 0) {
      // Swipe navigation only when not zoomed.
      if (state.scale <= 1.01) {
        const dx = e.clientX - swipeStartX;
        if (Math.abs(dx) > 60) {
          if (dx < 0) nav.next();
          else nav.prev();
          return;
        }
        // Double-tap to zoom toggle.
        const now = Date.now();
        if (now - lastTap < 300) {
          state.scale = 2;
          apply();
          lastTap = 0;
        } else {
          lastTap = now;
        }
      } else if (state.scale < 1.05) {
        reset();
      }
      panStart = null;
      startDist = 0;
    }
  }

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  // Desktop double-click zoom toggle.
  img.addEventListener('dblclick', () => {
    if (state.scale > 1) reset();
    else { state.scale = 2; apply(); }
  });
}
