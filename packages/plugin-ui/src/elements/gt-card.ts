import { GuYanElement } from './base';

const styles = `
  :host { display: block; font-family: var(--gt-font-family); }
  section { box-sizing: border-box; min-height: 0; padding: 16px; background: var(--gt-color-surface); border: 1px solid var(--gt-color-border); border-radius: var(--gt-radius-md); box-shadow: var(--gt-shadow-md); color: var(--gt-color-text); }
  :host([padding="none"]) section { padding: 0; }
  :host([padding="sm"]) section { padding: 10px; }
  :host([padding="lg"]) section { padding: 24px; }
  :host([variant="muted"]) section { background: var(--gt-color-surface-muted); box-shadow: var(--gt-shadow-sm); }
  :host([variant="elevated"]) section { box-shadow: var(--gt-shadow-lg); }
  :host([hoverable]) section { transition: transform .18s ease, box-shadow .18s ease; }
  :host([hoverable]) section:hover { transform: translateY(-1px); box-shadow: var(--gt-shadow-lg); }
`;

export class GuYanCardElement extends GuYanElement {
  static observedAttributes = ['variant', 'padding', 'hoverable'];

  constructor() {
    super();
    this.root.innerHTML = `<style>${styles}</style><section><slot></slot></section>`;
  }
}
