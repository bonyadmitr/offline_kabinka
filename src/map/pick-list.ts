// Pure helper for the "several points share this spot" picker. Kept free of any
// MapLibre import so it can be unit-tested without loading the map engine.

import type { PriceType } from '../core/types';

/** One entry in the disambiguation picker. */
export interface PickItem {
  id: number;
  title: string;
  priceType: PriceType | string;
}

/**
 * Build the picker list from a set of MapLibre point features (cluster leaves or
 * overlapping unclustered features). Pure + side-effect-free. Drops features
 * without a finite numeric `id`, de-dupes by id (a feature may surface twice
 * across queries), and preserves input order.
 */
export function buildPickList(
  features: Array<{ properties?: Record<string, unknown> | null }>,
): PickItem[] {
  const seen = new Set<number>();
  const items: PickItem[] = [];
  for (const f of features) {
    const props = f.properties ?? {};
    const rawId = props.id;
    const id = typeof rawId === 'number' ? rawId : Number(rawId);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title: typeof props.title === 'string' ? props.title : '',
      priceType: (props.price_type as PriceType | undefined) ?? 'free',
    });
  }
  return items;
}
