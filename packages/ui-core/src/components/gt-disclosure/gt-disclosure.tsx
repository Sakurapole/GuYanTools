import { Component, Element, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

export interface GtDisclosureChangeDetail { open: boolean; }

@Component({ tag: 'gt-disclosure', shadow: true, styleUrl: 'gt-disclosure.css' })
export class GtDisclosure {
  @Prop() title = '';
  @Prop({ mutable: true, reflect: true }) open = false;
  @Element() host!: HTMLElement;

  @Event({ eventName: 'gt-open-change', bubbles: true, composed: true }) openChange!: EventEmitter<GtDisclosureChangeDetail>;

  private toggle = (event: MouseEvent): void => {
    event.preventDefault();
    this.open = !this.open;
    this.openChange.emit({ open: this.open });
  };

  render() {
    return (
      <Host>
        <details part="base" open={this.open}>
          <summary part="summary" aria-expanded={String(this.open)} onClick={this.toggle}>{this.title}</summary>
          <div part="body" hidden={!this.open}><slot /></div>
        </details>
      </Host>
    );
  }
}
