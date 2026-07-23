import { GuYanElement } from './base';

const styles = `
  :host { display: block; font-family: var(--gt-font-family); }
  input { box-sizing: border-box; width: 100%; min-height: var(--gt-control-height-md); padding: 8px 12px; border: 1px solid var(--gt-color-border); border-radius: var(--gt-radius-sm); background: var(--gt-color-surface); color: var(--gt-color-text); font: inherit; font-size: var(--gt-font-size-md); outline: none; transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease; }
  input::placeholder { color: var(--gt-color-text-subtle); }
  input:focus { border-color: var(--gt-color-primary); box-shadow: var(--gt-focus-ring); }
  input:disabled { background: var(--gt-color-surface-muted); color: var(--gt-color-text-subtle); cursor: not-allowed; }
  input[data-size="sm"] { min-height: var(--gt-control-height-sm); padding: 6px 10px; font-size: var(--gt-font-size-sm); }
  input[data-size="lg"] { min-height: var(--gt-control-height-lg); padding: 10px 14px; font-size: var(--gt-font-size-lg); }
`;

export class GuYanInputElement extends GuYanElement {
  static observedAttributes = ['value', 'placeholder', 'disabled', 'readonly', 'type', 'size'];
  private input: HTMLInputElement;

  constructor() {
    super();
    this.root.innerHTML = `<style>${styles}</style><input />`;
    this.input = this.root.querySelector('input')!;
    this.input.addEventListener('input', () => {
      this.setAttribute('value', this.input.value);
      this.emit('gt-input', { value: this.input.value });
    });
    this.input.addEventListener('change', () => this.emit('gt-change', { value: this.input.value }));
    this.input.addEventListener('focus', event => this.emit('gt-focus', event));
    this.input.addEventListener('blur', event => this.emit('gt-blur', event));
  }

  get value(): string { return this.getAttribute('value') ?? ''; }
  set value(value: string) { this.setAttribute('value', value); }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }

  private render() {
    this.input.value = this.value;
    this.input.placeholder = this.getAttribute('placeholder') ?? '';
    this.input.disabled = this.booleanAttribute('disabled');
    this.input.readOnly = this.booleanAttribute('readonly');
    this.input.type = this.getAttribute('type') ?? 'text';
    this.input.dataset.size = this.getAttribute('size') ?? 'md';
  }
}
