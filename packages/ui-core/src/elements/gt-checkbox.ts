import { GuYanElement } from './base';

export interface CheckedChangeDetail { checked: boolean; indeterminate?: boolean; }

export class GuYanCheckboxElement extends GuYanElement {
  static observedAttributes = ['checked', 'indeterminate', 'disabled', 'label', 'name', 'value'];
  get checked(): boolean { return this.booleanAttribute('checked'); }
  set checked(value: boolean) { this.reflectBoolean('checked', value); }
  get indeterminate(): boolean { return this.booleanAttribute('indeterminate'); }
  set indeterminate(value: boolean) { this.reflectBoolean('indeterminate', value); }
  protected render(): void {
    this.root.innerHTML = `<style>:host{display:inline-block;font-family:var(--gt-font-family)}label{display:inline-flex;align-items:center;gap:var(--gt-space-sm);color:var(--gt-color-text);cursor:pointer}input{accent-color:var(--gt-color-primary)}</style><label><input type="checkbox" ${this.checked ? 'checked' : ''} ${this.booleanAttribute('disabled') ? 'disabled' : ''} name="${this.stringAttribute('name')}" value="${this.stringAttribute('value')}"><span><slot>${this.stringAttribute('label')}</slot></span></label>`;
    const input = this.root.querySelector('input')!;
    input.indeterminate = this.indeterminate;
    input.addEventListener('change', () => { this.checked = input.checked; this.indeterminate = false; this.emit<CheckedChangeDetail>('gt-change', { checked: input.checked, indeterminate: false }); });
  }
}
