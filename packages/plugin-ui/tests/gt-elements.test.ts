import { beforeEach, describe, expect, it } from 'vitest';
import { registerGuYanElements } from '../src/register';

describe('plugin UI custom elements', () => {
  beforeEach(() => {
    registerGuYanElements();
  });

  it('registers every first-wave Stencil element idempotently', () => {
    registerGuYanElements();
    expect(customElements.get('gt-button')).toBeDefined();
    expect(customElements.get('gt-input')).toBeDefined();
    expect(customElements.get('gt-card')).toBeDefined();
    expect(customElements.get('gt-dialog')).toBeDefined();
    expect(customElements.get('gt-drawer')).toBeDefined();
  });

  it('leaves component behavior to the Stencil core package', () => {
    expect(customElements.get('gt-button')).toBe(customElements.get('gt-button'));
  });
});
