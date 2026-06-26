// Lightweight, dependency-free modal overlay.
//
//  • Mobile (<768px): slides up from the bottom (bottom-sheet style), respects
//    env(safe-area-inset-bottom).
//  • Desktop (≥768px): centered dialog.
//
// Closes on backdrop click, Esc, or the header close button. Accessible:
// role="dialog", aria-modal, labelled by the title, focus moved inside on open
// and restored on close, background scroll locked.

import { t } from '../i18n';

export interface Modal {
  /** The scrollable body element — render your content here. */
  body: HTMLElement;
  /** The footer element (sticky action bar). Empty by default. */
  footer: HTMLElement;
  /** Close + tear down the modal. */
  close(): void;
}

export interface ModalOpts {
  title: string;
  /** Called after the modal is removed from the DOM. */
  onClose?: () => void;
}

export function openModal(opts: ModalOpts): Modal {
  const prevActive = document.activeElement as HTMLElement | null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;
  dialog.setAttribute('aria-labelledby', titleId);

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'modal-header';

  const h = document.createElement('h2');
  h.className = 'modal-title';
  h.id = titleId;
  h.textContent = opts.title;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', t('common.close'));
  closeBtn.innerHTML = '<span aria-hidden="true">✕</span>';

  header.append(h, closeBtn);

  // ── Body + footer ──
  const body = document.createElement('div');
  body.className = 'modal-body';

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  dialog.append(header, body, footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  // Animate in on next frame so the transition runs.
  requestAnimationFrame(() => overlay.classList.add('modal-visible'));

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    overlay.classList.remove('modal-visible');
    // Remove after the transition; guard if reduced-motion makes it instant.
    const remove = (): void => {
      overlay.remove();
      if (!document.querySelector('.modal-overlay')) {
        document.body.classList.remove('modal-open');
      }
      prevActive?.focus?.();
      opts.onClose?.();
    };
    let removed = false;
    const once = (): void => {
      if (removed) return;
      removed = true;
      remove();
    };
    overlay.addEventListener('transitionend', once, { once: true });
    // Fallback in case transitionend never fires (e.g. jsdom, reduced motion).
    setTimeout(once, 250);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey, true);

  // Move focus into the dialog.
  closeBtn.focus();

  return { body, footer, close };
}
