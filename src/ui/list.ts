import type { Location } from '../core/types';
import { haversine } from '../core/geo';
import { isOpenNow } from '../data/open-now';
import { thumbUrl } from './thumb-url';
import { formatDistance, formatPrice, esc } from './format';

export interface UserPos {
  lat: number;
  lng: number;
}

export interface ListOpts {
  userPos: UserPos | null;
  onSelect: (id: number) => void;
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

  container.replaceChildren();
  container.className = 'list';

  const header = document.createElement('div');
  header.className = 'list-header';
  header.innerHTML = `<span class="list-count">${sorted.length}</span><span class="list-count-label">${plural(sorted.length)}</span>`;
  container.appendChild(header);

  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = 'Ничего не найдено';
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

function plural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'место';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'места';
  return 'мест';
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
        ? `<img loading="lazy" decoding="async" alt="" src="${esc(thumbUrl(thumb))}" onerror="this.parentElement.classList.add('img-broken')" />`
        : `<span class="row-thumb-ph">📷</span>`
    }</div>
    <div class="row-body">
      <div class="row-title">${esc(loc.title)}</div>
      ${loc.address ? `<div class="row-address">${esc(loc.address)}</div>` : ''}
      <div class="row-meta">
        <span class="badge ${open ? 'badge-open' : 'badge-closed'}">${open ? 'Открыто' : 'Закрыто'}</span>
        ${distance ? `<span class="row-dist">${esc(distance)}</span>` : ''}
        <span class="row-price ${priceClass}">${esc(formatPrice(loc))}</span>
      </div>
    </div>
    <div class="row-chevron">›</div>
  `;

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
