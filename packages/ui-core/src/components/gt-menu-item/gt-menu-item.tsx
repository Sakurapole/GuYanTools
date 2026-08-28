import { Component, Element, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

export interface GtMenuItemClickDetail { disabled: boolean; }

@Component({ tag: 'gt-menu-item', shadow: true, styleUrl: 'gt-menu-item.css' })
export class GtMenuItem {
  @Prop({ reflect: true }) danger = false;
  @Prop({ reflect: true }) disabled = false;
  @Element() host!: HTMLElement;

  @Event({ eventName: 'gt-click', bubbles: true, composed: true }) clickEvent!: EventEmitter<GtMenuItemClickDetail>;

  private handleClick = (event: MouseEvent): void => {
    if (this.disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.clickEvent.emit({ disabled: false });
  };

  render() {
    return (
      <Host role="none">
        <button part="base" type="button" role="menuitem" disabled={this.disabled} aria-disabled={String(this.disabled)} onClick={this.handleClick}>
          <span part="icon" hidden={!this.hasSlot('icon')}><slot name="icon" /></span>
          <span part="label"><slot /></span>
          <span part="suffix" hidden={!this.hasSlot('suffix')}><slot name="suffix" /></span>
        </button>
      </Host>
    );
  }

  private hasSlot(name: string): boolean {
    return this.host?.querySelector(`[slot="${name}"]`) !== null;
  }

}
