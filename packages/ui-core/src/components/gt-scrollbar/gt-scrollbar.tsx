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
  @Prop({ attribute: 'smooth-wheel', reflect: true }) smoothWheel = false;
  @Prop({ reflect: true }) size = 0;
  @Event({ eventName: 'gt-scroll', bubbles: true, composed: true }) scroll!: EventEmitter<Event>;
  private resizeObserver?: ResizeObserver;
  private hideTimer?: number;
  private wheelFrame?: number;
  private wheelTarget = 0;

  connectedCallback(): void {
    this.observeSize();
    queueMicrotask(() => {
      if (this.host.isConnected) this.updateRails();
    });
  }

  componentDidLoad(): void {
    this.observeSize();
    this.updateRails();
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    if (this.hideTimer !== undefined) window.clearTimeout(this.hideTimer);
    if (this.wheelFrame !== undefined) {
      cancelAnimationFrame(this.wheelFrame);
      this.wheelFrame = undefined;
    }
  }

  private observeSize(): void {
    if (this.resizeObserver || typeof ResizeObserver === 'undefined') return;
    const viewport = this.viewport();
    if (!viewport) return;
    this.resizeObserver = new ResizeObserver(() => this.updateRails());
    this.resizeObserver.observe(viewport);
    const content = this.host.shadowRoot?.querySelector('[part="content"]');
    if (content) this.resizeObserver.observe(content);
  }

  @Method() async refresh(): Promise<void> {
    this.updateRails();
  }
  @Method() async updateScrollableState(): Promise<void> {
    this.updateRails();
  }
  @Method() async scrollByPosition(options: ScrollToOptions): Promise<void> {
    this.viewport()?.scrollBy(options);
  }
  @Method() async scrollToPosition(options: ScrollToOptions): Promise<void> {
    this.viewport()?.scrollTo(options);
  }

  private viewport(): HTMLElement | undefined {
    return this.host.shadowRoot?.querySelector('[part="viewport"]') as HTMLElement | undefined;
  }
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
        const ratio = Math.max(
          0.01,
          Math.min(1, viewport.clientWidth / Math.max(viewport.scrollWidth, 1))
        );
        thumb.style.width = `${Math.max(12, ratio * 100)}%`;
        const track = Math.max(0, railX.clientWidth - thumb.offsetWidth);
        thumb.style.transform = `translateX(${track * (viewport.scrollLeft / Math.max(1, viewport.scrollWidth - viewport.clientWidth))}px)`;
      }
    }
    if (railY) {
      yOverflow ? railY.removeAttribute('hidden') : railY.setAttribute('hidden', '');
      const thumb = railY.querySelector<HTMLElement>('[part="thumb-y"]');
      if (thumb) {
        const ratio = Math.max(
          0.01,
          Math.min(1, viewport.clientHeight / Math.max(viewport.scrollHeight, 1))
        );
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
    }, 500);
    this.scroll.emit(event);
  };

  private handleWheel = (event: WheelEvent): void => {
    if (
      !this.smoothWheel ||
      !this.y ||
      event.ctrlKey ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
    )
      return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const viewport = this.viewport();
    if (!viewport) return;
    for (const node of event.composedPath()) {
      if (node === viewport) break;
      if (!(node instanceof HTMLElement)) continue;
      const overflow = getComputedStyle(node).overflowY;
      if (!['auto', 'scroll'].includes(overflow) || node.scrollHeight <= node.clientHeight + 1)
        continue;
      const canScroll =
        event.deltaY > 0
          ? node.scrollTop < node.scrollHeight - node.clientHeight - 1
          : node.scrollTop > 1;
      if (canScroll) return;
    }

    const delta =
      event.deltaY *
      (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    const target = Math.max(
      0,
      Math.min(
        maxScroll,
        (this.wheelFrame === undefined ? viewport.scrollTop : this.wheelTarget) + delta
      )
    );
    if (target === viewport.scrollTop && this.wheelFrame === undefined) return;
    event.preventDefault();
    if (this.wheelFrame !== undefined) cancelAnimationFrame(this.wheelFrame);

    const from = viewport.scrollTop;
    const start = performance.now();
    this.wheelTarget = target;
    const step = (now: number): void => {
      const progress = Math.min(1, (now - start) / 180);
      viewport.scrollTop = from + (target - from) * (1 - (1 - progress) ** 3);
      if (progress < 1) this.wheelFrame = requestAnimationFrame(step);
      else this.wheelFrame = undefined;
    };
    this.wheelFrame = requestAnimationFrame(step);
  };

  render() {
    const style: Record<string, string> = {};
    if (this.size > 0) style['--gt-scrollbar-size'] = `${this.size}px`;
    if (this.thumbColor) style['--gt-scrollbar-thumb'] = this.thumbColor;
    if (this.thumbHoverColor) style['--gt-scrollbar-thumb-hover'] = this.thumbHoverColor;
    if (this.trackColor) style['--gt-scrollbar-track'] = this.trackColor;
    return (
      <Host style={style}>
        <div
          part="viewport"
          class={{ viewport: true, 'axis-x': this.x, 'axis-y': this.y }}
          onScroll={this.handleScroll}
          onWheel={this.handleWheel}
        >
          <div part="content">
            <slot />
          </div>
        </div>
        {this.x && (
          <div part="rail-x" class="rail rail-x">
            <span part="thumb-x" class="thumb" />
          </div>
        )}
        {this.y && (
          <div part="rail-y" class="rail rail-y">
            <span part="thumb-y" class="thumb" />
          </div>
        )}
      </Host>
    );
  }
}
