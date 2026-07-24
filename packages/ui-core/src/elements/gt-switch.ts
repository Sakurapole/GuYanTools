import { GuYanElement } from './base';
import type { CheckedChangeDetail } from './gt-checkbox';

export class GuYanSwitchElement extends GuYanElement {
  static observedAttributes = ['checked', 'disabled', 'aria-label'];
  get checked(): boolean { return this.booleanAttribute('checked'); }
  set checked(value: boolean) { this.reflectBoolean('checked', value); }
  protected render(): void {
    this.root.innerHTML = `<style>:host{display:inline-block}button{width:38px;height:22px;padding:2px;border:0;border-radius:999px;background:var(--gt-color-border);cursor:pointer}span{display:block;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform var(--gt-motion-normal) var(--gt-motion-ease)}:host([checked]) button{background:var(--gt-color-primary)}:host([checked]) span{transform:translateX(16px)}button:focus-visible{outline:none;box-shadow:var(--gt-focus-ring)}button:disabled{cursor:not-allowed;opacity:.56}</style><button type="button" role="switch" aria-checked="${this.checked}" aria-label="${this.stringAttribute('aria-label')}" ${this.booleanAttribute('disabled') ? 'disabled' : ''}><span></span></button>`;
    this.root.querySelector('button')?.addEventListener('click', () => { this.checked = !this.checked; this.emit<CheckedChangeDetail>('gt-change', { checked: this.checked }); });
  }
}
