import { describe, expect, it } from 'vitest';
import { h, render } from '@stencil/vitest';

import './gt-menu/gt-menu';
import './gt-menu-item/gt-menu-item';
import './gt-menu-divider/gt-menu-divider';
import './gt-disclosure/gt-disclosure';
import './gt-popup-surface/gt-popup-surface';

describe('menu primitives', () => {
  it('opens a body-level menu, exposes menu semantics, and closes from outside or Escape', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <gt-menu visible x={120} y={160}>
        <gt-menu-item><span slot="icon">I</span>打开</gt-menu-item>
        <gt-menu-divider />
        <gt-menu-item disabled>不可用</gt-menu-item>
      </gt-menu>,
    );
    const close = spyOnEvent('gt-close');

    await waitForChanges();
    const portal = document.body.querySelector<HTMLElement>('[data-gt-overlay="menu"]');
    expect(portal).not.toBeNull();
    expect(portal?.querySelector('[role="menu"]')).not.toBeNull();
    expect(portal?.querySelector('gt-menu-item')?.shadowRoot?.querySelector('[role="menuitem"]')).not.toBeNull();
    expect(portal?.querySelector('[role="separator"]')).not.toBeNull();
    expect(portal?.querySelectorAll('gt-menu-item')[1]?.shadowRoot?.querySelector('[role="menuitem"][aria-disabled="true"]')).not.toBeNull();

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await waitForChanges();
    expect(close).toHaveReceivedEvent();
    expect(document.body.querySelector('[data-gt-overlay="menu"]')).toBeNull();

    root.setAttribute('visible', '');
    await waitForChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="menu"]')).toBeNull();
  });

  it('treats a menu portal layer click as outside the panel', async () => {
    const { waitForChanges } = await render(<gt-menu visible x={120} y={160}><gt-menu-item>打开</gt-menu-item></gt-menu>);
    await waitForChanges();
    document.body.querySelector<HTMLElement>('[data-gt-overlay="menu"] [part="layer"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="menu"]')).toBeNull();
  });

  it('renders disclosure state and emits toggle changes', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <gt-disclosure title="更多信息"><span>内容</span></gt-disclosure>,
    );
    const toggle = spyOnEvent('gt-open-change');
    const summary = root.shadowRoot?.querySelector<HTMLElement>('summary');

    expect(root.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="body"]')?.hasAttribute('hidden')).toBe(true);
    summary?.click();
    await waitForChanges();
    expect(toggle).toHaveReceivedEventDetail({ open: true });
  });

  it('supports popup surface variants, dimensions, and outside-close contract', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <gt-popup-surface modelValue variant="floating" width="240px" panelClass="test-panel">
        <span>浮层内容</span>
      </gt-popup-surface>,
    );
    const change = spyOnEvent('gt-open-change');

    await waitForChanges();
    const portal = document.body.querySelector<HTMLElement>('[data-gt-overlay="popup"]');
    const panel = portal?.querySelector<HTMLElement>('[part="panel"]');
    expect(portal?.dataset.variant).toBe('floating');
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.classList.contains('test-panel')).toBe(true);
    expect(panel?.style.width).toBe('240px');

    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await waitForChanges();
    expect(change).toHaveReceivedEventDetail({ open: false, reason: 'outside' });
  });

  it('treats a floating popup portal layer click as outside the panel', async () => {
    const { waitForChanges } = await render(<gt-popup-surface modelValue variant="floating"><span>浮层内容</span></gt-popup-surface>);
    await waitForChanges();
    document.body.querySelector<HTMLElement>('[data-gt-overlay="popup"] [part="layer"]')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="popup"]')).toBeNull();
  });
});
