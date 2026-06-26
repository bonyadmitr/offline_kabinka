/**
 * sw-register.ts — service worker registration hook.
 *
 * vite-plugin-pwa is configured with injectRegister: 'auto'. Because this module
 * imports the `virtual:pwa-register` helper, the plugin detects an explicit
 * import-based registration and does NOT inject its own auto-registration script
 * (so the SW is registered exactly once, here). registerType: 'autoUpdate' means
 * a new SW activates and reloads on its own; we keep this hook thin.
 *
 * Imported from main.ts only under import.meta.env.PROD — in dev there is no SW
 * (devOptions.enabled: false), and the virtual module would resolve to a no-op.
 */

import { registerSW } from 'virtual:pwa-register';

/** Register the service worker. Safe no-op when SW is unsupported. */
export function registerServiceWorker(): void {
  // immediate: register on first load without waiting for the window 'load' event.
  registerSW({ immediate: true });
}
