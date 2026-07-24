import { Component, Element, h, Host, Prop, State } from '@stencil/core';

@Component({ tag: 'gt-empty-state', shadow: true, styleUrl: 'gt-empty-state.css' })
export class GtEmptyState {
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
    return (
      <Host>
        <section part="base">
          <span part="icon"><slot name="icon" /></span>
          {this.nativeTitle ? <h3 part="title">{this.nativeTitle}</h3> : null}
          {this.description ? <p part="description">{this.description}</p> : null}
          <div part="actions" class="actions"><slot name="actions" /><slot /></div>
        </section>
      </Host>
    );
  }
}
