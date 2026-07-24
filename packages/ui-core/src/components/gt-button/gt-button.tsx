import { Component, Event, h, Prop, type EventEmitter } from '@stencil/core';

export interface GtButtonClickDetail {
  disabled: boolean;
}

@Component({
  tag: 'gt-button',
  shadow: true,
})
export class GtButton {
  @Prop({ reflect: true }) variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary';
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) active = false;
  @Prop({ reflect: true }) block = false;
  @Prop() type: 'button' | 'submit' | 'reset' = 'button';

  @Event({ eventName: 'gt-click', bubbles: true, composed: true }) click!: EventEmitter<GtButtonClickDetail>;

  private handleClick = (): void => {
    this.click.emit({ disabled: this.disabled });
  };

  render() {
    return (
      <button disabled={this.disabled} type={this.type} onClick={this.handleClick}>
        <slot name="prefix" />
        <span class="label"><slot /></span>
        <slot name="suffix" />
      </button>
    );
  }
}
