import { describe, expect, it } from 'vitest';
import { h } from '@stencil/core';
import { render } from '@stencil/vitest';
import './gt-slider-field';

describe('gt-slider-field', () => {
  it('renders a labelled range with formatted value and emits numeric changes', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <gt-slider-field label="透明度" value={42} min={0} max={100} step={1} unit="%" />,
    );
    const input = root.shadowRoot?.querySelector('gt-range')?.shadowRoot?.querySelector('input') as HTMLInputElement;
    const change = spyOnEvent('gt-change');

    expect(root.shadowRoot?.querySelector('[part="label"]')?.textContent).toBe('透明度');
    expect(root.shadowRoot?.querySelector('[part="value"]')?.textContent).toBe('42%');
    input.value = '55';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await waitForChanges();

    expect(change).toHaveReceivedEventDetail({ value: 55 });
    expect((root as unknown as { value: number }).value).toBe(55);
    expect(root.shadowRoot?.querySelector('gt-range')).not.toBeNull();
  });

  it('prefers value-text and propagates disabled and aria label', async () => {
    const { root } = await render(
      <gt-slider-field value={25} valueText="自动" disabled ariaLabel="自动调节" />,
    );
    expect(root.shadowRoot?.querySelector('[part="value"]')?.textContent).toBe('自动');
    const range = root.shadowRoot?.querySelector('gt-range');
    expect(range?.getAttribute('disabled')).not.toBeNull();
    expect(range?.getAttribute('aria-label')).toBe('自动调节');
  });
});
