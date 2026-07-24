import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { h, render } from '@stencil/vitest';

import './gt-checkbox/gt-checkbox';
import './gt-input/gt-input';
import './gt-radio/gt-radio';
import './gt-switch/gt-switch';
import './gt-tabs/gt-tabs';
import './gt-textarea/gt-textarea';

describe('form and selection components', () => {
  it('reflects input values and clamps numeric stepping', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <gt-input type="number" value="1" min="0" max="2" step="1" />,
    );
    const input = root.shadowRoot?.querySelector('input') as HTMLInputElement;
    const inputEvent = spyOnEvent('gt-input');
    const changeEvent = spyOnEvent('gt-change');

    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await waitForChanges();
    root.shadowRoot?.querySelector<HTMLButtonElement>('[data-step="up"]')?.click();
    await waitForChanges();

    expect(inputEvent).toHaveReceivedEventDetail({ value: '2' });
    expect(changeEvent).toHaveReceivedEventDetail({ value: '2' });
    expect((root as unknown as { value: string }).value).toBe('2');
    expect(root.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="control"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="prefix"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="suffix"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="stepper"]')).not.toBeNull();
  });

  it('clears checkbox indeterminate state after user input', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<gt-checkbox indeterminate />);
    const checkbox = root.shadowRoot?.querySelector('input') as HTMLInputElement;
    const change = spyOnEvent('gt-change');

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForChanges();

    expect(change).toHaveReceivedEventDetail({ checked: true, indeterminate: false });
    expect((root as unknown as { indeterminate: boolean }).indeterminate).toBe(false);
  });

  it('emits checked details from radio and switch controls', async () => {
    const { root: radio, spyOnEvent: radioEvents } = await render(<gt-radio />);
    const { root: toggle, spyOnEvent: switchEvents } = await render(<gt-switch />);
    const radioChange = radioEvents('gt-change');
    const switchChange = switchEvents('gt-change');

    const radioInput = radio.shadowRoot?.querySelector('input') as HTMLInputElement;
    radioInput.checked = true;
    radioInput.dispatchEvent(new Event('change', { bubbles: true }));
    toggle.shadowRoot?.querySelector('button')?.click();

    expect(radioChange).toHaveReceivedEventDetail({ checked: true });
    expect(switchChange).toHaveReceivedEventDetail({ checked: true });
    expect(radio.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(radio.shadowRoot?.querySelector('[part="control"]')).not.toBeNull();
    expect(toggle.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(toggle.shadowRoot?.querySelector('[part="control"]')).not.toBeNull();
  });

  it('does not select disabled tabs and renders an active indicator', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<gt-tabs value="overview" />);
    const tabs = root as unknown as {
      items: Array<{ value: string; label: string; disabled?: boolean }>;
      value: string;
    };
    tabs.items = [
      { value: 'overview', label: 'Overview' },
      { value: 'details', label: 'Details', disabled: true },
    ];
    await waitForChanges();
    const change = spyOnEvent('gt-change');

    root.shadowRoot?.querySelector<HTMLButtonElement>('[data-value="details"]')?.click();

    expect(tabs.value).toBe('overview');
    expect(change.events).toHaveLength(0);
    expect(root.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="tab"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="indicator"]')).not.toBeNull();
    expect(readFileSync(new URL('./gt-tabs/gt-tabs.tsx', import.meta.url), 'utf8'))
      .not.toContain('<style>');
  });

  it('exposes textarea focus and select methods', async () => {
    const { root } = await render(<gt-textarea value="Notes" />);
    const textarea = root as unknown as { focus: () => Promise<void>; select: () => Promise<void> };

    await expect(textarea.focus()).resolves.toBeUndefined();
    await expect(textarea.select()).resolves.toBeUndefined();
    expect(root.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="control"]')).not.toBeNull();
  });
});
