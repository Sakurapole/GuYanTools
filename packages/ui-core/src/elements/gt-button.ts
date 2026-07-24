import { GuYanElement, type ClickDetail } from './base';

export class GuYanButtonElement extends GuYanElement {
  static observedAttributes = ['variant', 'size', 'disabled', 'active', 'block', 'type'];

  get variant(): string { return this.stringAttribute('variant', 'secondary'); }
  set variant(value: string) { this.reflectString('variant', value); }
  get size(): string { return this.stringAttribute('size', 'md'); }
  set size(value: string) { this.reflectString('size', value); }
  get disabled(): boolean { return this.booleanAttribute('disabled'); }
  set disabled(value: boolean) { this.reflectBoolean('disabled', value); }
  get active(): boolean { return this.booleanAttribute('active'); }
  set active(value: boolean) { this.reflectBoolean('active', value); }
  get block(): boolean { return this.booleanAttribute('block'); }
  set block(value: boolean) { this.reflectBoolean('block', value); }

  protected render(): void {
    const disabled = this.disabled;
    const type = this.stringAttribute('type', 'button');
    this.root.innerHTML = `
      <style>
        :host { display: inline-block; font-family: var(--gt-font-family); }
        :host([block]) { display: block; }
        button { display: inline-flex; align-items: center; justify-content: center; gap: var(--gt-space-sm); min-height: var(--gt-control-height-md); padding: 0 var(--gt-control-padding-x-md); border: 1px solid var(--gt-color-border); border-radius: var(--gt-radius-sm); background: var(--gt-color-surface-muted); color: var(--gt-color-text); cursor: pointer; font: inherit; font-weight: 600; }
        :host([size="sm"]) button { min-height: var(--gt-control-height-sm); padding-inline: var(--gt-control-padding-x-sm); }
        :host([size="lg"]) button { min-height: var(--gt-control-height-lg); padding-inline: var(--gt-control-padding-x-lg); }
        :host([variant="primary"]) button { background: var(--gt-color-primary); border-color: var(--gt-color-primary); color: var(--gt-color-text-inverse); }
        :host([variant="danger"]) button { background: var(--gt-color-danger-soft); border-color: transparent; color: var(--gt-color-danger); }
        :host([variant="ghost"]) button { background: transparent; border-color: transparent; }
        :host([active]) button, button:hover:not(:disabled) { box-shadow: var(--gt-focus-ring); }
        :host([block]) button { width: 100%; }
        button:focus-visible { outline: none; box-shadow: var(--gt-focus-ring); }
        button:disabled { cursor: not-allowed; opacity: 0.56; }
        .label { min-width: 0; } slot[name] { display: inline-flex; }
      </style>
      <button type="${type}" ${disabled ? 'disabled' : ''}>
        <slot name="prefix"></slot><span class="label"><slot></slot></span><slot name="suffix"></slot>
      </button>`;
    this.root.querySelector('button')?.addEventListener('click', () => {
      this.emit<ClickDetail>('gt-click', { disabled: this.disabled });
    });
  }
}
