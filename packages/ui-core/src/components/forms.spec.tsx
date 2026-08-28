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

  it('matches legacy Input layout, affixes, and native form attributes', async () => {
    const { root: plainInput } = await render(<gt-input />);
    const { root: decoratedInput } = await render(
      <gt-input {...({ id: 'plugin-name', list: 'plugin-names', type: 'number' } as Record<string, string>)}><span slot="prefix">#</span><span slot="suffix">ms</span></gt-input>,
    );
    const css = readFileSync(new URL('./gt-input/gt-input.css', import.meta.url), 'utf8');

    expect(plainInput.shadowRoot?.querySelector('[part="prefix"]')?.hasAttribute('hidden')).toBe(true);
    expect(plainInput.shadowRoot?.querySelector('[part="suffix"]')?.hasAttribute('hidden')).toBe(true);
    expect(decoratedInput.shadowRoot?.querySelector('[part="prefix"]')?.hasAttribute('hidden')).toBe(false);
    expect(decoratedInput.shadowRoot?.querySelector('[part="suffix"]')?.hasAttribute('hidden')).toBe(false);
    expect(decoratedInput.shadowRoot?.querySelector('input')?.id).toBe('plugin-name');
    expect(decoratedInput.shadowRoot?.querySelector('input')?.getAttribute('list')).toBe('plugin-names');
    expect(decoratedInput.shadowRoot?.querySelector('[part="stepper"] button[data-step="up"]')).not.toBeNull();
    expect(decoratedInput.shadowRoot?.querySelector('[part="stepper"] button[data-step="down"]')).not.toBeNull();
    expect(css).toContain(':host { display: block; width: 100%;');
    expect(css).toContain('border-radius: var(--ui-radius-sm, var(--gt-radius-sm));');
    expect(css).toContain('.stepper { display: flex; flex-direction: column;');
    expect(css).toContain('input[type="number"] { -moz-appearance: textfield; appearance: textfield; }');
  });

  it('matches legacy Textarea defaults, native attributes, and focus surface', async () => {
    const { root: defaultTextarea } = await render(<gt-textarea />);
    const { root: configuredTextarea } = await render(<gt-textarea id="plugin-notes" rows={4} resize="none" />);
    const css = readFileSync(new URL('./gt-textarea/gt-textarea.css', import.meta.url), 'utf8');

    const defaultControl = defaultTextarea.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement;
    const configuredControl = configuredTextarea.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement;
    expect(defaultControl.hasAttribute('rows')).toBe(false);
    expect(configuredControl.id).toBe('plugin-notes');
    expect(configuredControl.getAttribute('rows')).toBe('4');
    expect(css).toContain(':host { display: block; width: 100%;');
    expect(css).toContain('border-radius: var(--ui-radius-sm, var(--gt-radius-sm));');
    expect(css).toContain('textarea:focus { outline: none; border-color: var(--ui-input-focus-border, var(--gt-color-primary)); box-shadow: var(--gt-focus-ring); }');
    expect(css).not.toContain(':host(:focus-within)');
    expect(css).not.toContain('textarea:disabled { cursor: not-allowed; opacity: 0.56; }');
  });

  it('keeps the Textarea control at the full legacy visual size', () => {
    const css = readFileSync(new URL('./gt-textarea/gt-textarea.css', import.meta.url), 'utf8');

    expect(css).toContain(':host { display: block; width: 100%; font-family: var(--ui-font-family, var(--gt-font-family)); box-sizing: border-box; }');
    expect(css).toContain('textarea { width: 100%; min-width: 0; box-sizing: border-box; padding: var(--ui-control-padding-y-md, 10px) var(--gt-control-padding-x-md); border: var(--ui-border-width-thin, 1px) solid var(--gt-textarea-border-color, var(--ui-input-border, var(--gt-color-border))); border-radius: var(--ui-radius-sm, var(--gt-radius-sm)); background: var(--gt-textarea-background, var(--ui-input-bg, var(--gt-color-surface)));');
    expect(css).toContain('textarea:focus { outline: none; border-color: var(--ui-input-focus-border, var(--gt-color-primary)); box-shadow: var(--gt-focus-ring); }');
    expect(css).not.toContain(':host(:focus-within)');
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

  it('matches legacy Checkbox geometry, optional labels, and disabled interaction', async () => {
    const { root: emptyCheckbox } = await render(<gt-checkbox />);
    const { root: labeledCheckbox } = await render(<gt-checkbox id="desktop-notifications">Enable desktop notifications</gt-checkbox>);
    const css = readFileSync(new URL('./gt-checkbox/gt-checkbox.css', import.meta.url), 'utf8');

    expect(emptyCheckbox.shadowRoot?.querySelector('[part="label"]')?.hasAttribute('hidden')).toBe(true);
    expect(labeledCheckbox.shadowRoot?.querySelector('[part="label"]')?.hasAttribute('hidden')).toBe(false);
    expect(labeledCheckbox.shadowRoot?.querySelector('input')?.id).toBe('desktop-notifications');
    expect(css).toContain(':host { display: inline-flex; align-items: center; font-family: var(--ui-font-family, var(--gt-font-family)); }');
    expect(css).toContain('gap: 8px;');
    expect(css).toContain('box-sizing: border-box; flex: 0 0 auto; width: 18px; height: 18px;');
    expect(css).toContain(':host([disabled]) label { cursor: not-allowed; opacity: 0.58; }');
    expect(css).toContain(':host(:not([disabled])) label:hover .box');
    expect(css).toContain('.icon { display: block; animation: gtCheckboxPop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }');
  });

  it('avoids an extra inline formatting line around Checkbox content', () => {
    const css = readFileSync(new URL('./gt-checkbox/gt-checkbox.css', import.meta.url), 'utf8');

    expect(css).toContain(':host { display: inline-flex; align-items: center; font-family: var(--ui-font-family, var(--gt-font-family)); }');
    expect(css).toContain('label { display: flex;');
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

    expect(radioChange).toHaveReceivedEventDetail({ checked: true, value: '' });
    expect(switchChange).toHaveReceivedEventDetail({ checked: true });
    expect(radio.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(radio.shadowRoot?.querySelector('[part="control"]')).not.toBeNull();
    expect(toggle.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(toggle.shadowRoot?.querySelector('[part="control"]')).not.toBeNull();
  });

  it('matches legacy Radio sizing, labels, and selection value events', async () => {
    const { root: emptyRadio } = await render(<gt-radio />);
    const { root: labeledRadio, spyOnEvent, waitForChanges } = await render(
      <gt-radio id="display-density" value="compact">Compact</gt-radio>,
    );
    const css = readFileSync(new URL('./gt-radio/gt-radio.css', import.meta.url), 'utf8');
    const change = spyOnEvent('gt-change');
    const input = labeledRadio.shadowRoot?.querySelector('input') as HTMLInputElement;

    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForChanges();

    expect(change).toHaveReceivedEventDetail({ checked: true, value: 'compact' });
    expect(emptyRadio.shadowRoot?.querySelector('[part="label"]')?.hasAttribute('hidden')).toBe(true);
    expect(labeledRadio.shadowRoot?.querySelector('[part="label"]')?.hasAttribute('hidden')).toBe(false);
    expect(labeledRadio.shadowRoot?.querySelector('input')?.id).toBe('display-density');
    expect(css).toContain(':host { display: inline-flex; align-items: center; font-family: var(--ui-font-family, var(--gt-font-family)); }');
    expect(css).toContain('box-sizing: border-box; flex: 0 0 auto; width: 18px; height: 18px;');
    expect(css).toContain(':host([disabled]) label { cursor: not-allowed; opacity: 0.58; }');
  });

  it('matches legacy Switch geometry and state styles', async () => {
    const { root } = await render(<gt-switch size="sm" checked aria-label="Automatic sync" />);
    const button = root.shadowRoot?.querySelector('button');
    const css = readFileSync(new URL('./gt-switch/gt-switch.css', import.meta.url), 'utf8');

    expect(button?.getAttribute('role')).toBe('switch');
    expect(button?.getAttribute('aria-checked')).toBe('true');
    expect(css).toContain(':host { display: inline-flex; align-items: center; }');
    expect(css).toContain('box-sizing: border-box; width: var(--gt-switch-size, 42px); height: 24px;');
    expect(css).toContain(':host([size="sm"]) button { width: 34px; height: 20px; }');
    expect(css).toContain(':host([checked]) button { background: var(--ui-primary-color, var(--gt-color-primary)); box-shadow: none; }');
    expect(css).toContain('button:disabled { cursor: not-allowed; opacity: 0.58; }');
  });

  it('matches legacy Tabs geometry and active selection behavior', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <gt-tabs value="overview" items={[
        { value: 'overview', label: 'Overview' },
        { value: 'details', label: 'Details' },
      ]} />,
    );
    const css = readFileSync(new URL('./gt-tabs/gt-tabs.css', import.meta.url), 'utf8');
    const change = spyOnEvent('gt-change');

    root.shadowRoot?.querySelector<HTMLButtonElement>('[data-value="details"]')?.click();
    await waitForChanges();

    expect(change).toHaveReceivedEventDetail({ value: 'details' });
    expect((root as unknown as { value: string }).value).toBe('details');
    expect(root.shadowRoot?.querySelector('[data-value="details"]')?.getAttribute('aria-selected')).toBe('true');
    expect(css).toContain(':host { display: inline-flex; align-items: center; font-family: var(--ui-font-family, var(--gt-font-family)); }');
    expect(css).toContain('box-sizing: border-box; min-width: 0; min-height: 40px;');
    expect(css).toContain('[role="tablist"] { position: relative; display: inline-flex; width: 100%; gap: 8px; }');
    expect(css).toContain('padding: 9px var(--ui-control-padding-x-lg, var(--gt-control-padding-x-lg));');
    expect(css).toContain('font-size: var(--ui-font-size-md, 0.9rem);');
    expect(css).toContain('.indicator { position: absolute; bottom: -1px; left: 0;');
    expect(css).toContain('width: var(--gt-tabs-active-width, 0px);');
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
