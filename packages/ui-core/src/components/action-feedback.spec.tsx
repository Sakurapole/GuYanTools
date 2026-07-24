import { describe, expect, it } from 'vitest';
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
  });

  it('preserves Card variants and Field label associations', async () => {
    const { root: card } = await render(<gt-card variant="elevated">Content</gt-card>);
    const { root: field } = await render(<gt-field label="Plugin name" htmlFor="plugin-name" />);

    expect(card.shadowRoot?.querySelector('article')?.dataset.variant).toBe('elevated');
    expect(field.shadowRoot?.querySelector('label')?.htmlFor).toBe('plugin-name');
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
  });
});
