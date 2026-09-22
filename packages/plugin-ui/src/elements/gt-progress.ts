import { GuYanElement } from './base';

const styles = `
  :host { display: block; width: 100%; font-family: var(--gt-font-family, system-ui, sans-serif); }
  .track {
    position: relative;
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--gt-color-surface-muted, #e8e8ee);
  }
  .fill {
    height: 100%;
    width: 0%;
    border-radius: inherit;
    background: var(--gt-color-primary, #4f6ef7);
    transition: width .2s ease;
  }
  .fill[data-tone="success"] { background: var(--gt-color-success, #2f9e64); }
  .fill[data-tone="danger"] { background: var(--gt-color-danger, #d64545); }
  .fill[data-tone="warning"] { background: var(--gt-color-warning, #d18a00); }
  :host([indeterminate]) .fill { width: 40%; animation: gt-progress-slide 1.1s ease-in-out infinite; }
  .meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 6px;
    color: var(--gt-color-text-muted, #6b7280);
    font-size: var(--gt-font-size-sm, 12px);
  }
  @keyframes gt-progress-slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(250%); }
  }
`;

export type GuYanProgressTone = 'primary' | 'success' | 'warning' | 'danger';

export class GuYanProgressElement extends GuYanElement {
  static observedAttributes = ['value', 'max', 'tone', 'label', 'show-value', 'indeterminate'];
  private fill!: HTMLElement;
  private labelEl!: HTMLElement;
  private valueEl!: HTMLElement;

  constructor() {
    super();
    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="track" part="track"><div class="fill" part="fill"></div></div>
      <div class="meta"><span class="label"></span><span class="value"></span></div>
    `;
    this.fill = this.root.querySelector('.fill')!;
    this.labelEl = this.root.querySelector('.label')!;
    this.valueEl = this.root.querySelector('.value')!;
  }

  get value(): number { return Number(this.getAttribute('value') ?? 0); }
  set value(value: number) { this.setAttribute('value', String(value)); }

  get max(): number { return Number(this.getAttribute('max') ?? 100); }
  set max(value: number) { this.setAttribute('max', String(value)); }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }

  private render() {
    const max = Number.isFinite(this.max) && this.max > 0 ? this.max : 100;
    const value = Math.min(Math.max(Number.isFinite(this.value) ? this.value : 0, 0), max);
    const ratio = this.booleanAttribute('indeterminate') ? 0 : Math.round((value / max) * 100);
    if (!this.booleanAttribute('indeterminate')) {
      this.fill.style.width = `${ratio}%`;
    }
    this.fill.dataset.tone = this.getAttribute('tone') ?? 'primary';
    this.labelEl.textContent = this.getAttribute('label') ?? '';
    this.valueEl.textContent = this.booleanAttribute('show-value') ? `${ratio}%` : '';
  }
}
