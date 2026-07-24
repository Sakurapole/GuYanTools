import { Component, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

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

  @Event({ eventName: 'gt-click', bubbles: true, composed: true }) click!: EventEmitter<GtButtonClickDetail>;

  private handleClick = (): void => {
    this.click.emit({ disabled: this.disabled });
  };

  render() {
    return (
      <Host>
        <button part="base" disabled={this.disabled} type={this.type} onClick={this.handleClick}>
          <span part="icon"><slot name="prefix" /></span>
          <span part="label" class="label"><slot /></span>
          <span part="icon"><slot name="suffix" /></span>
        </button>
      </Host>
    );
  }
}
