import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGuYanElements } from '../src';

describe('ui core form elements', () => {
  beforeEach(() => document.body.replaceChildren());
  afterEach(() => document.body.replaceChildren());

  it('reflects input values and clamps numeric stepping', () => {
    registerGuYanElements();
    const input = document.createElement('gt-input') as HTMLElement & { value: string };
    input.setAttribute('type', 'number');
    input.setAttribute('value', '4');
    input.setAttribute('min', '0');
    input.setAttribute('max', '5');
    input.setAttribute('step', '2');
    const received = vi.fn();
    input.addEventListener('gt-input', received);
    document.body.append(input);

    const native = input.shadowRoot?.querySelector('input') as HTMLInputElement;
    native.value = '4';
    native.dispatchEvent(new Event('input', { bubbles: true }));
    input.shadowRoot?.querySelector<HTMLButtonElement>('[data-step="up"]')?.click();

    expect(input.getAttribute('value')).toBe('5');
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ detail: { value: '4' } }));
  });

  it('resets indeterminate state and emits checked detail', () => {
    registerGuYanElements();
    const checkbox = document.createElement('gt-checkbox') as HTMLElement & { indeterminate: boolean };
    const received = vi.fn();
    checkbox.addEventListener('gt-change', received);
    document.body.append(checkbox);

    checkbox.indeterminate = true;
    const native = checkbox.shadowRoot?.querySelector('input') as HTMLInputElement;
    expect(native.indeterminate).toBe(true);
    native.click();

    expect(received).toHaveBeenCalledWith(expect.objectContaining({ detail: { checked: true, indeterminate: false } }));
  });

  it('emits selection changes from radio, switch, and tabs while ignoring disabled tabs', () => {
    registerGuYanElements();
    const radio = document.createElement('gt-radio');
    const toggle = document.createElement('gt-switch');
    const tabs = document.createElement('gt-tabs') as HTMLElement & { items: Array<{ value: string; label: string; disabled?: boolean }>; value: string };
    const changes = vi.fn();
    radio.addEventListener('gt-change', changes);
    toggle.addEventListener('gt-change', changes);
    tabs.addEventListener('gt-change', changes);
    tabs.items = [
      { value: 'overview', label: 'Overview' },
      { value: 'details', label: 'Details', disabled: true },
    ];
    document.body.append(radio, toggle, tabs);

    radio.shadowRoot?.querySelector('input')?.click();
    toggle.shadowRoot?.querySelector('button')?.click();
    tabs.shadowRoot?.querySelector<HTMLButtonElement>('[data-value="details"]')?.click();
    tabs.shadowRoot?.querySelector<HTMLButtonElement>('[data-value="overview"]')?.click();

    expect(tabs.value).toBe('overview');
    expect(changes).toHaveBeenCalledWith(expect.objectContaining({ detail: { checked: true } }));
    expect(changes).toHaveBeenCalledWith(expect.objectContaining({ detail: { value: 'overview' } }));
  });
});
