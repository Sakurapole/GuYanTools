import { describe, expect, it } from 'vitest';
import { h } from '@stencil/core';
import { render } from '@stencil/vitest';
import './gt-range';

describe('gt-range', () => {
  it('emits numeric values and exposes public slider parts', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<gt-range value={25} min={0} max={100} step={5} />);
    const input = root.shadowRoot?.querySelector('input') as HTMLInputElement;
    const change = spyOnEvent('gt-change');
    input.value = '40';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await waitForChanges();
    expect(change).toHaveReceivedEventDetail({ value: 40 });
    expect((root as unknown as { value: number }).value).toBe(40);
    expect(root.shadowRoot?.querySelector('[part="track"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="fill"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="thumb"]')).not.toBeNull();
  });
});
