import { GuYanElement, type ClickDetail, escapeHtml } from './base';

export class GuYanIconButtonElement extends GuYanElement {
  static observedAttributes = ['variant', 'size', 'shape', 'disabled', 'active', 'label', 'title', 'type', 'aria-label'];

  get disabled(): boolean { return this.booleanAttribute('disabled'); }
  set disabled(value: boolean) { this.reflectBoolean('disabled', value); }
  get label(): string { return this.stringAttribute('label'); }
  set label(value: string) { this.reflectString('label', value); }

  protected render(): void {
    const label = this.stringAttribute('aria-label') || this.label || this.stringAttribute('title');
    const disabled = this.disabled;
    const type = this.stringAttribute('type', 'button');
    this.root.innerHTML = `
      <style>
        :host { display: inline-block; font-family: var(--gt-font-family); }
        button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: var(--gt-control-height-md); height: var(--gt-control-height-md); padding: 0; border: 1px solid transparent; border-radius: var(--gt-radius-sm); background: transparent; color: var(--gt-color-text); cursor: pointer; }
        :host([size="sm"]) button { width: var(--gt-control-height-sm); height: var(--gt-control-height-sm); }
        :host([size="lg"]) button { width: var(--gt-control-height-lg); height: var(--gt-control-height-lg); }
        :host([shape="circle"]) button { border-radius: 999px; }
        :host([label]) button { width: auto; padding-inline: var(--gt-control-padding-x-sm); }
        :host([variant="secondary"]) button { background: var(--gt-color-surface-muted); border-color: var(--gt-color-border); }
        :host([variant="primary"]) button { background: var(--gt-color-primary); color: var(--gt-color-text-inverse); }
        :host([variant="danger"]) button { color: var(--gt-color-danger); }
        button:hover:not(:disabled), :host([active]) button { background: var(--gt-color-overlay); }
        button:focus-visible { outline: none; box-shadow: var(--gt-focus-ring); }
        button:disabled { cursor: not-allowed; opacity: 0.56; }
      </style>
      <button type="${type}" aria-label="${escapeHtml(label)}" title="${escapeHtml(this.stringAttribute('title'))}" ${disabled ? 'disabled' : ''}>
        <slot></slot>${this.label ? `<span>${escapeHtml(this.label)}</span>` : ''}
      </button>`;
    this.root.querySelector('button')?.addEventListener('click', () => {
      this.emit<ClickDetail>('gt-click', { disabled: this.disabled });
    });
  }
}
