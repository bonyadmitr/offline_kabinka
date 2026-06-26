// install-hint.ts — encourage installing the PWA.
//
//  • iOS Safari, not yet installed → a dismissable banner with the
//    Share → "Add to Home Screen" instruction (dismissal persisted).
//  • Android / desktop → capture `beforeinstallprompt`, then surface an
//    "Install" button (in the banner and/or the settings modal) that calls
//    prompt().
//  • Requests persistent storage once (non-intrusive), so the offline data
//    is not evicted under storage pressure.

import { t } from '../i18n';
import { addBanner } from './banner-stack';

const DISMISS_KEY = 'offline_kabinka.installHintDismissed';

/** The platform-specific install affordance, resolved once at startup. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** True when running as an installed/standalone PWA. */
export function isStandalone(): boolean {
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayStandalone =
    typeof matchMedia === 'function' &&
    matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayStandalone;
}

/** Heuristic: iOS Safari (where there is no beforeinstallprompt). */
export function isIos(): boolean {
  const ua = navigator.userAgent || '';
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Mac but is touch-capable.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Whether a native install prompt is currently available (Android/desktop). */
export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

/** Trigger the captured native install prompt. Resolves to the user's choice. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const evt = deferredPrompt;
  deferredPrompt = null;
  try {
    await evt.prompt();
    const choice = await evt.userChoice;
    return choice.outcome === 'accepted';
  } catch {
    return false;
  }
}

/**
 * Initialise install hinting + request persistent storage. Idempotent: safe to
 * call once at startup. No-op when already installed.
 */
export function initInstallHint(): void {
  // Ask for persistence once; harmless if already granted/denied.
  requestPersistence();

  if (isStandalone()) return;

  // Capture the install prompt where supported (Android/desktop Chromium).
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    if (!isDismissed()) showBanner();
  });

  // iOS has no event — show the manual instruction banner.
  if (isIos() && !isDismissed()) showBanner();
}

function requestPersistence(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}

function showBanner(): void {
  if (document.querySelector('.install-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', t('settings.installTitle'));

  const text = document.createElement('span');
  text.className = 'install-text';

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'install-dismiss';
  dismiss.setAttribute('aria-label', t('install.dismiss'));
  dismiss.textContent = '✕';
  dismiss.addEventListener('click', () => {
    setDismissed();
    banner.remove();
  });

  if (canPromptInstall()) {
    // Android / desktop: descriptive text + a working Install button.
    text.textContent = t('install.bannerText');
    const installBtn = document.createElement('button');
    installBtn.type = 'button';
    installBtn.className = 'btn btn-primary install-action';
    installBtn.textContent = t('install.bannerBtn');
    installBtn.addEventListener('click', () => {
      void promptInstall().then((ok) => {
        if (ok) banner.remove();
      });
    });
    banner.append(text, installBtn, dismiss);
  } else {
    // iOS / no prompt: textual instruction only (no non-working button).
    text.textContent = t('install.bannerIos');
    banner.append(text, dismiss);
  }

  addBanner(banner);
  requestAnimationFrame(() => banner.classList.add('install-visible'));
}

/**
 * Render install help into a container (used by the settings modal). Shows the
 * iOS steps, or an Install button when a native prompt is available, or generic
 * guidance otherwise.
 */
export function renderInstallHelp(container: HTMLElement): void {
  container.replaceChildren();

  if (canPromptInstall()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = t('settings.installBtn');
    btn.addEventListener('click', () => void promptInstall());
    container.appendChild(btn);
    return;
  }

  const p = document.createElement('p');
  p.className = 'install-help-text';
  p.textContent = isIos()
    ? t('settings.installIosSteps')
    : t('settings.installUnavailable');
  container.appendChild(p);
}
