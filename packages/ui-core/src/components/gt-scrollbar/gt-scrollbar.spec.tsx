import { describe, expect, it } from 'vitest';
import { h } from '@stencil/core';
import { render } from '@stencil/vitest';
import './gt-scrollbar';

describe('gt-scrollbar', () => {
  it('renders enabled axes and forwards viewport scroll events', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<gt-scrollbar x={false} y><div>Content</div></gt-scrollbar>);
    const scroll = spyOnEvent('gt-scroll');
    const viewport = root.shadowRoot?.querySelector('[part="viewport"]') as HTMLElement;

    expect(root.shadowRoot?.querySelector('[part="rail-x"]')).toBeNull();
    expect(root.shadowRoot?.querySelector('[part="rail-y"]')).not.toBeNull();
    viewport.dispatchEvent(new Event('scroll'));
    await waitForChanges();
    expect(scroll).toHaveReceivedEventTimes(1);
  });

  it('exposes refresh and programmatic scrolling methods', async () => {
    const { root } = await render(<gt-scrollbar />);
    const component = root as unknown as {
      refresh: () => Promise<void>;
      scrollBy: (options: ScrollToOptions) => Promise<void>;
      scrollTo: (options: ScrollToOptions) => Promise<void>;
    };
    const viewport = root.shadowRoot?.querySelector('[part="viewport"]') as HTMLElement;
    const calls: Array<[string, ScrollToOptions]> = [];
    (viewport as unknown as { scrollBy: (options: ScrollToOptions) => void }).scrollBy = (options) => { calls.push(['by', options]); };
    (viewport as unknown as { scrollTo: (options: ScrollToOptions) => void }).scrollTo = (options) => { calls.push(['to', options]); };

    await expect(component.refresh()).resolves.toBeUndefined();
    await component.scrollBy({ top: 20 });
    await component.scrollTo({ left: 10 });
    expect(calls).toEqual([['by', { top: 20 }], ['to', { left: 10 }]]);
  });
});
