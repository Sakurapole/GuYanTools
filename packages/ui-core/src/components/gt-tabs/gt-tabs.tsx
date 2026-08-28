import { Component, Element, Event, h, Host, Prop, State, type EventEmitter } from '@stencil/core';

export interface GtTabItem {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface GtTabChangeDetail {
  value: string;
}

@Component({ tag: 'gt-tabs', shadow: true, styleUrl: 'gt-tabs.css' })
export class GtTabs {
  @Prop({ mutable: true, reflect: true }) value = '';
  @Prop({ mutable: true }) items: GtTabItem[] = [];
  @Prop({ reflect: true }) variant: 'line' | 'segmented' = 'line';
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) stretch = false;

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtTabChangeDetail>;

  @Element() host!: HTMLElement;
  @State() private indicatorStyle = 'opacity: 0;';
  private resizeObserver?: ResizeObserver;

  componentDidLoad(): void {
    this.updateIndicator();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.updateIndicator);
      this.resizeObserver.observe(this.host);
    }
    window.addEventListener('resize', this.updateIndicator);
  }

  componentDidRender(): void {
    this.updateIndicator();
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.updateIndicator);
  }

  private updateIndicator = (): void => {
    const root = this.host.shadowRoot?.querySelector<HTMLElement>('[role="tablist"]');
    const activeTab = root?.querySelector<HTMLElement>('button[aria-selected="true"]');
    if (!root || !activeTab) {
      if (this.indicatorStyle !== 'opacity: 0;') this.indicatorStyle = 'opacity: 0;';
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const activeRect = activeTab.getBoundingClientRect();
    const nextStyle = `opacity: 1; width: ${activeRect.width}px; transform: translate3d(${activeRect.left - rootRect.left}px, 0, 0);`;
    if (this.indicatorStyle !== nextStyle) this.indicatorStyle = nextStyle;
  };

  private select(item: GtTabItem): void {
    if (item.disabled || item.value === this.value) return;
    this.value = item.value;
    this.change.emit({ value: item.value });
  }

  render() {
    return (
      <Host>
        <div part="base" role="tablist">
          {this.items.map((item) => <button part="tab" aria-selected={String(item.value === this.value)} data-value={item.value} disabled={item.disabled} role="tab" type="button" onClick={() => this.select(item)}>{item.label}</button>)}
          <span part="indicator" class="indicator" style={{ cssText: this.indicatorStyle }} />
        </div>
      </Host>
    );
  }
}
