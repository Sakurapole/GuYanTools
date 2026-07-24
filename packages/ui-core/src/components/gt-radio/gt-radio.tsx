import { Component, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

export interface GtRadioChangeDetail {
  checked: boolean;
}

@Component({ tag: 'gt-radio', shadow: true, styleUrl: 'gt-radio.css' })
export class GtRadio {
  @Prop({ mutable: true, reflect: true }) checked = false;
  @Prop({ reflect: true }) disabled = false;
  @Prop() label = '';
  @Prop() name = '';
  @Prop() value = '';

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtRadioChangeDetail>;

  private handleChange = (event: Event): void => {
    this.checked = (event.target as HTMLInputElement).checked;
    this.change.emit({ checked: this.checked });
  };

  render() {
    return (
      <Host>
        <label part="base">
          <input part="control" checked={this.checked} disabled={this.disabled} name={this.name} type="radio" value={this.value} onChange={this.handleChange} />
          <span part="label"><slot>{this.label}</slot></span>
        </label>
      </Host>
    );
  }
}
