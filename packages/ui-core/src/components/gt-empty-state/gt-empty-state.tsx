import { Component, Element, h, Host, Prop, State } from '@stencil/core';

@Component({ tag: 'gt-empty-state', shadow: true })
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
        <style>{`:host{display:block;color:var(--gt-color-text-muted);font-family:var(--gt-font-family)}section{display:flex;align-items:center;flex-direction:column;gap:var(--gt-space-sm);padding:var(--gt-space-xl);text-align:center}:host([compact]) section{padding:var(--gt-space-md)}h3,p{margin:0}h3{color:var(--gt-color-text);font-size:var(--gt-font-size-md)}p{font-size:var(--gt-font-size-sm)}.actions{display:inline-flex;gap:var(--gt-space-sm)}`}</style>
        <section>
          <slot name="icon" />
          {this.nativeTitle ? <h3>{this.nativeTitle}</h3> : null}
          {this.description ? <p>{this.description}</p> : null}
          <div class="actions"><slot name="actions" /><slot /></div>
        </section>
      </Host>
    );
  }
}
