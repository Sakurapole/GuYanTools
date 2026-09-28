import { GuYanElement } from './base';

const styles = `
  :host {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 2px 8px;
    border: 1px solid transparent;
    border-radius: 999px;
    font-family: var(--gt-font-family, system-ui, sans-serif);
    font-size: var(--gt-font-size-sm, 12px);
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
  }
  :host([tone="neutral"]) { background: var(--gt-color-surface-muted, #eef0f4); color: var(--gt-color-text-muted, #667085); }
  :host([tone="info"]) { background: color-mix(in srgb, var(--gt-color-primary, #4f6ef7) 14%, white); color: var(--gt-color-primary, #4f6ef7); }
  :host([tone="success"]) { background: color-mix(in srgb, var(--gt-color-success, #2f9e64) 16%, white); color: var(--gt-color-success, #2f9e64); }
  :host([tone="warning"]) { background: color-mix(in srgb, var(--gt-color-warning, #d18a00) 18%, white); color: var(--gt-color-warning, #d18a00); }
  :host([tone="danger"]) { background: color-mix(in srgb, var(--gt-color-danger, #d64545) 14%, white); color: var(--gt-color-danger, #d64545); }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: .85;
  }
`;

export type GuYanBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export class GuYanBadgeElement extends GuYanElement {
  static observedAttributes = ['tone', 'dot'];

  constructor() {
    super();
    this.root.innerHTML = `<style>${styles}</style><span class="dot" part="dot" hidden></span><span part="label"><slot></slot></span>`;
  }

  connectedCallback() {
    this.render();
  }
  attributeChangedCallback() {
    this.render();
  }

  private render() {
    if (!this.hasAttribute('tone')) this.setAttribute('tone', 'neutral');
    const dot = this.root.querySelector('.dot') as HTMLElement;
    dot.hidden = !this.booleanAttribute('dot');
  }
}
