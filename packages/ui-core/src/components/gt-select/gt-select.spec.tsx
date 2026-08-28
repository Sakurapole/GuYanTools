import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { h, render } from '@stencil/vitest';

import './gt-select';

type SelectOption = { label: string; value: string | number; disabled?: boolean };

const options: SelectOption[] = [
  { label: '标准', value: 'standard' },
  { label: '紧凑', value: 'compact', disabled: true },
  { label: '高级', value: 'advanced' },
];

describe('gt-select', () => {
  it('renders the selected label and emits a value detail when an option is chosen', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <gt-select options={options} value="standard" placeholder="请选择" />,
    );
    const change = spyOnEvent('gt-change');

    expect(root.shadowRoot?.querySelector('[part="label"]')?.textContent).toContain('标准');
    root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]')?.click();
    await waitForChanges();

    const advanced = document.body.querySelector<HTMLElement>('[data-gt-overlay="select"] [role="option"][data-value="advanced"]');
    expect(advanced).not.toBeNull();
    advanced?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForChanges();

    expect(change).toHaveReceivedEventDetail({ value: 'advanced' });
    expect((root as unknown as { value: string }).value).toBe('advanced');
  });

  it('supports keyboard navigation, disabled options, Escape and body-level outside closing', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<gt-select options={options} />);
    const change = spyOnEvent('gt-change');
    const trigger = root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]');

    trigger?.focus();
    trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true, cancelable: true }));
    await waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="select"]')).not.toBeNull();

    const currentTrigger = root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]');
    currentTrigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }));
    await waitForChanges();
    const navigatedTrigger = root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]');
    navigatedTrigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }));
    await waitForChanges();
    const finalTrigger = root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]');
    finalTrigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    await waitForChanges();
    expect(change).toHaveReceivedEventDetail({ value: 'advanced' });

    const reopenedTrigger = root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]');
    reopenedTrigger?.click();
    await waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="select"]')).not.toBeNull();
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="select"]')).toBeNull();

    const escapeTrigger = root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]');
    escapeTrigger?.click();
    await waitForChanges();
    const currentEscapeTrigger = root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]');
    currentEscapeTrigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="select"]')).toBeNull();
  });

  it('closes when the full-screen portal layer is clicked outside the panel', async () => {
    const { root, waitForChanges } = await render(<gt-select options={options} />);
    root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]')?.click();
    await waitForChanges();

    const portal = document.body.querySelector<HTMLElement>('[data-gt-overlay="select"]');
    const layer = portal?.querySelector<HTMLElement>('[part="layer"]');
    expect(layer).not.toBeNull();
    layer?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await waitForChanges();

    expect(document.body.querySelector('[data-gt-overlay="select"]')).toBeNull();
  });

  it('keeps the portal open when outside closing is disabled', async () => {
    const { root, waitForChanges } = await render(<gt-select options={options} />);
    (root as unknown as { closeOnOutside: boolean }).closeOnOutside = false;
    root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]')?.click();
    await waitForChanges();

    const layer = document.body.querySelector<HTMLElement>('[data-gt-overlay="select"] [part="layer"]');
    layer?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await waitForChanges();

    expect(document.body.querySelector('[data-gt-overlay="select"]')).not.toBeNull();
  });

  it('exposes stable parts, size attributes and a fixed overlay contract', async () => {
    const { root } = await render(<gt-select options={options} size="sm" />);
    const css = readFileSync(new URL('./gt-select.css', import.meta.url), 'utf8');
    const overlayCss = readFileSync(new URL('../../styles/overlay-layer.css', import.meta.url), 'utf8');

    expect(root.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="trigger"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="label"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="label"]')?.hasAttribute('data-placeholder')).toBe(true);
    expect(root.getAttribute('size')).toBe('sm');
    expect(overlayCss).toContain('[data-gt-overlay="select"]');
    expect(overlayCss).toContain('position: fixed;');
    expect(overlayCss).toContain('[data-gt-overlay="select"][data-animation="fade"]');
    expect(overlayCss).toContain('[data-gt-overlay="select"][data-animation="slide"]');
    expect(overlayCss).toContain('[data-gt-overlay="select"][data-animation="scale"]');
    expect(overlayCss).toContain('[data-gt-overlay="select"][data-animation="slideScale"]');
    expect(overlayCss).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('button {');
  });
});
