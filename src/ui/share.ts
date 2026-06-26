import type { Location } from '../core/types';
import { t } from '../i18n';

/** Build the deep-link URL for a location: <origin><base>#id=<id>. */
export function shareUrl(loc: Location): string {
  return `${location.origin}${import.meta.env.BASE_URL}#id=${loc.id}`;
}

/**
 * Share a location. Uses the Web Share API when available, otherwise copies the
 * deep link to the clipboard and shows a brief toast. Resolves once handled.
 */
export async function shareLocation(loc: Location): Promise<void> {
  const url = shareUrl(loc);
  const title = loc.title;

  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
  };

  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title, url });
      return;
    } catch (e) {
      // User dismissed the share sheet (AbortError) → do nothing.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // Otherwise fall through to clipboard.
    }
  }

  await copyToClipboard(url);
  showToast(t('share.copied'));
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* fall through to legacy path */
  }
  // Legacy fallback (older Safari / insecure contexts).
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    /* give up silently */
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Brief bottom toast. Replaces any visible toast. */
export function showToast(message: string): void {
  let toast = document.querySelector<HTMLElement>('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  // Restart the show animation.
  void toast.offsetWidth;
  toast.classList.add('toast-visible');

  if (toastTimer) clearTimeout(toastTimer);
  const node = toast;
  toastTimer = setTimeout(() => {
    node.classList.remove('toast-visible');
    setTimeout(() => node.remove(), 250);
  }, 2000);
}
