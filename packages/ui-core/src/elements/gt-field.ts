import { GuYanElement, escapeHtml } from './base';

export class GuYanFieldElement extends GuYanElement {
  static observedAttributes = ['label', 'hint', 'error', 'required', 'for', 'layout'];

  protected render(): void {
    const label = this.stringAttribute('label');
    const hint = this.stringAttribute('hint');
    const error = this.stringAttribute('error');
    const controlId = this.stringAttribute('for');
    this.root.innerHTML = `
      <style>
        :host { display: block; color: var(--gt-color-text); font-family: var(--gt-font-family); }
        .field { display: grid; gap: var(--gt-space-sm); } :host([layout="horizontal"]) .field { grid-template-columns: minmax(96px, 132px) minmax(0, 1fr); column-gap: var(--gt-space-lg); }
        label { font-size: var(--gt-font-size-md); font-weight: 600; } .required, .error { color: var(--gt-color-danger); } .hint, .error { margin: 0; font-size: var(--gt-font-size-sm); color: var(--gt-color-text-muted); } .error { color: var(--gt-color-danger); } .meta { min-height: 18px; } :host([layout="horizontal"]) .meta { grid-column: 2; }
      </style>
      <div class="field">
        ${label ? `<label for="${escapeHtml(controlId)}"><slot name="label">${escapeHtml(label)}</slot>${this.booleanAttribute('required') ? '<span class="required">*</span>' : ''}</label>` : '<slot name="label"></slot>'}
        <div><slot></slot></div>
        <div class="meta"><slot name="error">${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}</slot><slot name="hint">${!error && hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ''}</slot></div>
      </div>`;
  }
}
