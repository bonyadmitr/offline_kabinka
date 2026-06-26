import { createSearch } from '../../src/ui/search';

test('debounced input fires onQuery once after delay', async () => {
  const got: string[] = [];
  const { el } = createSearch({ onQuery: (q) => got.push(q), debounceMs: 20 });
  document.body.appendChild(el);
  const input = el.querySelector<HTMLInputElement>('.search-input')!;

  input.value = 'st';
  input.dispatchEvent(new Event('input'));
  input.value = 'ste';
  input.dispatchEvent(new Event('input'));
  input.value = 'stella';
  input.dispatchEvent(new Event('input'));

  // Nothing yet (still within debounce window).
  expect(got).toEqual([]);
  await new Promise((r) => setTimeout(r, 40));
  // Only the last value fires.
  expect(got).toEqual(['stella']);
  el.remove();
});

test('clear button appears with text and resets immediately', async () => {
  const got: string[] = [];
  const { el } = createSearch({ onQuery: (q) => got.push(q), debounceMs: 20 });
  document.body.appendChild(el);
  const input = el.querySelector<HTMLInputElement>('.search-input')!;
  const clear = el.querySelector<HTMLButtonElement>('.search-clear')!;

  expect(clear.hidden).toBe(true);
  input.value = 'abc';
  input.dispatchEvent(new Event('input'));
  expect(clear.hidden).toBe(false);

  clear.click();
  expect(input.value).toBe('');
  expect(clear.hidden).toBe(true);
  // Clear is immediate (no debounce wait needed).
  expect(got).toEqual(['']);
  el.remove();
});

test('setValue updates input without firing onQuery', () => {
  const got: string[] = [];
  const ctl = createSearch({ onQuery: (q) => got.push(q) });
  document.body.appendChild(ctl.el);
  ctl.setValue('preset');
  expect(ctl.el.querySelector<HTMLInputElement>('.search-input')!.value).toBe('preset');
  expect(got).toEqual([]);
  ctl.el.remove();
});
