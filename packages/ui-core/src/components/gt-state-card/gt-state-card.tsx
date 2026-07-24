import { Component, Element, h, Host, Prop, State } from '@stencil/core';

@Component({ tag: 'gt-state-card', shadow: true, styleUrl: 'gt-state-card.css' })
export class GtStateCard {
  @Prop({ reflect: true }) state: 'loading' | 'empty' | 'error' | 'info' = 'info';
  @Prop() description = '';
  @Prop({ reflect: true }) compact = false;
  @Element() host!: HTMLElement;
  @State() private nativeTitle = '';

  private titleObserver?: MutationObserver;

  componentWillLoad(): void {
    this.nativeTitle = this.host.title;
  }

  componentDidLoad(): void {
    if (typeof MutationObserver === 'undefined') return;
    this.titleObserver = new MutationObserver(() => {
      this.nativeTitle = this.host.title;
    });
    this.titleObserver.observe(this.host, { attributes: true, attributeFilter: ['title'] });
  }

  disconnectedCallback(): void {
    this.titleObserver?.disconnect();
  }

  render() {
    const label = `${this.state.slice(0, 1).toUpperCase()}${this.state.slice(1)}`;

    return (
      <Host>
        <article part="base" aria-live="polite" role="status">
          <span part="icon"><slot name="icon" /></span>
          <span part="label" class="eyebrow">{label}</span>
          {this.nativeTitle ? <strong part="title">{this.nativeTitle}</strong> : null}
          {this.description ? <p part="description">{this.description}</p> : null}
          <div part="actions" class="actions"><slot name="actions" /></div>
        </article>
      </Host>
    );
  }
}
