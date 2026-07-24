import { Component, h, Host, Prop } from '@stencil/core';

@Component({ tag: 'gt-card', shadow: true, styleUrl: 'gt-card.css' })
export class GtCard {
  @Prop({ reflect: true }) variant: 'default' | 'muted' | 'elevated' = 'default';
  @Prop({ reflect: true }) padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) radius: 'none' | 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) hoverable = false;
  @Prop({ reflect: true }) interactive = false;

  render() {
    return (
      <Host>
        <article part="base" data-variant={this.variant}>
          <header part="header" class="section"><slot name="header" /></header>
          <div part="body" class="section"><slot /></div>
          <footer part="footer" class="section"><slot name="footer" /></footer>
        </article>
      </Host>
    );
  }
}
