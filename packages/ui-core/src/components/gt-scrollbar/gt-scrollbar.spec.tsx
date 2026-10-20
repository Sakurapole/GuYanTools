import { describe, expect, it, vi } from 'vitest';
import { h } from '@stencil/core';
import { render } from '@stencil/vitest';
import './gt-scrollbar';

describe('gt-scrollbar', () => {
  it('renders enabled axes and forwards viewport scroll events', async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <gt-scrollbar x={false} y>
        <div>Content</div>
      </gt-scrollbar>
    );
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
      scrollByPosition: (options: ScrollToOptions) => Promise<void>;
      scrollToPosition: (options: ScrollToOptions) => Promise<void>;
    };
    const viewport = root.shadowRoot?.querySelector('[part="viewport"]') as HTMLElement;
    const calls: Array<[string, ScrollToOptions]> = [];
    (viewport as unknown as { scrollBy: (options: ScrollToOptions) => void }).scrollBy = (
      options
    ) => {
      calls.push(['by', options]);
    };
    (viewport as unknown as { scrollTo: (options: ScrollToOptions) => void }).scrollTo = (
      options
    ) => {
      calls.push(['to', options]);
    };

    await expect(component.refresh()).resolves.toBeUndefined();
    await component.scrollByPosition({ top: 20 });
    await component.scrollToPosition({ left: 10 });
    expect(calls).toEqual([
      ['by', { top: 20 }],
      ['to', { left: 10 }],
    ]);
  });

  it('animates drawer wheel scrolling when smooth-wheel is enabled', async () => {
    const { root } = await render(<gt-scrollbar x={false} y smoothWheel />);
    const viewport = root.shadowRoot?.querySelector('[part="viewport"]') as HTMLElement;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 800 },
    });
    viewport.scrollTop = 0;
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    try {
      const wheel = new Event('wheel', { bubbles: true, cancelable: true, composed: true });
      Object.defineProperties(wheel, {
        deltaX: { value: 0 },
        deltaY: { value: 120 },
        deltaMode: { value: 0 },
      });
      viewport.dispatchEvent(wheel);
      expect(wheel.defaultPrevented).toBe(true);
      expect(viewport.scrollTop).toBe(0);
      frame?.(performance.now() + 200);
      expect(viewport.scrollTop).toBe(120);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
