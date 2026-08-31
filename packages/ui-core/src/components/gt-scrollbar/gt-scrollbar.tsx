import { Component, Element, Event, h, Host, Method, Prop, type EventEmitter } from '@stencil/core';

@Component({ tag: 'gt-scrollbar', shadow: true, styleUrl: 'gt-scrollbar.css' })
export class GtScrollbar {
  @Element() host!: HTMLElement;
  @Prop({ reflect: true }) x = true;
  @Prop({ reflect: true }) y = true;
  @Prop({ attribute: 'show-on-hover', reflect: true }) showOnHover = true;
  @Prop({ attribute: 'thumb-color' }) thumbColor = '';
  @Prop({ attribute: 'thumb-hover-color' }) thumbHoverColor = '';
  @Prop({ attribute: 'track-color' }) trackColor = '';
  @Prop({ attribute: 'always-visible', reflect: true }) alwaysVisible = false;
  @Prop({ reflect: true }) size = 0;
  @Event({ eventName: 'gt-scroll', bubbles: true, composed: true }) scroll!: EventEmitter<Event>;
  private resizeObserver?: ResizeObserver;
  private hideTimer?: number;

  componentDidLoad(): void {
    const viewport = this.viewport();
    if (viewport && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.updateRails());
      this.resizeObserver.observe(viewport);
      const content = this.host.shadowRoot?.querySelector('[part="content"]');
      if (content) this.resizeObserver.observe(content);
    }
    this.updateRails();
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    if (this.hideTimer !== undefined) window.clearTimeout(this.hideTimer);
  }

  @Method() async refresh(): Promise<void> { this.updateRails(); }
  @Method() async updateScrollableState(): Promise<void> { this.updateRails(); }
  @Method() async scrollByPosition(options: ScrollToOptions): Promise<void> { this.viewport()?.scrollBy(options); }
  @Method() async scrollToPosition(options: ScrollToOptions): Promise<void> { this.viewport()?.scrollTo(options); }

  private viewport(): HTMLElement | undefined { return this.host.shadowRoot?.querySelector('[part="viewport"]') as HTMLElement | undefined; }
  private updateRails(): void {
    const viewport = this.viewport();
    if (!viewport) return;
    const railX = this.host.shadowRoot?.querySelector<HTMLElement>('[part="rail-x"]');
    const railY = this.host.shadowRoot?.querySelector<HTMLElement>('[part="rail-y"]');
    const xOverflow = viewport.scrollWidth > viewport.clientWidth + 1;
    const yOverflow = viewport.scrollHeight > viewport.clientHeight + 1;
    if (railX) {
      xOverflow ? railX.removeAttribute('hidden') : railX.setAttribute('hidden', '');
      const thumb = railX.querySelector<HTMLElement>('[part="thumb-x"]');
      if (thumb) {
        const ratio = Math.max(0.01, Math.min(1, viewport.clientWidth / Math.max(viewport.scrollWidth, 1)));
        thumb.style.width = `${Math.max(12, ratio * 100)}%`;
        const track = Math.max(0, railX.clientWidth - thumb.offsetWidth);
        thumb.style.transform = `translateX(${track * (viewport.scrollLeft / Math.max(1, viewport.scrollWidth - viewport.clientWidth))}px)`;
      }
    }
    if (railY) {
      yOverflow ? railY.removeAttribute('hidden') : railY.setAttribute('hidden', '');
      const thumb = railY.querySelector<HTMLElement>('[part="thumb-y"]');
      if (thumb) {
        const ratio = Math.max(0.01, Math.min(1, viewport.clientHeight / Math.max(viewport.scrollHeight, 1)));
        thumb.style.height = `${Math.max(12, ratio * 100)}%`;
        const track = Math.max(0, railY.clientHeight - thumb.offsetHeight);
        thumb.style.transform = `translateY(${track * (viewport.scrollTop / Math.max(1, viewport.scrollHeight - viewport.clientHeight))}px)`;
      }
    }
  }

  private handleScroll = (event: Event): void => {
    this.updateRails();
    this.host.classList.add('is-scrolling');
    if (this.hideTimer !== undefined) window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.host.classList.remove('is-scrolling');
      this.hideTimer = undefined;
    }, 700);
    this.scroll.emit(event);
  };

  render() {
    const style = {
      '--gt-scrollbar-size': this.size > 0 ? `${this.size}px` : undefined,
      '--gt-scrollbar-thumb': this.thumbColor || undefined,
      '--gt-scrollbar-thumb-hover': this.thumbHoverColor || undefined,
      '--gt-scrollbar-track': this.trackColor || undefined,
    };
    return <Host style={style}>
      <div part="viewport" class={{ viewport: true, 'axis-x': this.x, 'axis-y': this.y }} onScroll={this.handleScroll}><div part="content"><slot /></div></div>
      {this.x && <div part="rail-x" class="rail rail-x"><span part="thumb-x" class="thumb" /></div>}
      {this.y && <div part="rail-y" class="rail rail-y"><span part="thumb-y" class="thumb" /></div>}
    </Host>;
  }
}
