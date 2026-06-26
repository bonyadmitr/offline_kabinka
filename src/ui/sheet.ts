// Responsive container for the panel content.
//
//  • Mobile (<768px): a bottom-sheet with three snap states (collapsed / middle /
//    expanded), a drag handle, pointer-driven dragging with snapping, and a smooth
//    cubic-bezier transition. Respects env(safe-area-inset-bottom).
//  • Desktop (≥768px): a fixed frosted left panel that can be collapsed away (so the
//    map goes full-screen) and re-opened via a floating "Show list" button.
//
// The sheet owns two child views — `listView` and `cardView` — and toggles between
// them. Callers render into those elements and call showList()/showCard().

import { t } from '../i18n';

export type SheetState = 'collapsed' | 'middle' | 'expanded';

export interface Sheet {
  /** Where the nearby list is rendered. */
  listView: HTMLElement;
  /** Where the detail card is rendered. */
  cardView: HTMLElement;
  /** Show the list view (and, on mobile, snap to at least middle). */
  showList(): void;
  /** Show the card view (and, on mobile, expand). */
  showCard(): void;
  /** Programmatically move the mobile sheet to a snap state. */
  setState(s: SheetState): void;
}

// Marks the app root so CSS can hide the desktop panel and shift the top-left
// toolbar back to the screen edge while the panel is collapsed.
const COLLAPSED_ROOT_CLASS = 'panel-collapsed';

const MOBILE_MAX = 767; // px; ≥768 is desktop

// Snap heights as a fraction of viewport height (mobile only). Collapsed is a fixed
// pixel peek, the rest are vh fractions.
const COLLAPSED_PX = 88;
const MIDDLE_VH = 0.45;
const EXPANDED_VH = 0.92;

function isMobile(): boolean {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
  }
  return window.innerWidth <= MOBILE_MAX;
}

export function createSheet(parent: HTMLElement): Sheet {
  const root = document.createElement('section');
  root.className = 'sheet';
  root.setAttribute('aria-label', t('sheet.label'));

  const handle = document.createElement('div');
  handle.className = 'sheet-handle';
  handle.setAttribute('role', 'button');
  handle.setAttribute('aria-label', t('sheet.resize'));
  handle.tabIndex = 0;
  handle.innerHTML = `<span class="sheet-grabber"></span>`;

  // Desktop-only header bar with a collapse button. Hidden on mobile via CSS
  // (mobile uses the drag handle / 3-state sheet instead).
  const header = document.createElement('div');
  header.className = 'sheet-header';
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'sheet-collapse';
  collapseBtn.setAttribute('aria-label', t('panel.collapse'));
  collapseBtn.innerHTML = '<span aria-hidden="true">‹</span>';
  header.appendChild(collapseBtn);

  const scroll = document.createElement('div');
  scroll.className = 'sheet-scroll';

  const listView = document.createElement('div');
  listView.className = 'sheet-view sheet-view-list';

  const cardView = document.createElement('div');
  cardView.className = 'sheet-view sheet-view-card';
  cardView.hidden = true;

  scroll.append(listView, cardView);
  root.append(handle, header, scroll);
  parent.appendChild(root);

  // Floating "Show list" button shown only while the desktop panel is collapsed
  // (CSS gates visibility on .app-root.panel-collapsed). Lives next to the panel
  // so it survives panel re-renders.
  const reopenBtn = document.createElement('button');
  reopenBtn.type = 'button';
  reopenBtn.className = 'panel-reopen';
  reopenBtn.setAttribute('aria-label', t('panel.show'));
  reopenBtn.innerHTML = `<span aria-hidden="true">☰</span><span class="panel-reopen-label">${t('panel.show')}</span>`;
  parent.appendChild(reopenBtn);

  // The app root carries the .panel-collapsed flag (drives panel + toolbar + map).
  const appRoot = parent.closest<HTMLElement>('.app-root') ?? document.body;

  function setCollapsed(collapsed: boolean): void {
    appRoot.classList.toggle(COLLAPSED_ROOT_CLASS, collapsed);
    root.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
    // Move focus to the still-visible counterpart for keyboard users.
    if (collapsed) reopenBtn.focus();
    else collapseBtn.focus();
  }

  collapseBtn.addEventListener('click', () => setCollapsed(true));
  reopenBtn.addEventListener('click', () => setCollapsed(false));

  let state: SheetState = 'middle';

  function heightFor(s: SheetState): number {
    const vh = window.innerHeight;
    if (s === 'collapsed') return COLLAPSED_PX;
    if (s === 'middle') return Math.round(vh * MIDDLE_VH);
    return Math.round(vh * EXPANDED_VH);
  }

  function applyState(s: SheetState, animate = true): void {
    state = s;
    if (!isMobile()) {
      // Desktop: CSS controls sizing; clear inline height.
      root.style.height = '';
      root.style.transition = '';
      root.dataset.state = 'desktop';
      return;
    }
    root.dataset.state = s;
    root.style.transition = animate
      ? 'height 0.32s cubic-bezier(0.22, 1, 0.36, 1)'
      : 'none';
    root.style.height = `${heightFor(s)}px`;
    // collapsed → only the handle + first rows peek; lock inner scroll.
    scroll.style.overflowY = s === 'collapsed' ? 'hidden' : 'auto';
  }

  // ── Drag handling (pointer events) ──
  let dragging = false;
  let startY = 0;
  let startH = 0;
  let pointerId = -1;

  function onDown(e: PointerEvent): void {
    if (!isMobile()) return;
    dragging = true;
    pointerId = e.pointerId;
    startY = e.clientY;
    startH = root.getBoundingClientRect().height;
    root.style.transition = 'none';
    handle.setPointerCapture(pointerId);
  }

  function onMove(e: PointerEvent): void {
    if (!dragging) return;
    const dy = startY - e.clientY; // up = positive = taller
    const vh = window.innerHeight;
    const next = Math.max(COLLAPSED_PX, Math.min(vh * EXPANDED_VH, startH + dy));
    root.style.height = `${next}px`;
  }

  function onUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    try { handle.releasePointerCapture(pointerId); } catch { /* noop */ }
    // Snap to nearest state by current height.
    const h = root.getBoundingClientRect().height;
    const candidates: SheetState[] = ['collapsed', 'middle', 'expanded'];
    let best: SheetState = 'middle';
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = Math.abs(heightFor(c) - h);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    applyState(best);
  }

  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);

  // Tap the handle (no drag) cycles collapsed → middle → expanded.
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const order: SheetState[] = ['collapsed', 'middle', 'expanded'];
    const idx = order.indexOf(state);
    applyState(order[Math.min(order.length - 1, idx + 1)]);
  });

  // Re-apply sizing across the mobile/desktop boundary on resize. Collapse is a
  // desktop-only affordance, so clear it on mobile (the bottom sheet must never be
  // stuck hidden).
  window.addEventListener('resize', () => {
    if (isMobile() && appRoot.classList.contains(COLLAPSED_ROOT_CLASS)) {
      appRoot.classList.remove(COLLAPSED_ROOT_CLASS);
      root.setAttribute('aria-hidden', 'false');
    }
    applyState(state, false);
  });

  // Initial layout.
  applyState(isMobile() ? 'middle' : 'desktop' as SheetState, false);

  return {
    listView,
    cardView,
    showList(): void {
      cardView.hidden = true;
      listView.hidden = false;
      scroll.scrollTop = 0;
      if (isMobile() && state === 'collapsed') applyState('middle');
    },
    showCard(): void {
      listView.hidden = true;
      cardView.hidden = false;
      scroll.scrollTop = 0;
      if (isMobile()) applyState('expanded');
    },
    setState(s: SheetState): void {
      applyState(s);
    },
  };
}
