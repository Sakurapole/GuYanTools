import { Component, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

export interface GtSwitchChangeDetail {
  checked: boolean;
}

@Component({ tag: 'gt-switch', shadow: true, styleUrl: 'gt-switch.css' })
export class GtSwitch {
  @Prop({ mutable: true, reflect: true }) checked = false;
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) size: 'sm' | 'md' = 'md';
  @Prop({ attribute: 'aria-label' }) ariaLabel = '';

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtSwitchChangeDetail>;

  private toggle = (): void => {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.change.emit({ checked: this.checked });
  };

  render() {
    return (
      <Host>
        <button part="base" aria-checked={String(this.checked)} aria-label={this.ariaLabel} disabled={this.disabled} role="switch" type="button" onClick={this.toggle}><span part="control" /></button>
      </Host>
    );
  }
}
