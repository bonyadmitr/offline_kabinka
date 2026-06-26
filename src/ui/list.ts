import type { Location } from '../core/types';
import { haversine } from '../core/geo';
import { isOpenNow } from '../data/open-now';
import { lazyThumb } from './lazy-thumb';
import { formatDistance, formatPrice, esc } from './format';
import { t } from '../i18n';

export interface UserPos {
  lat: number;
  lng: number;
}

export interface ListOpts {
  userPos: UserPos | null;
  onSelect: (id: number) => void;
}

/**
 * Memoised sort: re-sorting ~263 places is cheap, but drawList() also fires on
 * language switches and pack/data changes where neither the input array nor the
 * position moved. Cache the sorted order keyed by (source array identity, exact
 * position) so those redraws skip the sort entirely. A new `filtered` array
 * (filter/search/data change) or a fresh geolocation invalidates the cache.
 */
let sortCache: {
  src: Location[];
  lat: number | null;
  lng: number | null;
  sorted: Location[];
} | null = null;

function sortLocations(locations: Location[], userPos: UserPos | null): Location[] {
  const lat = userPos ? userPos.lat : null;
  const lng = userPos ? userPos.lng : null;
  if (sortCache && sortCache.src === locations && sortCache.lat === lat && sortCache.lng === lng) {
    return sortCache.sorted;
  }

  const sorted = [...locations];
  if (userPos) {
    sorted.sort(
      (a, b) =>
        haversine(userPos.lat, userPos.lng, a.latitude, a.longitude) -
        haversine(userPos.lat, userPos.lng, b.latitude, b.longitude),
    );
  } else {
    sorted.sort((a, b) => (b.rating_overall ?? 0) - (a.rating_overall ?? 0));
  }

  sortCache = { src: locations, lat, lng, sorted };
  return sorted;
}

/**
 * Render the nearby list. Sorted by distance when a user position is known,
 * otherwise by overall rating (desc). Re-render by calling again with new data.
 */
export function renderList(
  container: HTMLElement,
  locations: Location[],
  opts: ListOpts,
): void {
  const { userPos, onSelect } = opts;

  const sorted = sortLocations(locations, userPos);

  container.replaceChildren();
  container.className = 'list';

  const header = document.createElement('div');
  header.className = 'list-header';
  header.innerHTML = `<span class="list-count">${sorted.length}</span><span class="list-count-label">${t('list.placesWord', { n: sorted.length })}</span>`;
  container.appendChild(header);

  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = t('list.empty');
    container.appendChild(empty);
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'list-items';

  for (const loc of sorted) {
    ul.appendChild(renderRow(loc, userPos, onSelect));
  }

  container.appendChild(ul);
}

function renderRow(
  loc: Location,
  userPos: UserPos | null,
  onSelect: (id: number) => void,
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'list-row';
  li.tabIndex = 0;
  li.setAttribute('role', 'button');

  const open = isOpenNow(loc.working_hours);
  const distance = userPos
    ? formatDistance(haversine(userPos.lat, userPos.lng, loc.latitude, loc.longitude))
    : null;
  const thumb = loc.photos?.[0]?.thumb;
  const priceClass = `price-${loc.price_type}`;

  li.innerHTML = `
    <div class="row-thumb">${
      thumb
        ? `<img loading="lazy" decoding="async" alt="" onerror="this.parentElement.classList.add('img-broken')" />`
        : `<span class="row-thumb-ph">📷</span>`
    }</div>
    <div class="row-body">
      <div class="row-title">${esc(loc.title)}</div>
      ${loc.address ? `<div class="row-address">${esc(loc.address)}</div>` : ''}
      <div class="row-meta">
        <span class="badge ${open ? 'badge-open' : 'badge-closed'}">${open ? t('list.open') : t('list.closed')}</span>
        ${distance ? `<span class="row-dist">${esc(distance)}</span>` : ''}
        <span class="row-price ${priceClass}">${esc(formatPrice(loc))}</span>
      </div>
    </div>
    <div class="row-chevron">›</div>
  `;

  // Wire up lazy loading after the element is in the DOM tree so the
  // IntersectionObserver can measure its position correctly.
  if (thumb) {
    const img = li.querySelector<HTMLImageElement>('.row-thumb img');
    if (img) lazyThumb(img, thumb);
  }

  const fire = (): void => onSelect(loc.id);
  li.addEventListener('click', fire);
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fire();
    }
  });

  return li;
}
