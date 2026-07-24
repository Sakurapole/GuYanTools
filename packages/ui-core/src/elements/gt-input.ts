import { GuYanElement } from './base';

export interface ValueChangeDetail { value: string; }

export class GuYanInputElement extends GuYanElement {
  static observedAttributes = ['value', 'placeholder', 'disabled', 'readonly', 'size', 'type', 'min', 'max', 'step'];
  get value(): string { return this.stringAttribute('value'); }
  set value(value: string) { this.reflectString('value', value); }
  get disabled(): boolean { return this.booleanAttribute('disabled'); }
  set disabled(value: boolean) { this.reflectBoolean('disabled', value); }
  get readonly(): boolean { return this.booleanAttribute('readonly'); }
  set readonly(value: boolean) { this.reflectBoolean('readonly', value); }

  protected render(): void {
    const type = this.stringAttribute('type', 'text');
    const numeric = type === 'number';
    const disabled = this.disabled;
    this.root.innerHTML = `<style>:host{display:block;font-family:var(--gt-font-family)}.shell{display:flex;align-items:center;border:1px solid var(--gt-color-border);border-radius:var(--gt-radius-sm);background:var(--gt-color-surface)}input{width:100%;min-height:var(--gt-control-height-md);box-sizing:border-box;border:0;background:transparent;color:var(--gt-color-text);font:inherit;outline:0;padding:0 var(--gt-control-padding-x-sm)}input:focus{box-shadow:var(--gt-focus-ring)}button{width:28px;border:0;border-left:1px solid var(--gt-color-border);background:transparent;color:var(--gt-color-text);cursor:pointer}button:disabled{cursor:not-allowed}</style><div class="shell"><slot name="prefix"></slot><input value="${this.value}" placeholder="${this.stringAttribute('placeholder')}" type="${type}" ${disabled ? 'disabled' : ''} ${this.readonly ? 'readonly' : ''} min="${this.stringAttribute('min')}" max="${this.stringAttribute('max')}" step="${this.stringAttribute('step', '1')}"><slot name="suffix"></slot>${numeric ? '<button type="button" data-step="up">+</button><button type="button" data-step="down">-</button>' : ''}</div>`;
    const input = this.root.querySelector('input')!;
    input.addEventListener('input', () => this.updateValue(input.value, 'gt-input'));
    input.addEventListener('change', () => this.updateValue(input.value, 'gt-change'));
    this.root.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(button => {
      button.addEventListener('click', () => this.step(button.dataset.step === 'up' ? 1 : -1));
    });
  }

  focus(): void { this.root.querySelector('input')?.focus(); }
  select(): void { this.root.querySelector('input')?.select(); }

  private updateValue(value: string, event: 'gt-input' | 'gt-change'): void {
    this.value = value;
    this.emit<ValueChangeDetail>(event, { value });
  }

  private step(direction: 1 | -1): void {
    if (this.disabled || this.readonly) return;
    const step = Number(this.stringAttribute('step', '1')) || 1;
    let value = (Number(this.value) || 0) + direction * step;
    const min = this.getAttribute('min');
    const max = this.getAttribute('max');
    if (min !== null) value = Math.max(Number(min), value);
    if (max !== null) value = Math.min(Number(max), value);
    this.updateValue(String(value), 'gt-input');
    this.emit<ValueChangeDetail>('gt-change', { value: String(value) });
  }
}
