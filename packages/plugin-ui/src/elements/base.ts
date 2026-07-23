export abstract class GuYanElement extends HTMLElement {
  protected readonly root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  protected emit<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  protected booleanAttribute(name: string): boolean {
    return this.hasAttribute(name) && this.getAttribute(name) !== 'false';
  }
}
