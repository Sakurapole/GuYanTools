import { Component, Event, h, Host, Prop, State, type EventEmitter } from '@stencil/core';

export interface GtButtonClickDetail {
  disabled: boolean;
}

@Component({
  tag: 'gt-button',
  shadow: true,
  styleUrl: 'gt-button.css',
})
export class GtButton {
  @Prop({ reflect: true }) variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary';
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) active = false;
  @Prop({ reflect: true }) block = false;
  @Prop({ reflect: true }) type: 'button' | 'submit' | 'reset' = 'button';
  @State() private hasPrefix = false;
  @State() private hasSuffix = false;

  @Event({ eventName: 'gt-click', bubbles: true, composed: true }) click!: EventEmitter<GtButtonClickDetail>;

  private prefixSlot?: HTMLSlotElement;
  private suffixSlot?: HTMLSlotElement;

  componentDidLoad(): void {
    this.syncSlots();
  }

  private syncSlots = (): void => {
    this.hasPrefix = Boolean(this.prefixSlot?.assignedElements().length);
    this.hasSuffix = Boolean(this.suffixSlot?.assignedElements().length);
  };

  private handleClick = (): void => {
    this.click.emit({ disabled: this.disabled });
  };

  render() {
    return (
      <Host>
        <button part="base" disabled={this.disabled} type={this.type} onClick={this.handleClick}>
          <span part="icon" class="prefix" hidden={!this.hasPrefix}><slot name="prefix" ref={(element) => { this.prefixSlot = element; }} onSlotchange={this.syncSlots} /></span>
          <span part="label" class="label"><slot /></span>
          <span part="icon" class="suffix" hidden={!this.hasSuffix}><slot name="suffix" ref={(element) => { this.suffixSlot = element; }} onSlotchange={this.syncSlots} /></span>
        </button>
      </Host>
    );
  }
}
