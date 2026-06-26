import type { FilterState, LayoutType, PriceType, Tag, Location } from '../core/types';
import { defaultFilter } from '../data/filter';
import { openModal } from './modal';
import { esc } from './format';
import { t } from '../i18n';

// Built per-open (not module-level constants) so labels reflect the active language.
const layoutLabels = (): Array<{ value: LayoutType; label: string }> => [
  { value: 'block', label: t('filters.layoutBlock') },
  { value: 'separate_male', label: t('filters.layoutMale') },
  { value: 'separate_female', label: t('filters.layoutFemale') },
  { value: 'unisex', label: t('filters.layoutUnisex') },
];

const priceLabels = (): Array<{ value: PriceType; label: string; dot: string }> => [
  { value: 'free', label: t('filters.priceFree'), dot: 'green' },
  { value: 'conditional_free', label: t('filters.priceConditional'), dot: 'blue' },
  { value: 'paid', label: t('filters.pricePaid'), dot: 'purple' },
];

/** Number of active filter conditions — drives the toolbar badge. */
export function activeFilterCount(f: FilterState): number {
  return (
    (f.openNow ? 1 : 0) +
    f.layoutTypes.size +
    f.priceTypes.size +
    (f.accessibleOnly ? 1 : 0) +
    f.tagSlugs.size +
    (f.minRating > 0 ? 1 : 0)
  );
}

/** Collect unique tags (by slug) across the given locations, sorted by name. */
export function collectTags(locations: Location[]): Tag[] {
  const bySlug = new Map<string, Tag>();
  for (const loc of locations) {
    for (const t of loc.tags ?? []) {
      if (!bySlug.has(t.slug)) bySlug.set(t.slug, t);
    }
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export interface FiltersOpts {
  /** Locations to derive the amenity (tag) list from. */
  locations: Location[];
}

/**
 * Open the filters modal. `current` seeds the controls; `onApply` is called
 * *live* — on every control change — with a fresh FilterState (query is preserved
 * from `current`, never edited here). There is no "Apply" button: changes take
 * effect immediately and the modal is closed via the ✕, the backdrop, Escape, or
 * "Reset".
 */
export function openFilters(
  current: FilterState,
  onApply: (f: FilterState) => void,
  opts: FiltersOpts,
): void {
  // Working copy of the mutable sets/values; `query` is carried through untouched.
  const draft = {
    openNow: current.openNow,
    layoutTypes: new Set<LayoutType>(current.layoutTypes),
    priceTypes: new Set<PriceType>(current.priceTypes),
    accessibleOnly: current.accessibleOnly,
    tagSlugs: new Set<string>(current.tagSlugs),
    minRating: current.minRating,
  };

  const modal = openModal({ title: t('filters.title') });
  const tags = collectTags(opts.locations);

  modal.body.innerHTML = `
    <div class="filter-group">
      ${toggleRow('openNow', '💡', t('filters.openNow'), draft.openNow)}
    </div>

    <div class="filter-group">
      <div class="filter-label">${esc(t('filters.byGender'))}</div>
      <div class="filter-checks">
        ${layoutLabels().map((o) =>
          checkRow('layout', o.value, esc(o.label), draft.layoutTypes.has(o.value)),
        ).join('')}
      </div>
    </div>

    <div class="filter-group">
      <div class="filter-label">${esc(t('filters.priceType'))}</div>
      <div class="filter-checks">
        ${priceLabels().map((o) =>
          checkRow(
            'price',
            o.value,
            `<span class="dot dot-${o.dot}" aria-hidden="true"></span> ${esc(o.label)}`,
            draft.priceTypes.has(o.value),
          ),
        ).join('')}
      </div>
    </div>

    <div class="filter-group">
      ${toggleRow('accessibleOnly', '♿', t('filters.accessibleOnly'), draft.accessibleOnly)}
    </div>

    ${
      tags.length > 0
        ? `<div class="filter-group">
            <div class="filter-label">${esc(t('filters.amenities'))}</div>
            <div class="filter-chips">
              ${tags
                .map(
                  (t) =>
                    `<button type="button" class="filter-chip${
                      draft.tagSlugs.has(t.slug) ? ' is-on' : ''
                    }" data-tag="${esc(t.slug)}" aria-pressed="${draft.tagSlugs.has(t.slug)}">${
                      t.icon ? `<span aria-hidden="true">${esc(t.icon)}</span> ` : ''
                    }${esc(t.name)}</button>`,
                )
                .join('')}
            </div>
          </div>`
        : ''
    }

    <div class="filter-group">
      <div class="filter-label">${esc(t('filters.minRating'))}</div>
      <div class="filter-segment" role="group" aria-label="${esc(t('filters.minRatingLabel'))}">
        ${[0, 1, 2, 3, 4, 5]
          .map(
            (r) =>
              `<button type="button" class="seg-btn${
                draft.minRating === r ? ' is-on' : ''
              }" data-rating="${r}" aria-pressed="${draft.minRating === r}">${
                r === 0 ? esc(t('filters.ratingAny')) : esc(t('filters.ratingStars', { r }))
              }</button>`,
          )
          .join('')}
      </div>
    </div>
  `;

  // ── Wire controls ──
  const body = modal.body;

  // Emit a fresh FilterState from the current draft. Called after every control
  // change so the list/markers/badge update live (no "Apply" step). New Sets are
  // copied so the store's referential-equality check sees a fresh `filter`.
  const emit = (): void => {
    onApply({
      openNow: draft.openNow,
      layoutTypes: new Set(draft.layoutTypes),
      priceTypes: new Set(draft.priceTypes),
      accessibleOnly: draft.accessibleOnly,
      tagSlugs: new Set(draft.tagSlugs),
      minRating: draft.minRating,
      query: current.query, // never edited by the filters modal
    });
  };

  // openNow toggle
  body.querySelector<HTMLInputElement>('[data-toggle="openNow"]')?.addEventListener('change', (e) => {
    draft.openNow = (e.target as HTMLInputElement).checked;
    emit();
  });
  // accessibleOnly toggle
  body
    .querySelector<HTMLInputElement>('[data-toggle="accessibleOnly"]')
    ?.addEventListener('change', (e) => {
      draft.accessibleOnly = (e.target as HTMLInputElement).checked;
      emit();
    });

  // layout checkboxes
  body.querySelectorAll<HTMLInputElement>('[data-check="layout"]').forEach((el) => {
    el.addEventListener('change', () => {
      const v = el.value as LayoutType;
      if (el.checked) draft.layoutTypes.add(v);
      else draft.layoutTypes.delete(v);
      emit();
    });
  });
  // price checkboxes
  body.querySelectorAll<HTMLInputElement>('[data-check="price"]').forEach((el) => {
    el.addEventListener('change', () => {
      const v = el.value as PriceType;
      if (el.checked) draft.priceTypes.add(v);
      else draft.priceTypes.delete(v);
      emit();
    });
  });

  // tag chips
  body.querySelectorAll<HTMLButtonElement>('[data-tag]').forEach((el) => {
    el.addEventListener('click', () => {
      const slug = el.dataset.tag!;
      const on = !draft.tagSlugs.has(slug);
      if (on) draft.tagSlugs.add(slug);
      else draft.tagSlugs.delete(slug);
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-pressed', String(on));
      emit();
    });
  });

  // rating segment
  const ratingBtns = body.querySelectorAll<HTMLButtonElement>('[data-rating]');
  ratingBtns.forEach((el) => {
    el.addEventListener('click', () => {
      draft.minRating = Number(el.dataset.rating);
      ratingBtns.forEach((b) => {
        const on = b === el;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      emit();
    });
  });

  // ── Footer: only "Reset" (no "Apply" — changes are live). Close via ✕/backdrop. ──
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn btn-secondary';
  reset.textContent = t('common.reset');
  reset.addEventListener('click', () => {
    // Reset to defaults but keep the (untouched) query. Closes the modal.
    onApply({ ...defaultFilter(), query: current.query });
    modal.close();
  });

  modal.footer.append(reset);
}

function toggleRow(key: string, icon: string, label: string, checked: boolean): string {
  return `
    <label class="filter-toggle">
      <span class="filter-toggle-label"><span aria-hidden="true">${icon}</span> ${esc(label)}</span>
      <span class="switch">
        <input type="checkbox" data-toggle="${esc(key)}" ${checked ? 'checked' : ''} />
        <span class="switch-track" aria-hidden="true"></span>
      </span>
    </label>`;
}

function checkRow(group: string, value: string, labelHtml: string, checked: boolean): string {
  return `
    <label class="filter-check">
      <input type="checkbox" data-check="${esc(group)}" value="${esc(value)}" ${
        checked ? 'checked' : ''
      } />
      <span class="filter-check-box" aria-hidden="true"></span>
      <span class="filter-check-label">${labelHtml}</span>
    </label>`;
}
