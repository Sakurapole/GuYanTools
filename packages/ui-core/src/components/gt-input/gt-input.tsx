import { Component, Element, Event, h, Host, Prop, State, type EventEmitter } from '@stencil/core';

export interface GtValueChangeDetail {
  value: string;
}

@Component({ tag: 'gt-input', shadow: true, styleUrl: 'gt-input.css' })
export class GtInput {
  @Prop({ mutable: true, reflect: true }) value = '';
  @Prop() type = 'text';
  @Prop() placeholder = '';
  @Prop({ reflect: true }) disabled = false;
  @Prop({ attribute: 'readonly', reflect: true }) readOnly = false;
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop() spellcheck?: boolean | 'true' | 'false';
  @Prop() autocorrect?: string;
  @Prop() autocapitalize?: string;
  @Prop() list?: string;
  @Prop() min?: string;
  @Prop() max?: string;
  @Prop() step = '1';

  @Event({ eventName: 'gt-input', bubbles: true, composed: true }) input!: EventEmitter<GtValueChangeDetail>;
  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtValueChangeDetail>;

  @Element() host!: HTMLElement & { select?: () => Promise<void> };
  private inputElement?: HTMLInputElement;
  private prefixSlot?: HTMLSlotElement;
  private suffixSlot?: HTMLSlotElement;
  @State() private hasPrefix = false;
  @State() private hasSuffix = false;

  componentDidLoad(): void {
    this.syncSlots();
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

  private syncSlots = (): void => {
    this.hasPrefix = this.slotHasContent(this.prefixSlot);
    this.hasSuffix = this.slotHasContent(this.suffixSlot);
  };

  private slotHasContent(slot?: HTMLSlotElement): boolean {
    return Boolean(slot?.assignedNodes({ flatten: true })
      .some(node => node.nodeType !== 3 || Boolean(node.textContent?.trim())));
  }

  render() {
    const numeric = this.type === 'number';

    return (
      <Host>
        <div part="base" class="shell">
          <span part="prefix" hidden={!this.hasPrefix}>
            <slot name="prefix" ref={(element) => { this.prefixSlot = element; }} onSlotchange={this.syncSlots} />
          </span>
          <input
            part="control"
            ref={(element) => { this.inputElement = element; }}
            disabled={this.disabled}
            id={this.host.id || undefined}
            list={this.list}
            max={this.max}
            min={this.min}
            placeholder={this.placeholder}
            readOnly={this.readOnly}
            step={this.step}
            type={this.type}
            spellcheck={this.spellcheck}
            autocorrect={this.autocorrect}
            autocapitalize={this.autocapitalize}
            value={this.value}
            onInput={(event) => this.updateValue((event.target as HTMLInputElement).value, 'input')}
            onChange={(event) => this.updateValue((event.target as HTMLInputElement).value, 'change')}
          />
          <span part="suffix" hidden={!this.hasSuffix}>
            <slot name="suffix" ref={(element) => { this.suffixSlot = element; }} onSlotchange={this.syncSlots} />
          </span>
          {numeric ? (
            <div part="stepper" class="stepper">
              <button data-step="up" disabled={this.disabled || this.readOnly} type="button" onClick={() => this.stepValue(1)} aria-label="Increase value">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </button>
              <button data-step="down" disabled={this.disabled || this.readOnly} type="button" onClick={() => this.stepValue(-1)} aria-label="Decrease value">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </button>
            </div>
          ) : null}
        </div>
      </Host>
    );
  }
}
