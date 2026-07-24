import { Component, h, Host, Prop } from '@stencil/core';

@Component({ tag: 'gt-card', shadow: true })
export class GtCard {
  @Prop({ reflect: true }) variant: 'default' | 'muted' | 'elevated' = 'default';
  @Prop({ reflect: true }) padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) radius: 'none' | 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) hoverable = false;
  @Prop({ reflect: true }) interactive = false;

  render() {
    return (
      <Host>
        <style>{`:host{display:block;color:var(--gt-color-text);font-family:var(--gt-font-family)}article{border:1px solid var(--gt-color-border);border-radius:var(--gt-radius-md);background:var(--gt-color-surface);box-shadow:var(--gt-shadow-sm);overflow:hidden}:host([variant="elevated"]) article{box-shadow:var(--gt-shadow-md)}:host([variant="muted"]) article{background:var(--gt-color-surface-muted)}:host([hoverable]) article,:host([interactive]) article{transition:transform var(--gt-motion-normal) var(--gt-motion-ease),box-shadow var(--gt-motion-normal) var(--gt-motion-ease)}:host([hoverable]) article:hover,:host([interactive]) article:hover{transform:translateY(-1px);box-shadow:var(--gt-shadow-md)}.section{padding:var(--gt-space-lg)}:host([padding="none"]) .section{padding:0}:host([padding="sm"]) .section{padding:var(--gt-space-sm)}:host([padding="md"]) .section{padding:var(--gt-space-lg)}:host([padding="lg"]) .section{padding:var(--gt-space-xl)}header,footer{border-color:var(--gt-color-border);border-style:solid;border-width:0}header:not(:empty){border-bottom-width:1px}footer:not(:empty){border-top-width:1px}`}</style>
        <article data-variant={this.variant}>
          <header class="section"><slot name="header" /></header>
          <div class="section"><slot /></div>
          <footer class="section"><slot name="footer" /></footer>
        </article>
      </Host>
    );
  }
}
