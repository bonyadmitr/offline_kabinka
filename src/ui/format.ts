import type { Location } from '../core/types';

/** Human-readable distance: metres under 1 km, otherwise km with one decimal. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} м`;
  const km = metres / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} км`;
}

/** Price label for a location: "Бесплатно" / "1.00 BYN" / "Условно". */
export function formatPrice(loc: Location): string {
  switch (loc.price_type) {
    case 'free':
      return 'Бесплатно';
    case 'paid':
      return loc.price_value != null ? `${loc.price_value.toFixed(2)} BYN` : 'Платно';
    case 'conditional_free':
      return 'Условно';
    default:
      return '';
  }
}

/** Escape text for safe interpolation into innerHTML template strings. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
