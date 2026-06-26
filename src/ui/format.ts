import type { Location } from '../core/types';
import { t } from '../i18n';

/** Human-readable distance: metres under 1 km, otherwise km with one decimal. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return t('unit.metres', { v: Math.round(metres) });
  const km = metres / 1000;
  return t('unit.km', { v: km < 10 ? km.toFixed(1) : Math.round(km) });
}

/** Price label for a location: "Бесплатно" / "1.00 BYN" / "Условно". */
export function formatPrice(loc: Location): string {
  switch (loc.price_type) {
    case 'free':
      return t('price.free');
    case 'paid':
      return loc.price_value != null
        ? t('price.paid', { value: loc.price_value.toFixed(2) })
        : t('price.paidShort');
    case 'conditional_free':
      return t('price.conditionalShort');
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
