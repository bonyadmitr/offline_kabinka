// banner-stack.ts — a single bottom-anchored column that hosts the app's
// dismissable banners (install hint, offline-package offer). Routing every
// banner through one flex container means they stack with a gap and never
// overlap, regardless of which one appears first (the install prompt can arrive
// asynchronously, after the offline offer is already shown).

let stack: HTMLElement | null = null;

/** Get (creating once) the shared banner stack, appended to <body>. */
export function getBannerStack(): HTMLElement {
  if (stack && stack.isConnected) return stack;
  stack = document.createElement('div');
  stack.className = 'banner-stack';
  document.body.appendChild(stack);
  return stack;
}

/**
 * Mount a banner into the stack (newest on top, nearest the bottom edge). The
 * banner is responsible for removing itself; the stack auto-removes when empty.
 */
export function addBanner(banner: HTMLElement): void {
  const host = getBannerStack();
  host.prepend(banner);
  // When a banner removes itself, drop the empty container too.
  const observer = new MutationObserver(() => {
    if (host.childElementCount === 0) {
      host.remove();
      stack = null;
      observer.disconnect();
    } else if (!banner.isConnected) {
      observer.disconnect();
    }
  });
  observer.observe(host, { childList: true });
}
