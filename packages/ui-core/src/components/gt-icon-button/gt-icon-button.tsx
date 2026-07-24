import { Component, Element, Event, h, Host, Prop, State, type EventEmitter } from '@stencil/core';

export interface GtIconButtonClickDetail {
  disabled: boolean;
}

@Component({ tag: 'gt-icon-button', shadow: true })
export class GtIconButton {
  @Prop({ reflect: true }) variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'ghost';
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) shape: 'square' | 'circle' = 'square';
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) active = false;
  @Prop() label = '';
  @Prop({ attribute: 'aria-label' }) ariaLabel = '';
  @Prop() type: 'button' | 'submit' | 'reset' = 'button';
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

  @Event({ eventName: 'gt-click', bubbles: true, composed: true }) click!: EventEmitter<GtIconButtonClickDetail>;

  private handleClick = (): void => {
    this.click.emit({ disabled: this.disabled });
  };

  render() {
    const accessibleLabel = this.ariaLabel || this.label || this.nativeTitle;

    return (
      <Host>
        <style>{`:host{display:inline-block;font-family:var(--gt-font-family)}button{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:var(--gt-control-height-md);height:var(--gt-control-height-md);padding:0;border:1px solid transparent;border-radius:var(--gt-radius-sm);background:transparent;color:var(--gt-color-text);cursor:pointer}:host([size="sm"]) button{width:var(--gt-control-height-sm);height:var(--gt-control-height-sm)}:host([size="lg"]) button{width:var(--gt-control-height-lg);height:var(--gt-control-height-lg)}:host([shape="circle"]) button{border-radius:999px}:host([label]) button{width:auto;padding-inline:var(--gt-control-padding-x-sm)}:host([variant="secondary"]) button{background:var(--gt-color-surface-muted);border-color:var(--gt-color-border)}:host([variant="primary"]) button{background:var(--gt-color-primary);color:var(--gt-color-text-inverse)}:host([variant="danger"]) button{color:var(--gt-color-danger)}button:hover:not(:disabled),:host([active]) button{background:var(--gt-color-overlay)}button:focus-visible{outline:none;box-shadow:var(--gt-focus-ring)}button:disabled{cursor:not-allowed;opacity:.56}`}</style>
        <button aria-label={accessibleLabel} disabled={this.disabled} title={this.nativeTitle} type={this.type} onClick={this.handleClick}>
          <slot />
          {this.label ? <span>{this.label}</span> : null}
        </button>
      </Host>
    );
  }
}
