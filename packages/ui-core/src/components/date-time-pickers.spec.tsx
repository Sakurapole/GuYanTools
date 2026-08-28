import { describe, expect, it } from 'vitest';
import { h, render } from '@stencil/vitest';

import './gt-date-picker/gt-date-picker';
import './gt-time-picker/gt-time-picker';
import './gt-date-time-picker/gt-date-time-picker';

describe('date and time pickers', () => {
  it('opens a date calendar in a body portal, selects and clears a date', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<gt-date-picker value="2026-08-15" clearable />);
    const change = spyOnEvent('gt-change');
    root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]')?.click();
    await waitForChanges();

    const portal = document.body.querySelector<HTMLElement>('[data-gt-overlay="date-picker"]');
    expect(portal?.querySelector('[part="calendar"]')).not.toBeNull();
    expect(portal?.querySelector('[data-date="2026-08-15"]')).not.toBeNull();
    portal?.querySelector<HTMLElement>('[data-date="2026-08-20"]')?.click();
    await waitForChanges();
    expect(change).toHaveReceivedEventDetail({ value: '2026-08-20' });

    root.shadowRoot?.querySelector<HTMLButtonElement>('[part="clear"]')?.click();
    await waitForChanges();
    expect((root as unknown as { value: string }).value).toBe('');
  });

  it('generates minute options from minuteStep and closes on Escape', async () => {
    const { root, waitForChanges } = await render(<gt-time-picker value="09:10" minuteStep={10} />);
    root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]')?.click();
    await waitForChanges();

    const portal = document.body.querySelector<HTMLElement>('[data-gt-overlay="time-picker"]');
    expect(portal?.querySelectorAll('[data-minute]').length).toBe(6);
    const trigger = root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]');
    trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="time-picker"]')).toBeNull();
  });

  it('closes date and time portals when their full-screen layer is clicked outside the panel', async () => {
    const date = await render(<gt-date-picker value="2026-08-15" />);
    date.root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]')?.click();
    await date.waitForChanges();
    const datePortal = document.body.querySelector<HTMLElement>('[data-gt-overlay="date-picker"]');
    datePortal?.querySelector<HTMLElement>('[part="layer"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await date.waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="date-picker"]')).toBeNull();

    const time = await render(<gt-time-picker value="09:10" />);
    time.root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]')?.click();
    await time.waitForChanges();
    const timePortal = document.body.querySelector<HTMLElement>('[data-gt-overlay="time-picker"]');
    timePortal?.querySelector<HTMLElement>('[part="layer"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await time.waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="time-picker"]')).toBeNull();
  });

  it('allows outside closing to be disabled independently for date and time pickers', async () => {
    const date = await render(<gt-date-picker value="2026-08-15" />);
    (date.root as unknown as { closeOnOutside: boolean }).closeOnOutside = false;
    date.root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]')?.click();
    await date.waitForChanges();
    document.body.querySelector<HTMLElement>('[data-gt-overlay="date-picker"] [part="layer"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await date.waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="date-picker"]')).not.toBeNull();

    const time = await render(<gt-time-picker value="09:10" />);
    (time.root as unknown as { closeOnOutside: boolean }).closeOnOutside = false;
    time.root.shadowRoot?.querySelector<HTMLButtonElement>('[part="trigger"]')?.click();
    await time.waitForChanges();
    document.body.querySelector<HTMLElement>('[data-gt-overlay="time-picker"] [part="layer"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await time.waitForChanges();
    expect(document.body.querySelector('[data-gt-overlay="time-picker"]')).not.toBeNull();
  });

  it('formats DateTime values without timezone drift', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <gt-date-time-picker value="2026-08-15T09:30" valueFormat="sql" />,
    );
    const change = spyOnEvent('gt-change');
    const date = root.shadowRoot?.querySelector('gt-date-picker');
    date?.dispatchEvent(new CustomEvent('gt-change', { detail: { value: '2026-08-20' }, bubbles: true, composed: true }));
    await waitForChanges();
    expect(change).toHaveReceivedEventDetail({ value: '2026-08-20 09:30:00' });
  });
});
