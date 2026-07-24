import { GuYanElement } from './base';

export class GuYanCardElement extends GuYanElement {
  static observedAttributes = ['variant', 'padding', 'radius', 'hoverable', 'interactive'];

  get variant(): string { return this.stringAttribute('variant', 'default'); }
  set variant(value: string) { this.reflectString('variant', value); }

  protected render(): void {
    this.root.innerHTML = `
      <style>
        :host { display: block; color: var(--gt-color-text); font-family: var(--gt-font-family); }
        article { border: 1px solid var(--gt-color-border); border-radius: var(--gt-radius-md); background: var(--gt-color-surface); box-shadow: var(--gt-shadow-sm); overflow: hidden; }
        :host([variant="elevated"]) article { box-shadow: var(--gt-shadow-md); }
        :host([variant="muted"]) article { background: var(--gt-color-surface-muted); }
        :host([hoverable]) article, :host([interactive]) article { transition: transform var(--gt-motion-normal) var(--gt-motion-ease), box-shadow var(--gt-motion-normal) var(--gt-motion-ease); }
        :host([hoverable]) article:hover, :host([interactive]) article:hover { transform: translateY(-1px); box-shadow: var(--gt-shadow-md); }
        .section { padding: var(--gt-space-lg); } :host([padding="none"]) .section { padding: 0; } :host([padding="sm"]) .section { padding: var(--gt-space-sm); } :host([padding="lg"]) .section { padding: var(--gt-space-xl); }
        header, footer { border-color: var(--gt-color-border); border-style: solid; border-width: 0; } header:not(:empty) { border-bottom-width: 1px; } footer:not(:empty) { border-top-width: 1px; }
      </style>
      <article data-variant="${this.variant}"><header class="section"><slot name="header"></slot></header><div class="section"><slot></slot></div><footer class="section"><slot name="footer"></slot></footer></article>`;
  }
}
