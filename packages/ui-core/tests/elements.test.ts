import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGuYanElements } from '../src';

describe('ui core action elements', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('registers action elements idempotently and emits click detail', () => {
    registerGuYanElements();
    registerGuYanElements();

    const button = document.createElement('gt-button');
    const received = vi.fn();
    button.addEventListener('gt-click', received);
    document.body.append(button);

    button.shadowRoot?.querySelector('button')?.click();

    expect(customElements.get('gt-button')).toBeDefined();
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ detail: { disabled: false } }));
  });

  it('renders an icon button with an accessible name', () => {
    registerGuYanElements();

    const button = document.createElement('gt-icon-button');
    button.setAttribute('label', 'Close panel');
    document.body.append(button);

    expect(button.shadowRoot?.querySelector('button')?.getAttribute('aria-label')).toBe('Close panel');
  });

  it('exposes card variants and field label associations', () => {
    registerGuYanElements();

    const card = document.createElement('gt-card');
    card.setAttribute('variant', 'elevated');
    const field = document.createElement('gt-field');
    field.setAttribute('label', 'Plugin name');
    field.setAttribute('for', 'plugin-name');
    document.body.append(card, field);

    expect(card.shadowRoot?.querySelector('article')?.dataset.variant).toBe('elevated');
    expect(field.shadowRoot?.querySelector('label')?.htmlFor).toBe('plugin-name');
  });
});
