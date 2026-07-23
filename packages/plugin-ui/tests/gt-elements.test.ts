import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGuYanElements } from '../src/register';

describe('plugin UI custom elements', () => {
  beforeEach(() => {
    registerGuYanElements();
  });

  it('registers elements idempotently and emits typed click events', () => {
    registerGuYanElements();
    const button = document.createElement('gt-button');
    button.setAttribute('variant', 'primary');
    const received = vi.fn();
    button.addEventListener('gt-click', received);
    document.body.append(button);

    button.shadowRoot?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(received).toHaveBeenCalledOnce();
    expect((received.mock.calls[0][0] as CustomEvent<{ disabled: boolean }>).detail).toEqual({ disabled: false });
  });

  it('reflects input properties and emits input detail', () => {
    const input = document.createElement('gt-input') as HTMLElement & { value: string };
    const received = vi.fn();
    input.addEventListener('gt-input', received);
    input.value = 'before';
    document.body.append(input);

    const nativeInput = input.shadowRoot?.querySelector('input') as HTMLInputElement;
    nativeInput.value = 'after';
    nativeInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(input.getAttribute('value')).toBe('after');
    expect((received.mock.calls[0][0] as CustomEvent<{ value: string }>).detail).toEqual({ value: 'after' });
  });
});
