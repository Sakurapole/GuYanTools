import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { h, render } from '@stencil/vitest';

import './gt-button/gt-button';
import './gt-card/gt-card';
import './gt-empty-state/gt-empty-state';
import './gt-field/gt-field';
import './gt-icon-button/gt-icon-button';
import './gt-state-card/gt-state-card';

describe('action and feedback components', () => {
  it('emits a composed click detail from a native button', async () => {
    const { root, spyOnEvent } = await render(<gt-button variant="primary">Save</gt-button>);
    const click = spyOnEvent('gt-click');

    root.shadowRoot?.querySelector('button')?.click();

    expect(click).toHaveReceivedEventDetail({ disabled: false });
  });

  it('provides an accessible name for icon buttons', async () => {
    const { root } = await render(<gt-icon-button label="Close panel" />);

    expect(root.shadowRoot?.querySelector('button')?.getAttribute('aria-label')).toBe('Close panel');
    expect(root.getAttribute('label')).toBe('Close panel');
  });

  it('keeps slotted icon fills synchronized with the icon button color', () => {
    expect(readFileSync(new URL('./gt-icon-button/gt-icon-button.css', import.meta.url), 'utf8'))
      .toContain('::slotted(svg) { fill: currentColor; }');
  });

  it('matches desktop Button geometry without duplicating its visual surface', async () => {
    const { root: plainButton } = await render(<gt-button>Save</gt-button>);
    const { root: decoratedButton } = await render(<gt-button><span slot="prefix">+</span>Save<span slot="suffix">!</span></gt-button>);
    const buttonCss = readFileSync(new URL('./gt-button/gt-button.css', import.meta.url), 'utf8');

    expect(plainButton.shadowRoot?.querySelector('.prefix')?.hasAttribute('hidden')).toBe(true);
    expect(plainButton.shadowRoot?.querySelector('.suffix')?.hasAttribute('hidden')).toBe(true);
    expect(decoratedButton.shadowRoot?.querySelector('.prefix')?.hasAttribute('hidden')).toBe(false);
    expect(decoratedButton.shadowRoot?.querySelector('.suffix')?.hasAttribute('hidden')).toBe(false);
    expect(buttonCss).toContain('min-height: var(--ui-control-height-md, var(--gt-control-height-md));');
    expect(buttonCss).toContain('border-radius: var(--ui-radius-sm, var(--gt-radius-sm));');
    expect(buttonCss).toContain(':host([variant="secondary"]) {');
    expect(buttonCss).toContain('--gt-button-shadow: var(--ui-button-secondary-shadow, none);');
    expect(buttonCss).not.toContain('box-shadow: inherit;');
    expect(buttonCss).not.toContain('transform: inherit;');
    expect(buttonCss).toContain('button:disabled { cursor: inherit; }');
    expect(buttonCss).toContain('font-family: var(--ui-font-family, var(--gt-font-family));');
    expect(buttonCss).toContain('height: var(--ui-control-height-md, var(--gt-control-height-md));');
    expect(buttonCss).toContain(':host([size="sm"]) { height: var(--ui-control-height-sm, var(--gt-control-height-sm));');
    expect(buttonCss).toContain('button {\n  appearance: none;\n  display: flex;');
    expect(buttonCss).toContain('height: 100%;');
    expect(buttonCss).toContain('.label {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;');
  });

  it('matches desktop IconButton geometry without duplicating its visual surface', async () => {
    const { root: iconOnlyButton } = await render(<gt-icon-button />);
    const { root: labeledButton } = await render(<gt-icon-button label="Add item">+</gt-icon-button>);
    const iconButtonCss = readFileSync(new URL('./gt-icon-button/gt-icon-button.css', import.meta.url), 'utf8');

    expect(iconOnlyButton.shadowRoot?.querySelector('[part="icon"]')?.hasAttribute('hidden')).toBe(true);
    expect(labeledButton.shadowRoot?.querySelector('[part="icon"]')?.hasAttribute('hidden')).toBe(false);
    expect(iconButtonCss).toContain(':host {\n  display: inline-block;');
    expect(iconButtonCss).toContain('width: var(--gt-icon-button-size, 34px);');
    expect(iconButtonCss).toContain(':host([size="sm"]:not([label])) { width: var(--gt-icon-button-size, 28px); height: var(--gt-icon-button-size, 28px); }');
    expect(iconButtonCss).toContain(':host([size="lg"]:not([label])) { width: var(--gt-icon-button-size, 40px); height: var(--gt-icon-button-size, 40px); }');
    expect(iconButtonCss).toContain('border-radius: var(--ui-radius-sm, var(--gt-radius-sm));');
    expect(iconButtonCss).toContain('font-family: var(--ui-font-family, var(--gt-font-family));');
    expect(iconButtonCss).toContain('--gt-icon-button-shadow: var(--ui-button-primary-shadow, none);');
    expect(iconButtonCss).toContain(':host(:focus-within) { box-shadow: var(--ui-focus-ring, var(--gt-focus-ring)); }');
    expect(iconButtonCss).not.toContain('background: inherit;');
    expect(iconButtonCss).not.toContain('box-shadow: inherit;');
    expect(iconButtonCss).not.toContain('transform: inherit;');
    expect(iconButtonCss).toMatch(/button \{[^}]*color: inherit;[^}]*font: inherit;/s);
    expect(iconButtonCss).toContain('button:disabled { cursor: inherit; }');
  });

  it('exposes stable parts and CSS variables for action controls', async () => {
    const { root: button } = await render(<gt-button>Save</gt-button>);
    const { root: iconButton } = await render(<gt-icon-button label="Close" />);

    expect(button.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(button.shadowRoot?.querySelector('[part="label"]')).not.toBeNull();
    expect(iconButton.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(iconButton.shadowRoot?.querySelector('[part="icon"]')).not.toBeNull();
    expect(readFileSync(new URL('./gt-button/gt-button.contract.ts', import.meta.url), 'utf8'))
      .toContain("'--gt-button-background'");
    expect(readFileSync(new URL('./gt-icon-button/gt-icon-button.contract.ts', import.meta.url), 'utf8'))
      .toContain("'--gt-icon-button-size'");
  });

  it('preserves Card variants and Field label associations', async () => {
    const { root: card } = await render(<gt-card variant="elevated">Content</gt-card>);
    const { root: field } = await render(<gt-field label="Plugin name" htmlFor="plugin-name" />);

    expect(card.shadowRoot?.querySelector('article')?.dataset.variant).toBe('elevated');
    expect(field.shadowRoot?.querySelector('label')?.htmlFor).toBe('plugin-name');
    expect(card.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(card.shadowRoot?.querySelector('[part="body"]')).not.toBeNull();
    expect(field.shadowRoot?.querySelector('[part="label"]')).not.toBeNull();
    expect(field.shadowRoot?.querySelector('[part="body"]')).not.toBeNull();
    expect(field.shadowRoot?.querySelector('[part="meta"]')).not.toBeNull();
    expect(readFileSync(new URL('./gt-field/gt-field.contract.ts', import.meta.url), 'utf8'))
      .toContain("'required'");
    expect(readFileSync(new URL('./gt-field/gt-field.contract.ts', import.meta.url), 'utf8'))
      .toContain("'meta'");
  });

  it('matches desktop Field conditional regions, slot precedence, and layout spacing', async () => {
    const { root: emptyField } = await render(<gt-field><input /></gt-field>);
    const { root: slottedField } = await render(
      <gt-field required htmlFor="plugin-name"><span slot="label">Plugin name</span><input /><span slot="error">Use a unique name</span><span slot="hint">Shown in the catalog</span></gt-field>,
    );
    const fieldCss = readFileSync(new URL('./gt-field/gt-field.css', import.meta.url), 'utf8');

    expect(emptyField.shadowRoot?.querySelector('[part="label"]')?.hasAttribute('hidden')).toBe(true);
    expect(emptyField.shadowRoot?.querySelector('[part="meta"]')?.hasAttribute('hidden')).toBe(true);
    expect(slottedField.shadowRoot?.querySelector('[part="label"]')?.getAttribute('for')).toBe('plugin-name');
    expect(slottedField.shadowRoot?.querySelector('[part="required"]')).not.toBeNull();
    expect(slottedField.shadowRoot?.querySelector('slot[name="error"]')?.parentElement?.hasAttribute('hidden')).toBe(false);
    expect(slottedField.shadowRoot?.querySelector('slot[name="hint"]')?.parentElement?.hasAttribute('hidden')).toBe(true);
    expect(fieldCss).toContain('font-family: var(--ui-font-family, var(--gt-font-family));');
    expect(fieldCss).toContain('gap: var(--gt-space-md) var(--gt-space-lg);');
    expect(fieldCss).toContain('font-size: 0.78rem;');
    expect(fieldCss).toContain('.field-label[hidden], .meta[hidden], .slot[hidden] { display: none; }');
  });

  it('matches the desktop Input height inside a Field', () => {
    const inputCss = readFileSync(new URL('./gt-input/gt-input.css', import.meta.url), 'utf8');

    expect(inputCss).toContain('min-height: var(--ui-control-height-md, var(--gt-control-height-md));');
    expect(inputCss).toMatch(/:host \{[^}]*;\sheight: var\(--ui-control-height-md, var\(--gt-control-height-md\)\);/);
    expect(inputCss).toContain('height: auto; min-height: 0; align-self: center;');
    expect(inputCss).toContain('height: 100%;');
    expect(inputCss).toContain('box-shadow: inset 0 0 0 var(--ui-border-width-thin, 1px) var(--gt-input-border-color, var(--ui-input-border, var(--gt-color-border)));');
    expect(inputCss).toContain('font-size: var(--ui-input-font-size-md, 0.95rem);');
    expect(inputCss).toContain('line-height: 1.4;');
    expect(inputCss).toContain(':host([size="sm"]) { min-height: var(--ui-control-height-sm, var(--gt-control-height-sm)); height: var(--ui-control-height-sm, var(--gt-control-height-sm)); }');
    expect(inputCss).toContain(':host([size="lg"]) { min-height: var(--ui-control-height-lg, var(--gt-control-height-lg)); height: var(--ui-control-height-lg, var(--gt-control-height-lg)); }');
    expect(inputCss).toContain(':host([size="sm"]) input { padding-block: var(--ui-control-padding-y-sm, 7px);');
    expect(inputCss).toContain(':host([size="lg"]) input { padding-block: var(--ui-control-padding-y-lg, 12px);');
  });

  it('supports the desktop Card bordered compatibility prop', async () => {
    const { root: card } = await render(<gt-card {...({ bordered: false } as { bordered: boolean })}>Content</gt-card>);

    expect(card.hasAttribute('bordered')).toBe(false);
    expect(readFileSync(new URL('./gt-card/gt-card.css', import.meta.url), 'utf8'))
      .toContain(':host(:not([bordered])) { border: 0; }');
  });

  it('does not allocate empty header and footer sections', async () => {
    const { root: plainCard } = await render(<gt-card>Content</gt-card>);
    const { root: structuredCard } = await render(<gt-card><div slot="header">Header</div><div slot="footer">Footer</div></gt-card>);

    expect(plainCard.shadowRoot?.querySelector('header')?.hasAttribute('hidden')).toBe(true);
    expect(plainCard.shadowRoot?.querySelector('footer')?.hasAttribute('hidden')).toBe(true);
    expect(structuredCard.shadowRoot?.querySelector('header')?.hasAttribute('hidden')).toBe(false);
    expect(structuredCard.shadowRoot?.querySelector('footer')?.hasAttribute('hidden')).toBe(false);
  });

  it('keeps a fixed-height card body available for absolutely positioned content', () => {
    const css = readFileSync(new URL('./gt-card/gt-card.css', import.meta.url), 'utf8');

    expect(css).toMatch(/article \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*height: 100%;/s);
    expect(css).toContain('[part="body"] { flex: 1; min-height: 0;');
  });

  it('lets inherited public variables override component defaults', () => {
    const buttonCss = readFileSync(new URL('./gt-button/gt-button.css', import.meta.url), 'utf8');
    const cardCss = readFileSync(new URL('./gt-card/gt-card.css', import.meta.url), 'utf8');
    const inputCss = readFileSync(new URL('./gt-input/gt-input.css', import.meta.url), 'utf8');

    expect(buttonCss).toContain('background: var(--gt-button-background, var(--gt-color-surface-muted));');
    expect(cardCss).toContain('background: var(--gt-card-background, var(--ui-card-bg, var(--gt-color-surface)));');
    expect(cardCss).toContain('box-shadow: var(--ui-card-shadow, var(--gt-card-shadow, var(--gt-shadow-sm)));');
    expect(inputCss).toContain('background: var(--gt-input-background, var(--ui-input-bg, var(--gt-color-surface)));');
  });

  it('uses desktop radius tokens before framework defaults', () => {
    const cardCss = readFileSync(new URL('./gt-card/gt-card.css', import.meta.url), 'utf8');

    expect(cardCss).toContain('border-radius: var(--ui-radius-md, var(--gt-radius-md));');
    expect(cardCss).toContain(':host([radius="sm"]) { border-radius: var(--ui-radius-sm, var(--gt-radius-sm)); }');
    expect(cardCss).toContain(':host([radius="lg"]) { border-radius: var(--ui-radius-lg, var(--gt-radius-lg)); }');
  });

  it('draws Card shadows only once on the host across interaction states', () => {
    const cardCss = readFileSync(new URL('./gt-card/gt-card.css', import.meta.url), 'utf8');

    expect(cardCss).not.toContain('box-shadow: inherit;');
    expect(cardCss).toContain(':host([hoverable]), :host([interactive]) { transition: transform');
    expect(cardCss).toContain(':host([hoverable]):hover, :host([interactive]):hover { transform: translateY(-1px); box-shadow: var(--ui-card-shadow-hover, var(--gt-shadow-md)); }');
    expect(cardCss).toContain(':host([interactive]):focus-within { box-shadow: var(--gt-focus-ring), var(--ui-card-shadow-hover, var(--gt-shadow-md)); }');
  });

  it('projects named icon and action slots for feedback components', async () => {
    const { root: emptyState } = await render(
      <gt-empty-state title="Nothing here"><span slot="icon">I</span><button slot="actions">Create</button></gt-empty-state>,
    );
    const { root: stateCard } = await render(
      <gt-state-card state="error"><span slot="icon">!</span><button slot="actions">Retry</button></gt-state-card>,
    );

    expect(emptyState.shadowRoot?.querySelector('slot[name="icon"]')).not.toBeNull();
    expect(emptyState.shadowRoot?.querySelector('slot[name="actions"]')).not.toBeNull();
    expect(stateCard.shadowRoot?.querySelector('slot[name="icon"]')).not.toBeNull();
    expect(stateCard.shadowRoot?.querySelector('slot[name="actions"]')).not.toBeNull();
    expect(emptyState.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(stateCard.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
  });

  it('matches legacy EmptyState optional content geometry and typography', async () => {
    const { root: emptyState } = await render(<gt-empty-state title="Nothing here" description="No items yet" />);
    const { root: populatedState } = await render(
      <gt-empty-state title="Nothing here"><span slot="icon">I</span><button slot="actions">Create</button></gt-empty-state>,
    );
    const css = readFileSync(new URL('./gt-empty-state/gt-empty-state.css', import.meta.url), 'utf8');

    expect(emptyState.shadowRoot?.querySelector('[part="icon"]')?.hasAttribute('hidden')).toBe(true);
    expect(emptyState.shadowRoot?.querySelector('[part="actions"]')?.hasAttribute('hidden')).toBe(true);
    expect(populatedState.shadowRoot?.querySelector('[part="icon"]')?.hasAttribute('hidden')).toBe(false);
    expect(populatedState.shadowRoot?.querySelector('[part="actions"]')?.hasAttribute('hidden')).toBe(false);
    expect(css).toContain(':host { display: block; color: var(--gt-empty-state-color, var(--ui-text-muted, var(--gt-color-text-muted))); font-family: var(--ui-font-family, var(--gt-font-family)); }');
    expect(css).toContain('box-sizing: border-box; width: 36px; height: 36px;');
    expect(css).toContain('border-radius: var(--ui-radius-sm, var(--gt-radius-sm));');
    expect(css).toContain('background: var(--ui-surface-overlay, var(--gt-color-overlay));');
    expect(css).toContain('font-size: 0.92rem;');
    expect(css).toContain('font-size: 0.82rem; line-height: 1.55;');
  });

  it('does not reserve space for empty StateCard icon and action slots', async () => {
    const { root: emptyStateCard } = await render(<gt-state-card title="Loading" />);
    const { root: populatedStateCard } = await render(
      <gt-state-card title="Loading"><span slot="icon">I</span><button slot="actions">Retry</button></gt-state-card>,
    );

    expect(emptyStateCard.shadowRoot?.querySelector('[part="icon"]')?.hasAttribute('hidden')).toBe(true);
    expect(emptyStateCard.shadowRoot?.querySelector('[part="actions"]')?.hasAttribute('hidden')).toBe(true);
    expect(populatedStateCard.shadowRoot?.querySelector('[part="icon"]')?.hasAttribute('hidden')).toBe(false);
    expect(populatedStateCard.shadowRoot?.querySelector('[part="actions"]')?.hasAttribute('hidden')).toBe(false);
  });

  it('exposes the desktop state-card surface and typography override contract', async () => {
    const { root } = await render(<gt-state-card title="Load failed" description="Try again" state="error" />);
    const css = readFileSync(new URL('./gt-state-card/gt-state-card.css', import.meta.url), 'utf8');
    const contract = readFileSync(new URL('./gt-state-card/gt-state-card.contract.ts', import.meta.url), 'utf8');

    for (const variable of [
      '--gt-state-card-min-width',
      '--gt-state-card-gap',
      '--gt-state-card-padding',
      '--gt-state-card-radius',
      '--gt-state-card-shadow',
      '--gt-state-card-title-color',
      '--gt-state-card-description-color',
      '--gt-state-card-eyebrow-color',
      '--gt-state-card-description-max-width',
      '--gt-state-card-actions-gap',
    ]) {
      expect(contract).toContain(`'${variable}'`);
    }

    expect(root.shadowRoot?.querySelector('[part="title"]')?.textContent).toBe('Load failed');
    expect(root.shadowRoot?.querySelector('[part="description"]')?.textContent).toBe('Try again');
    expect(css).toContain('box-sizing: border-box;');
    expect(css).toContain('width: 100%;');
    expect(css).toContain('min-width: 0;');
    expect(css).toContain('font-family: var(--ui-font-family, var(--gt-font-family));');
    expect(css).toContain('padding: var(--gt-state-card-padding, 0);');
    expect(css).toContain('gap: var(--gt-state-card-actions-gap, 12px);');
  });
});
