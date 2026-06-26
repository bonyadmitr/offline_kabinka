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

    // tagSlugs: like Kabinka — location passes if it has ANY of the selected slugs.
    // Probe the (small) selected-slug Set per tag instead of building a fresh Set
    // from loc.tags for every location on every filter pass.
    if (f.tagSlugs.size > 0 && !loc.tags.some(tg => f.tagSlugs.has(tg.slug))) {
      return false;
    }

    // minRating
    if (f.minRating > 0 && (loc.rating_overall ?? 0) < f.minRating) return false;

    // openNow
    if (f.openNow && !isOpenNow(loc.working_hours)) return false;

    return true;
  });
}
