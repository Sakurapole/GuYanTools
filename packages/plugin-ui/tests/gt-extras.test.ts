import { describe, expect, it } from 'vitest';
import { GuYanProgressElement } from '../src/elements/gt-progress';
import { GuYanBadgeElement } from '../src/elements/gt-badge';
import { GuYanLogViewElement } from '../src/elements/gt-log-view';

function defineOnce(name: string, ctor: CustomElementConstructor) {
  if (!customElements.get(name)) customElements.define(name, ctor);
}

describe('plugin-ui extras', () => {
  it('registers progress, badge, and log-view elements', () => {
    defineOnce('gt-progress', GuYanProgressElement);
    defineOnce('gt-badge', GuYanBadgeElement);
    defineOnce('gt-log-view', GuYanLogViewElement);
    expect(customElements.get('gt-progress')).toBe(GuYanProgressElement);
    expect(customElements.get('gt-badge')).toBe(GuYanBadgeElement);
    expect(customElements.get('gt-log-view')).toBe(GuYanLogViewElement);
  });

  it('renders progress ratio and badge tone defaults', () => {
    defineOnce('gt-progress', GuYanProgressElement);
    defineOnce('gt-badge', GuYanBadgeElement);
    const progress = document.createElement('gt-progress') as GuYanProgressElement;
    progress.setAttribute('value', '25');
    progress.setAttribute('max', '50');
    progress.setAttribute('show-value', '');
    document.body.appendChild(progress);
    const fill = progress.shadowRoot?.querySelector('.fill') as HTMLElement;
    expect(fill.style.width).toBe('50%');
    progress.remove();

    const badge = document.createElement('gt-badge') as GuYanBadgeElement;
    document.body.appendChild(badge);
    expect(badge.getAttribute('tone')).toBe('neutral');
    badge.remove();
  });

  it('appends log entries with basic escaping', () => {
    defineOnce('gt-log-view', GuYanLogViewElement);
    const view = document.createElement('gt-log-view') as GuYanLogViewElement;
    document.body.appendChild(view);
    view.appendLog({ time: '12:00:00', level: 'error', message: '<script>alert(1)</script>' });
    const html = view.shadowRoot?.innerHTML ?? '';
    expect(html).toContain('&lt;script&gt;');
    expect(view.hasAttribute('empty')).toBe(false);
    view.remove();
  });
});
