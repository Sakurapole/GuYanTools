import { GuYanElement } from './base';
import type { CheckedChangeDetail } from './gt-checkbox';

export class GuYanRadioElement extends GuYanElement {
  static observedAttributes = ['checked', 'disabled', 'label', 'name', 'value'];
  get checked(): boolean { return this.booleanAttribute('checked'); }
  set checked(value: boolean) { this.reflectBoolean('checked', value); }
  protected render(): void {
    this.root.innerHTML = `<style>:host{display:inline-block;font-family:var(--gt-font-family)}label{display:inline-flex;align-items:center;gap:var(--gt-space-sm);color:var(--gt-color-text);cursor:pointer}input{accent-color:var(--gt-color-primary)}</style><label><input type="radio" ${this.checked ? 'checked' : ''} ${this.booleanAttribute('disabled') ? 'disabled' : ''} name="${this.stringAttribute('name')}" value="${this.stringAttribute('value')}"><span><slot>${this.stringAttribute('label')}</slot></span></label>`;
    const input = this.root.querySelector('input')!;
    input.addEventListener('change', () => { this.checked = input.checked; this.emit<CheckedChangeDetail>('gt-change', { checked: input.checked }); });
  }
}
