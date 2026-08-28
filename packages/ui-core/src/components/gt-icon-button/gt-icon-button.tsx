import { Component, Element, Event, h, Host, Prop, State, type EventEmitter } from '@stencil/core';

export interface GtIconButtonClickDetail {
  disabled: boolean;
}

@Component({ tag: 'gt-icon-button', shadow: true, styleUrl: 'gt-icon-button.css' })
export class GtIconButton {
  @Prop({ reflect: true }) variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'ghost';
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) shape: 'square' | 'circle' = 'square';
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) active = false;
  @Prop({ reflect: true }) label = '';
  @Prop({ attribute: 'aria-label' }) ariaLabel = '';
  @Prop() type: 'button' | 'submit' | 'reset' = 'button';
  @Element() host!: HTMLElement;
  @State() private nativeTitle = '';
  @State() private hasIcon = false;

  private titleObserver?: MutationObserver;
  private iconSlot?: HTMLSlotElement;

  componentWillLoad(): void {
    this.nativeTitle = this.host.title;
  }

  componentDidLoad(): void {
    this.syncIconSlot();
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

  private syncIconSlot = (): void => {
    this.hasIcon = Boolean(this.iconSlot?.assignedNodes({ flatten: true }).length);
  };

  render() {
    const accessibleLabel = this.ariaLabel || this.label || this.nativeTitle;

    return (
      <Host>
        <button part="base" aria-label={accessibleLabel} disabled={this.disabled} title={this.nativeTitle} type={this.type} onClick={this.handleClick}>
          <span part="icon" class="icon" hidden={!this.hasIcon}><slot ref={(element) => { this.iconSlot = element; }} onSlotchange={this.syncIconSlot} /></span>
          {this.label ? <span part="label">{this.label}</span> : null}
        </button>
      </Host>
    );
  }
}
