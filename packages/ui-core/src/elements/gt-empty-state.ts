import { GuYanElement, escapeHtml } from './base';

export class GuYanEmptyStateElement extends GuYanElement {
  static observedAttributes = ['title', 'description', 'compact'];

  protected render(): void {
    const title = this.stringAttribute('title');
    const description = this.stringAttribute('description');
    this.root.innerHTML = `
      <style>
        :host { display: block; color: var(--gt-color-text-muted); font-family: var(--gt-font-family); } section { display: flex; align-items: center; flex-direction: column; gap: var(--gt-space-sm); padding: var(--gt-space-xl); text-align: center; } :host([compact]) section { padding: var(--gt-space-md); } h3, p { margin: 0; } h3 { color: var(--gt-color-text); font-size: var(--gt-font-size-md); } p { font-size: var(--gt-font-size-sm); } .actions { display: inline-flex; gap: var(--gt-space-sm); }
      </style>
      <section><slot name="icon"></slot>${title ? `<h3>${escapeHtml(title)}</h3>` : ''}${description ? `<p>${escapeHtml(description)}</p>` : ''}<div class="actions"><slot name="actions"></slot><slot></slot></div></section>`;
  }
}
