import { Component, Element, h, Host, Prop, State } from '@stencil/core';

@Component({ tag: 'gt-state-card', shadow: true })
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
        <style>{`:host{display:block;color:var(--gt-color-text);font-family:var(--gt-font-family)}article{display:flex;flex-direction:column;align-items:center;gap:var(--gt-space-sm);padding:var(--gt-space-xl);border:1px solid var(--gt-color-border);border-radius:var(--gt-radius-md);background:var(--gt-color-surface);text-align:center}:host([compact]) article{padding:var(--gt-space-lg)}.eyebrow,p{margin:0;color:var(--gt-color-text-muted);font-size:var(--gt-font-size-sm)}strong{color:var(--gt-color-text)}:host([state="error"]) strong{color:var(--gt-color-danger)}.actions{display:flex;gap:var(--gt-space-sm)}`}</style>
        <article aria-live="polite" role="status">
          <slot name="icon" />
          <span class="eyebrow">{label}</span>
          {this.nativeTitle ? <strong>{this.nativeTitle}</strong> : null}
          {this.description ? <p>{this.description}</p> : null}
          <div class="actions"><slot name="actions" /></div>
        </article>
      </Host>
    );
  }
}
