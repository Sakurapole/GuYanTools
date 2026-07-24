export interface ClickDetail {
  disabled: boolean;
}

export interface StateChangeDetail {
  state: 'loading' | 'empty' | 'error' | 'info';
}

export abstract class GuYanElement extends HTMLElement {
  protected readonly root = this.attachShadow({ mode: 'open' });

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    this.render();
  }

  protected stringAttribute(name: string, fallback = ''): string {
    return this.getAttribute(name) ?? fallback;
  }

  protected booleanAttribute(name: string): boolean {
    return this.hasAttribute(name);
  }

  protected reflectString(name: string, value: string): void {
    if (value) this.setAttribute(name, value);
    else this.removeAttribute(name);
  }

  protected reflectBoolean(name: string, value: boolean): void {
    this.toggleAttribute(name, value);
  }

  protected emit<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(name, {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  protected abstract render(): void;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character);
}
