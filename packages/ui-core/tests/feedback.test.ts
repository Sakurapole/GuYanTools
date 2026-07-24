import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerGuYanElements } from '../src';

describe('ui core feedback elements', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('keeps empty-state and state-card slots visible', () => {
    registerGuYanElements();

    const empty = document.createElement('gt-empty-state');
    empty.innerHTML = '<span slot="actions">Retry</span>';
    const state = document.createElement('gt-state-card');
    state.setAttribute('state', 'error');
    state.innerHTML = '<span slot="actions">Reconnect</span>';
    document.body.append(empty, state);

    expect(empty.shadowRoot?.querySelector('slot[name="actions"]')).not.toBeNull();
    expect(state.shadowRoot?.querySelector('[role="status"]')?.textContent).toContain('Error');
    expect(state.shadowRoot?.querySelector('slot[name="actions"]')).not.toBeNull();
  });
});
