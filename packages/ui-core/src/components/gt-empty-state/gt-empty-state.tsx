import { Component, Element, h, Host, Prop, State } from '@stencil/core';

@Component({ tag: 'gt-empty-state', shadow: true, styleUrl: 'gt-empty-state.css' })
export class GtEmptyState {
  @Prop() description = '';
  @Prop({ reflect: true }) compact = false;
  @Element() host!: HTMLElement;
  @State() private nativeTitle = '';
  @State() private hasIcon = false;
  @State() private hasActions = false;

  private titleObserver?: MutationObserver;
  private iconSlot?: HTMLSlotElement;
  private namedActionsSlot?: HTMLSlotElement;
  private defaultActionsSlot?: HTMLSlotElement;

  componentWillLoad(): void {
    this.nativeTitle = this.host.title;
  }

  componentDidLoad(): void {
    this.syncSlots();
    if (typeof MutationObserver === 'undefined') return;
    this.titleObserver = new MutationObserver(() => {
      this.nativeTitle = this.host.title;
    });
    this.titleObserver.observe(this.host, { attributes: true, attributeFilter: ['title'] });
  }

  disconnectedCallback(): void {
    this.titleObserver?.disconnect();
  }

  private syncSlots = (): void => {
    const hasContent = (slot?: HTMLSlotElement): boolean => Boolean(slot?.assignedNodes({ flatten: true })
      .some(node => node.nodeType !== 3 || Boolean(node.textContent?.trim())));

    this.hasIcon = hasContent(this.iconSlot);
    this.hasActions = hasContent(this.namedActionsSlot) || hasContent(this.defaultActionsSlot);
  };

  render() {
    return (
      <Host>
        <section part="base">
          <span part="icon" hidden={!this.hasIcon}><slot name="icon" ref={(element) => { this.iconSlot = element; }} onSlotchange={this.syncSlots} /></span>
          {this.nativeTitle ? <h3 part="title">{this.nativeTitle}</h3> : null}
          {this.description ? <p part="description">{this.description}</p> : null}
          <div part="actions" class="actions" hidden={!this.hasActions}><slot name="actions" ref={(element) => { this.namedActionsSlot = element; }} onSlotchange={this.syncSlots} /><slot ref={(element) => { this.defaultActionsSlot = element; }} onSlotchange={this.syncSlots} /></div>
        </section>
      </Host>
    );
  }
}
