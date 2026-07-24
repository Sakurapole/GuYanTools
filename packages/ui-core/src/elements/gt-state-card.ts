import { GuYanElement, type StateChangeDetail, escapeHtml } from './base';

export class GuYanStateCardElement extends GuYanElement {
  static observedAttributes = ['state', 'title', 'description', 'compact'];

  get state(): StateChangeDetail['state'] {
    const value = this.stringAttribute('state', 'info');
    return value === 'loading' || value === 'empty' || value === 'error' ? value : 'info';
  }
  set state(value: StateChangeDetail['state']) { this.reflectString('state', value); }

  protected render(): void {
    const title = this.stringAttribute('title');
    const description = this.stringAttribute('description');
    const state = this.state;
    const eyebrow = state.slice(0, 1).toUpperCase() + state.slice(1);
    this.root.innerHTML = `
      <style>
        :host { display: block; color: var(--gt-color-text); font-family: var(--gt-font-family); } article { display: flex; flex-direction: column; align-items: center; gap: var(--gt-space-sm); padding: var(--gt-space-xl); border: 1px solid var(--gt-color-border); border-radius: var(--gt-radius-md); background: var(--gt-color-surface); text-align: center; } :host([compact]) article { padding: var(--gt-space-lg); } .eyebrow, p { margin: 0; color: var(--gt-color-text-muted); font-size: var(--gt-font-size-sm); } strong { color: var(--gt-color-text); } :host([state="error"]) strong { color: var(--gt-color-danger); } .actions { display: flex; gap: var(--gt-space-sm); }
      </style>
      <article role="status" aria-live="polite"><slot name="icon"></slot><span class="eyebrow">${eyebrow}</span>${title ? `<strong>${escapeHtml(title)}</strong>` : ''}${description ? `<p>${escapeHtml(description)}</p>` : ''}<div class="actions"><slot name="actions"></slot></div></article>`;
  }
}
