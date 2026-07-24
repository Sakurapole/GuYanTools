import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { h, render } from '@stencil/vitest';

import './gt-dialog/gt-dialog';
import './gt-drawer/gt-drawer';
import './gt-tooltip/gt-tooltip';
import { computeOverlayPlacement } from '../utils/overlay-controller';

describe('overlay components', () => {
  afterEach(() => {
    document.body.querySelectorAll('[data-gt-overlay]').forEach((element) => element.remove());
  });

  it('closes an open dialog on Escape and removes its portal', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<gt-dialog open>Content</gt-dialog>);
    const openChange = spyOnEvent('gt-open-change');

    expect(document.body.querySelector('[data-gt-overlay="dialog"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await waitForChanges();

    expect((root as unknown as { open: boolean }).open).toBe(false);
    expect(openChange).toHaveReceivedEventDetail({ open: false, reason: 'escape' });
    expect(document.body.querySelector('[data-gt-overlay="dialog"]')).toBeNull();
  });

  it('keeps persistent drawers open when their mask is pressed', async () => {
    const { root, waitForChanges } = await render(<gt-drawer open persistent>Details</gt-drawer>);
    const mask = document.body.querySelector<HTMLElement>('[data-gt-overlay="drawer"] [data-overlay-mask]');

    mask?.click();
    await waitForChanges();

    expect((root as unknown as { open: boolean }).open).toBe(true);
  });

  it('prevents Tab from escaping an open dialog', async () => {
    await render(<gt-dialog open>Content</gt-dialog>);
    const tab = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' });

    document.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(true);
  });

  it('cleans up tooltip portals and flips constrained placements', async () => {
    const { root, waitForChanges } = await render(<gt-tooltip content="Tip" open><button>Trigger</button></gt-tooltip>);

    expect(document.body.querySelector('[data-gt-overlay="tooltip"]')).not.toBeNull();
    (root as unknown as { open: boolean }).open = false;
    await waitForChanges();

    expect(document.body.querySelector('[data-gt-overlay="tooltip"]')).toBeNull();
    expect(computeOverlayPlacement('right', { left: 90, right: 100, top: 0, bottom: 10 }, { width: 40, height: 20 }, { width: 120, height: 100 })).toBe('left');
  });

  it('copies host --gt variables into the body portal without injecting CSS', async () => {
    const { root } = await render(<gt-dialog open style={{ '--gt-dialog-width': '42rem' }}>Content</gt-dialog>);
    const portal = document.body.querySelector<HTMLElement>('[data-gt-overlay="dialog"]');

    expect(portal?.style.getPropertyValue('--gt-dialog-width')).toBe('42rem');
    expect(portal?.querySelector('[part="layer"]')).not.toBeNull();
    expect(portal?.querySelector('[part="panel"]')).not.toBeNull();
    expect(readFileSync(new URL('../utils/overlay-controller.ts', import.meta.url), 'utf8'))
      .not.toMatch(/innerHTML|<style/);
    expect(root.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
  });
});
