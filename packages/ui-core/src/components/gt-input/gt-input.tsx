import { Component, Element, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

export interface GtValueChangeDetail {
  value: string;
}

@Component({ tag: 'gt-input', shadow: true })
export class GtInput {
  @Prop({ mutable: true, reflect: true }) value = '';
  @Prop() type = 'text';
  @Prop() placeholder = '';
  @Prop({ reflect: true }) disabled = false;
  @Prop({ attribute: 'readonly', reflect: true }) readOnly = false;
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop() min?: string;
  @Prop() max?: string;
  @Prop() step = '1';

  @Event({ eventName: 'gt-input', bubbles: true, composed: true }) input!: EventEmitter<GtValueChangeDetail>;
  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtValueChangeDetail>;

  @Element() host!: HTMLElement & { select?: () => Promise<void> };
  private inputElement?: HTMLInputElement;

  componentDidLoad(): void {
    Object.assign(this.host, {
      focus: async () => {
        this.inputElement?.focus();
      },
      select: async () => {
        if (typeof this.inputElement?.select === 'function') this.inputElement.select();
      },
    });
  }

  private updateValue(value: string, event: 'input' | 'change'): void {
    this.value = value;
    (event === 'input' ? this.input : this.change).emit({ value });
  }

  private stepValue(direction: 1 | -1): void {
    if (this.disabled || this.readOnly) return;

    const step = Number(this.step) || 1;
    let value = (Number(this.value) || 0) + direction * step;
    if (this.min !== undefined) value = Math.max(Number(this.min), value);
    if (this.max !== undefined) value = Math.min(Number(this.max), value);

    const nextValue = String(value);
    this.updateValue(nextValue, 'input');
    this.updateValue(nextValue, 'change');
  }

  render() {
    const numeric = this.type === 'number';

    return (
      <Host>
        <style>{`:host{display:block;font-family:var(--gt-font-family)}.shell{display:flex;align-items:center;border:1px solid var(--gt-color-border);border-radius:var(--gt-radius-sm);background:var(--gt-color-surface)}.shell:focus-within{box-shadow:var(--gt-focus-ring)}input{width:100%;min-height:var(--gt-control-height-md);box-sizing:border-box;border:0;background:transparent;color:var(--gt-color-text);font:inherit;outline:0;padding:0 var(--gt-control-padding-x-sm)}:host([size="sm"]) input{min-height:var(--gt-control-height-sm)}:host([size="lg"]) input{min-height:var(--gt-control-height-lg)}button{width:28px;border:0;border-left:1px solid var(--gt-color-border);background:transparent;color:var(--gt-color-text);cursor:pointer}button:disabled{cursor:not-allowed;opacity:.56}`}</style>
        <div class="shell">
          <slot name="prefix" />
          <input
            ref={(element) => { this.inputElement = element; }}
            disabled={this.disabled}
            max={this.max}
            min={this.min}
            placeholder={this.placeholder}
            readOnly={this.readOnly}
            step={this.step}
            type={this.type}
            value={this.value}
            onInput={(event) => this.updateValue((event.target as HTMLInputElement).value, 'input')}
            onChange={(event) => this.updateValue((event.target as HTMLInputElement).value, 'change')}
          />
          <slot name="suffix" />
          {numeric ? <button data-step="up" disabled={this.disabled || this.readOnly} type="button" onClick={() => this.stepValue(1)}>+</button> : null}
          {numeric ? <button data-step="down" disabled={this.disabled || this.readOnly} type="button" onClick={() => this.stepValue(-1)}>-</button> : null}
        </div>
      </Host>
    );
  }
}
