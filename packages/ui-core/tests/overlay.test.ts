import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeOverlayPlacement, registerGuYanElements } from '../src';

describe('ui core overlays', () => {
  beforeEach(() => document.body.replaceChildren());
  afterEach(() => document.body.replaceChildren());

  it('mounts dialog overlays to body and closes them with Escape', () => {
    registerGuYanElements();
    const dialog = document.createElement('gt-dialog') as HTMLElement & { open: boolean };
    const received = vi.fn();
    dialog.addEventListener('gt-open-change', received);
    document.body.append(dialog);

    dialog.open = true;
    expect(document.body.querySelector('[data-gt-overlay="dialog"]')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(dialog.open).toBe(false);
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ detail: { open: false, reason: 'escape' } }));
    expect(document.body.querySelector('[data-gt-overlay="dialog"]')).toBeNull();
  });

  it('moves dialog light-DOM content into the body portal and labels drawers separately', () => {
    registerGuYanElements();
    const dialog = document.createElement('gt-dialog') as HTMLElement & { open: boolean };
    dialog.innerHTML = '<p data-dialog-content>Plugin settings</p>';
    const drawer = document.createElement('gt-drawer') as HTMLElement & { open: boolean };
    drawer.setAttribute('position', 'left');
    document.body.append(dialog, drawer);

    dialog.open = true;
    drawer.open = true;

    expect(document.body.querySelector('[data-gt-overlay="dialog"] [data-dialog-content]')?.textContent).toBe('Plugin settings');
    expect(document.body.querySelector('[data-gt-overlay="drawer"] .panel')?.getAttribute('data-position')).toBe('left');
  });

  it('flips a tooltip placement when the requested side would overflow', () => {
    expect(computeOverlayPlacement('right', { left: 720, top: 100, right: 780, bottom: 130, width: 60, height: 30 }, { width: 120, height: 40 }, { width: 800, height: 600 })).toBe('left');
  });

  it('removes tooltip listeners and portal when disconnected', () => {
    registerGuYanElements();
    const tooltip = document.createElement('gt-tooltip') as HTMLElement & { open: boolean };
    document.body.append(tooltip);
    tooltip.open = true;
    expect(document.body.querySelector('[data-gt-overlay="tooltip"]')).not.toBeNull();

    tooltip.remove();
    expect(document.body.querySelector('[data-gt-overlay="tooltip"]')).toBeNull();
  });
});
