import type { Location, WorkingHour, Comment } from '../core/types';
import { isOpenNow, minskNow } from '../data/open-now';
import { renderGallery } from './gallery';
import { esc } from './format';
import { t, type I18nKey } from '../i18n';

export interface CardOpts {
  onBack: () => void;
  onRoute: (loc: Location) => void;
  onShare: (loc: Location) => void;
}

// Day index 1..7 (Mon..Sun) → i18n key. Index 0 is unused (days are 1-based).
const DAY_KEYS: I18nKey[] = [
  'day.mon', // placeholder at 0 is never read; keep array 1-based below
  'day.mon',
  'day.tue',
  'day.wed',
  'day.thu',
  'day.fri',
  'day.sat',
  'day.sun',
];

/** Render the full location detail card into `container`. */
export function renderCard(container: HTMLElement, loc: Location, opts: CardOpts): void {
  container.replaceChildren();
  container.className = 'card';

  // ── Back bar ──
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'card-back';
  back.innerHTML = `<span aria-hidden="true">←</span> ${esc(t('common.back'))}`;
  back.addEventListener('click', opts.onBack);
  container.appendChild(back);

  // ── Gallery ──
  const gallery = document.createElement('div');
  renderGallery(gallery, loc);
  container.appendChild(gallery);

  // ── Body (scroll content) ──
  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = buildBodyHtml(loc);
  container.appendChild(body);

  // ── Wire interactive buttons (added via querySelector to keep markup declarative) ──
  body.querySelector<HTMLButtonElement>('[data-act="route"]')
    ?.addEventListener('click', () => opts.onRoute(loc));
  body.querySelector<HTMLButtonElement>('[data-act="share"]')
    ?.addEventListener('click', () => opts.onShare(loc));
}

function buildBodyHtml(loc: Location): string {
  return [
    headerHtml(loc),
    ratingHtml(loc),
    chipsHtml(loc),
    tagsHtml(loc),
    hoursHtml(loc.working_hours),
    priceHtml(loc),
    `<button type="button" class="btn btn-primary" data-act="route">
       <span aria-hidden="true">🧭</span> ${esc(t('card.route'))}
     </button>`,
    descriptionHtml(loc),
    commentsHtml(loc.comments),
    `<button type="button" class="btn btn-secondary" data-act="share">
       <span aria-hidden="true">↗</span> ${esc(t('card.share'))}
     </button>`,
  ].join('');
}

function headerHtml(loc: Location): string {
  const verified = loc.is_verified
    ? `<span class="verified-badge"><span aria-hidden="true">✓</span> ${esc(t('card.verified'))}</span>`
    : '';
  const address = loc.address ? `<div class="card-address">${esc(loc.address)}</div>` : '';
  return `
    <div class="card-header">
      <h2 class="card-title">${esc(loc.title)}${verified}</h2>
      ${address}
    </div>`;
}

function ratingHtml(loc: Location): string {
  const overall = loc.rating_overall ?? 0;
  const hasRatings = overall > 0;

  if (!hasRatings) {
    return `<div class="rating-block rating-empty">${esc(t('card.noRatings'))}</div>`;
  }

  const axis = (icon: string, label: string, val?: number): string => {
    const v = val ?? 0;
    const pct = Math.max(0, Math.min(100, (v / 5) * 100));
    return `
      <div class="rating-axis">
        <span class="rating-axis-label"><span aria-hidden="true">${icon}</span> ${label}</span>
        <span class="rating-axis-bar"><span class="rating-axis-fill" style="width:${pct}%"></span></span>
        <span class="rating-axis-val">${v ? v.toFixed(1) : '—'}</span>
      </div>`;
  };

  const reviews = loc.reviews_count
    ? `<span class="rating-reviews">${loc.reviews_count} ${esc(t('card.reviewsWord', { n: loc.reviews_count }))}</span>`
    : '';

  return `
    <div class="rating-block">
      <div class="rating-overall">
        <span class="rating-overall-num">${overall.toFixed(1)}</span>
        <span class="rating-overall-stars" aria-hidden="true">${stars(overall)}</span>
        ${reviews}
      </div>
      <div class="rating-axes">
        ${axis('🧼', t('card.cleanliness'), loc.rating_cleanliness_avg)}
        ${axis('🔧', t('card.equipment'), loc.rating_equipment_avg)}
        ${axis('❤️', t('card.loyalty'), loc.rating_loyalty_avg)}
      </div>
    </div>`;
}

function stars(v: number): string {
  const full = Math.round(v);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

function chipsHtml(loc: Location): string {
  const chips: string[] = [];
  if (loc.is_accessible) chips.push(chip('♿', t('card.accessible')));
  if ((loc.cabins_count ?? 0) > 0) chips.push(chip('🚽', t('card.cabins', { n: loc.cabins_count })));
  if ((loc.urinals_count ?? 0) > 0) chips.push(chip('🧍', t('card.urinals', { n: loc.urinals_count })));
  if ((loc.sinks_count ?? 0) > 0) chips.push(chip('🧼', t('card.sinks', { n: loc.sinks_count })));
  if (chips.length === 0) return '';
  return `<div class="chips">${chips.join('')}</div>`;
}

function chip(icon: string, label: string): string {
  return `<span class="chip"><span aria-hidden="true">${icon}</span> ${esc(label)}</span>`;
}

function tagsHtml(loc: Location): string {
  const tags = loc.tags ?? [];
  if (tags.length === 0) return '';
  const pills = tags
    .map(
      (t) =>
        `<span class="tag-pill">${t.icon ? `<span aria-hidden="true">${esc(t.icon)}</span> ` : ''}${esc(t.name)}</span>`,
    )
    .join('');
  return `<div class="tags">${pills}</div>`;
}

function hoursHtml(hours: WorkingHour[]): string {
  if (!hours || hours.length === 0) return '';
  const today = minskNow().day;
  const open = isOpenNow(hours);

  const rows = [1, 2, 3, 4, 5, 6, 7]
    .map((day) => {
      const h = hours.find((x) => x.day === day);
      const isToday = day === today;
      let value: string;
      let closed = false;
      if (!h || h.is_closed || !h.open || !h.close) {
        value = esc(t('card.closed'));
        closed = true;
      } else {
        value = `${esc(h.open)}–${esc(h.close)}`;
        if (h.break_start && h.break_end) {
          value += ` <span class="hours-break">${esc(t('card.break', { start: h.break_start, end: h.break_end }))}</span>`;
        }
      }
      return `
        <div class="hours-row${isToday ? ' hours-today' : ''}">
          <span class="hours-day">${esc(t(DAY_KEYS[day]))}</span>
          <span class="hours-val${closed ? ' hours-closed' : ''}">${value}</span>
        </div>`;
    })
    .join('');

  return `
    <div class="hours">
      <div class="section-title">
        ${esc(t('card.hours'))}
        <span class="badge ${open ? 'badge-open' : 'badge-closed'}">${open ? esc(t('card.open')) : esc(t('card.closed'))}</span>
      </div>
      ${rows}
    </div>`;
}

function priceHtml(loc: Location): string {
  let label: string;
  let cls: string;
  switch (loc.price_type) {
    case 'free':
      label = t('card.priceFree');
      cls = 'price-free';
      break;
    case 'paid':
      label = loc.price_value != null
        ? t('card.pricePaidValue', { value: loc.price_value.toFixed(2) })
        : t('card.pricePaid');
      cls = 'price-paid';
      break;
    case 'conditional_free':
      label = t('card.priceConditional');
      cls = 'price-conditional_free';
      break;
    default:
      label = '';
      cls = '';
  }
  const condition =
    loc.price_type === 'conditional_free' && loc.condition_text
      ? `<div class="price-condition">${esc(loc.condition_text)}</div>`
      : '';
  return `
    <div class="price-block">
      <span class="price-badge ${cls}">${esc(label)}</span>
      ${condition}
    </div>`;
}

function descriptionHtml(loc: Location): string {
  if (!loc.description) return '';
  return `
    <div class="description">
      <div class="section-title">${esc(t('card.howToFind'))}</div>
      <p>${esc(loc.description)}</p>
    </div>`;
}

function commentsHtml(comments: Comment[]): string {
  if (!comments || comments.length === 0) return '';
  const items = comments
    .map((c) => {
      const date = c.created_at ? formatDate(c.created_at) : '';
      return `
        <li class="comment">
          <div class="comment-head">
            <span class="comment-author">${c.author_emoji ? `${esc(c.author_emoji)} ` : ''}${esc(c.author_name ?? t('card.guest'))}</span>
            ${date ? `<span class="comment-date">${esc(date)}</span>` : ''}
          </div>
          <p class="comment-text">${esc(c.comment_text)}</p>
        </li>`;
    })
    .join('');
  return `
    <div class="comments">
      <div class="section-title">${esc(t('card.comments'))}</div>
      <ul class="comment-list">${items}</ul>
    </div>`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}
