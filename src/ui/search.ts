// Search box mounted above the nearby list. Debounced input pushes the query
// upward; a clear (✕) button resets it. Purely a controlled input — the caller
// owns the FilterState and re-renders the list from it.

export interface SearchOpts {
  /** Initial query value. */
  value?: string;
  /** Debounced (≈150ms) query changes. */
  onQuery: (q: string) => void;
  /** Debounce delay in ms (overridable for tests). */
  debounceMs?: number;
}

export interface SearchControl {
  /** The mounted element. */
  el: HTMLElement;
  /** Programmatically set the input value without firing onQuery. */
  setValue(q: string): void;
}

export function createSearch(opts: SearchOpts): SearchControl {
  const debounceMs = opts.debounceMs ?? 150;

  const wrap = document.createElement('div');
  wrap.className = 'search';

  const icon = document.createElement('span');
  icon.className = 'search-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '🔍';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'search-input';
  input.placeholder = 'Поиск по названию или адресу';
  input.setAttribute('aria-label', 'Поиск');
  input.autocomplete = 'off';
  // Suppress the native clear affordance; we render our own.
  input.setAttribute('enterkeyhint', 'search');
  input.value = opts.value ?? '';

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'search-clear';
  clear.setAttribute('aria-label', 'Очистить');
  clear.innerHTML = '<span aria-hidden="true">✕</span>';
  clear.hidden = !input.value;

  wrap.append(icon, input, clear);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = (q: string): void => {
    clear.hidden = q.length === 0;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => opts.onQuery(q), debounceMs);
  };

  input.addEventListener('input', () => fire(input.value));

  clear.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    if (timer) clearTimeout(timer);
    opts.onQuery(''); // immediate on explicit clear
    input.focus();
  });

  return {
    el: wrap,
    setValue(q: string): void {
      input.value = q;
      clear.hidden = q.length === 0;
    },
  };
}
