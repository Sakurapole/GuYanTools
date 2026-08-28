import { Component, h, Host, Prop, State } from '@stencil/core';

@Component({ tag: 'gt-card', shadow: true, styleUrl: 'gt-card.css' })
export class GtCard {
  @Prop({ reflect: true }) variant: 'default' | 'muted' | 'elevated' = 'default';
  @Prop({ reflect: true }) padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) radius: 'none' | 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) hoverable = false;
  @Prop({ reflect: true }) interactive = false;
  @Prop({ reflect: true }) bordered = true;
  @State() private hasHeader = false;
  @State() private hasFooter = false;

  private headerSlot?: HTMLSlotElement;
  private footerSlot?: HTMLSlotElement;

  componentDidLoad(): void {
    this.syncSlots();
  }

  private syncSlots = (): void => {
    this.hasHeader = Boolean(this.headerSlot?.assignedElements().length);
    this.hasFooter = Boolean(this.footerSlot?.assignedElements().length);
  };

  render() {
    return (
      <Host>
        <article part="base" data-variant={this.variant}>
          <header part="header" class="section" hidden={!this.hasHeader}><slot name="header" ref={(element) => { this.headerSlot = element; }} onSlotchange={this.syncSlots} /></header>
          <div part="body" class="section"><slot /></div>
          <footer part="footer" class="section" hidden={!this.hasFooter}><slot name="footer" ref={(element) => { this.footerSlot = element; }} onSlotchange={this.syncSlots} /></footer>
        </article>
      </Host>
    );
  }
}
