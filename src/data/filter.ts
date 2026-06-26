import type { Location, FilterState, LayoutType, PriceType } from '../core/types';
import { isOpenNow } from './open-now';

export function defaultFilter(): FilterState {
  return {
    openNow: false,
    layoutTypes: new Set<LayoutType>(),
    priceTypes: new Set<PriceType>(),
    accessibleOnly: false,
    tagSlugs: new Set<string>(),
    minRating: 0,
    query: '',
  };
}

export function applyFilters(list: Location[], f: FilterState): Location[] {
  const q = f.query.trim().toLowerCase();

  return list.filter(loc => {
    // query: case-insensitive match on title or address
    if (q) {
      const haystack = `${loc.title} ${loc.address ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // layoutTypes: if set non-empty, keep only matching
    if (f.layoutTypes.size > 0 && !f.layoutTypes.has(loc.layout_type)) return false;

    // priceTypes: if set non-empty, keep only matching
    if (f.priceTypes.size > 0 && !f.priceTypes.has(loc.price_type)) return false;

    // accessibleOnly
    if (f.accessibleOnly && !loc.is_accessible) return false;

    // tagSlugs: like Kabinka — location passes if it has ANY of the selected slugs
    if (f.tagSlugs.size > 0) {
      const locSlugs = new Set(loc.tags.map(t => t.slug));
      const hasAny = [...f.tagSlugs].some(slug => locSlugs.has(slug));
      if (!hasAny) return false;
    }

    // minRating
    if (f.minRating > 0 && (loc.rating_overall ?? 0) < f.minRating) return false;

    // openNow
    if (f.openNow && !isOpenNow(loc.working_hours)) return false;

    return true;
  });
}
