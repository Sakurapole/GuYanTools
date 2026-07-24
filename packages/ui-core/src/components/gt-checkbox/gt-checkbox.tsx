import { Component, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

export interface GtCheckedChangeDetail {
  checked: boolean;
  indeterminate?: boolean;
}

@Component({ tag: 'gt-checkbox', shadow: true, styleUrl: 'gt-checkbox.css' })
export class GtCheckbox {
  @Prop({ mutable: true, reflect: true }) checked = false;
  @Prop({ mutable: true, reflect: true }) indeterminate = false;
  @Prop({ reflect: true }) disabled = false;
  @Prop() label = '';
  @Prop() name = '';
  @Prop() value = '';

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtCheckedChangeDetail>;

  private checkbox?: HTMLInputElement;

  componentDidRender(): void {
    if (this.checkbox) this.checkbox.indeterminate = this.indeterminate;
  }

  private handleChange = (event: Event): void => {
    this.checked = (event.target as HTMLInputElement).checked;
    this.indeterminate = false;
    this.change.emit({ checked: this.checked, indeterminate: false });
  };

  render() {
    return (
      <Host>
        <label part="base">
          <input part="control" ref={(element) => { this.checkbox = element; }} checked={this.checked} disabled={this.disabled} name={this.name} type="checkbox" value={this.value} onChange={this.handleChange} />
          <span part="label"><slot>{this.label}</slot></span>
        </label>
      </Host>
    );
  }
}
