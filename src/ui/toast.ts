// toast.ts — lightweight, dependency-free notifications + a progress overlay.
//
//  • toast(msg, opts)     → brief bottom toast; error variant carries the code.
//  • progressOverlay()    → a modal-ish overlay with a percentage bar, a stage
//                           label, and an error state with a "Retry" button.
//
// Both respect the iOS safe-area insets and are accessible (role/aria-live).
// Styling lives in styles.css under the "Toast" / "Progress overlay" sections.

import { toUserMessage } from '../core/errors';
import { t } from '../i18n';

export interface ToastOpts {
  type?: 'info' | 'error';
  /** When set, an error toast appends the code in parentheses. */
  code?: string;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Show a brief bottom toast. Errors get the `toast-error` style; if a `code` is
 * supplied (and not already present in the text) it is appended in parentheses.
 * Replaces any visible toast.
 */
export function toast(msg: string, opts: ToastOpts = {}): void {
  const { type = 'info', code } = opts;

  let el = document.querySelector<HTMLElement>('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }

  let text = msg;
  if (code && !text.includes(code)) text += ` (${code})`;
  el.textContent = text;
  el.classList.toggle('toast-error', type === 'error');

  // Restart the show animation.
  void el.offsetWidth;
  el.classList.add('toast-visible');

  if (toastTimer) clearTimeout(toastTimer);
  const node = el;
  // Errors linger a touch longer so the code is readable.
  toastTimer = setTimeout(
    () => {
      node.classList.remove('toast-visible');
      setTimeout(() => node.remove(), 250);
    },
    type === 'error' ? 4000 : 2000,
  );
}

export interface ProgressOverlay {
  /** Set progress 0..1 and the current stage label. */
  update(p: number, label: string): void;
  /** Switch to the error state with a message and a Retry button. */
  error(msg: string, opts?: { onRetry?: () => void }): void;
  /** Remove the overlay. */
  close(): void;
}

/**
 * Open a progress overlay with a determinate/indeterminate bar. Pass a fraction
 * < 0 to `update()` for an indeterminate (unknown-total) state.
 */
export function progressOverlay(title?: string): ProgressOverlay {
  const overlay = document.createElement('div');
  overlay.className = 'progress-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-live', 'polite');

  const card = document.createElement('div');
  card.className = 'progress-card';

  const titleEl = document.createElement('div');
  titleEl.className = 'progress-title';
  titleEl.textContent = title ?? t('offline.downloading');

  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');

  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  bar.appendChild(fill);

  const label = document.createElement('div');
  label.className = 'progress-label';

  card.append(titleEl, bar, label);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('progress-visible'));

  let closed = false;

  const update = (p: number, text: string): void => {
    if (closed) return;
    card.classList.remove('is-error');
    if (p < 0 || !Number.isFinite(p)) {
      // Indeterminate: let CSS animate a sliding sliver.
      bar.classList.add('is-indeterminate');
      bar.removeAttribute('aria-valuenow');
    } else {
      bar.classList.remove('is-indeterminate');
      const pct = Math.max(0, Math.min(1, p)) * 100;
      fill.style.width = `${pct}%`;
      bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    }
    label.textContent = text;
  };

  const error = (msg: string, o: { onRetry?: () => void } = {}): void => {
    if (closed) return;
    card.classList.add('is-error');
    bar.classList.remove('is-indeterminate');
    label.textContent = msg;
    // Replace any prior action row.
    card.querySelector('.progress-actions')?.remove();
    const actions = document.createElement('div');
    actions.className = 'progress-actions';

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn btn-primary';
    retryBtn.textContent = t('offline.retry');
    retryBtn.addEventListener('click', () => {
      actions.remove();
      update(-1, t('offline.downloading'));
      o.onRetry?.();
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-secondary';
    closeBtn.textContent = t('common.close');
    closeBtn.addEventListener('click', () => close());

    actions.append(retryBtn, closeBtn);
    card.appendChild(actions);
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    overlay.classList.remove('progress-visible');
    const remove = (): void => overlay.remove();
    overlay.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 250);
  };

  // Start indeterminate until the first real update arrives.
  update(-1, '');

  return { update, error, close };
}
