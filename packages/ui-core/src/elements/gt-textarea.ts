import { GuYanElement } from './base';
import type { ValueChangeDetail } from './gt-input';

export class GuYanTextareaElement extends GuYanElement {
  static observedAttributes = ['value', 'placeholder', 'disabled', 'readonly', 'rows', 'maxlength', 'resize'];
  get value(): string { return this.stringAttribute('value'); }
  set value(value: string) { this.reflectString('value', value); }
  protected render(): void {
    const disabled = this.booleanAttribute('disabled');
    this.root.innerHTML = `<style>:host{display:block;font-family:var(--gt-font-family)}textarea{width:100%;box-sizing:border-box;padding:var(--gt-space-sm);border:1px solid var(--gt-color-border);border-radius:var(--gt-radius-sm);background:var(--gt-color-surface);color:var(--gt-color-text);font:inherit;resize:${this.stringAttribute('resize', 'vertical')}}textarea:focus{outline:0;box-shadow:var(--gt-focus-ring)}</style><textarea rows="${this.stringAttribute('rows', '3')}" placeholder="${this.stringAttribute('placeholder')}" maxlength="${this.stringAttribute('maxlength')}" ${disabled ? 'disabled' : ''} ${this.booleanAttribute('readonly') ? 'readonly' : ''}>${this.value}</textarea>`;
    const textarea = this.root.querySelector('textarea')!;
    textarea.addEventListener('input', () => this.update(textarea.value, 'gt-input'));
    textarea.addEventListener('change', () => this.update(textarea.value, 'gt-change'));
  }
  focus(): void { this.root.querySelector('textarea')?.focus(); }
  select(): void { this.root.querySelector('textarea')?.select(); }
  private update(value: string, event: 'gt-input' | 'gt-change'): void { this.value = value; this.emit<ValueChangeDetail>(event, { value }); }
}
