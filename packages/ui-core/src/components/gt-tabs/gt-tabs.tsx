import { Component, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

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

  private select(item: GtTabItem): void {
    if (item.disabled || item.value === this.value) return;
    this.value = item.value;
    this.change.emit({ value: item.value });
  }

  render() {
    const activeIndex = Math.max(0, this.items.findIndex((item) => item.value === this.value));
    const indicatorStyle = {
      '--gt-tabs-active-index': String(activeIndex),
      '--gt-tabs-item-count': String(Math.max(this.items.length, 1)),
    };

    return (
      <Host>
        <div part="base" role="tablist" style={indicatorStyle}>
          {this.items.map((item) => <button part="tab" aria-selected={String(item.value === this.value)} data-value={item.value} disabled={item.disabled} role="tab" type="button" onClick={() => this.select(item)}>{item.label}</button>)}
          <span part="indicator" class="indicator" />
        </div>
      </Host>
    );
  }
}
