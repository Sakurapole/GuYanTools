import { GuYanElement } from './base';

export type GuYanButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type GuYanButtonSize = 'sm' | 'md' | 'lg';

const styles = `
  :host { display: inline-flex; font-family: var(--gt-font-family); }
  :host([block]) { display: flex; width: 100%; }
  button { appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: var(--gt-control-height-md); padding: 9px var(--gt-control-padding-x-lg); border: 1px solid transparent; border-radius: var(--gt-radius-sm); font: inherit; font-size: var(--gt-font-size-md); font-weight: 600; line-height: 1.4; white-space: nowrap; cursor: pointer; user-select: none; transition: background-color .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
  button:focus-visible { outline: none; box-shadow: var(--gt-focus-ring); }
  button:hover:not(:disabled) { transform: translateY(-1px); }
  button:disabled { opacity: .56; cursor: not-allowed; transform: none; }
  button[data-size="sm"] { min-height: var(--gt-control-height-sm); padding: 6px var(--gt-control-padding-x-sm); font-size: var(--gt-font-size-sm); }
  button[data-size="lg"] { min-height: var(--gt-control-height-lg); padding: 11px var(--gt-control-padding-x-lg); font-size: var(--gt-font-size-lg); }
  button[data-variant="primary"] { background: var(--gt-color-primary); color: var(--gt-color-text-inverse); box-shadow: var(--gt-shadow-sm); }
  button[data-variant="primary"]:hover:not(:disabled) { background: var(--gt-color-primary-hover); }
  button[data-variant="secondary"] { background: var(--gt-color-surface-muted); color: var(--gt-color-text); border-color: var(--gt-color-border); box-shadow: var(--gt-shadow-sm); }
  button[data-variant="ghost"] { background: transparent; color: var(--gt-color-text-muted); }
  button[data-variant="ghost"]:hover:not(:disabled) { background: var(--gt-color-overlay); color: var(--gt-color-text); }
  button[data-variant="danger"] { background: var(--gt-color-danger-soft); color: var(--gt-color-danger); border-color: var(--gt-color-danger-soft); }
  slot[name="prefix"], slot[name="suffix"] { display: inline-flex; align-items: center; }
`;

export class GuYanButtonElement extends GuYanElement {
  static observedAttributes = ['variant', 'size', 'disabled', 'active', 'block'];
  private button: HTMLButtonElement;

  constructor() {
    super();
    this.root.innerHTML = `<style>${styles}</style><button type="button"><slot name="prefix"></slot><span><slot></slot></span><slot name="suffix"></slot></button>`;
    this.button = this.root.querySelector('button')!;
    this.button.addEventListener('click', () => this.emit('gt-click', { disabled: this.disabled }));
  }

  get disabled(): boolean { return this.booleanAttribute('disabled'); }
  set disabled(value: boolean) { value ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }

  private render() {
    this.button.disabled = this.disabled;
    this.button.dataset.variant = (this.getAttribute('variant') as GuYanButtonVariant | null) ?? 'secondary';
    this.button.dataset.size = (this.getAttribute('size') as GuYanButtonSize | null) ?? 'md';
    this.button.dataset.active = this.booleanAttribute('active') ? 'true' : 'false';
  }
}
