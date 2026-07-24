import { Component, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

export interface GtTabItem {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface GtTabChangeDetail {
  value: string;
}

@Component({ tag: 'gt-tabs', shadow: true })
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
    const indicatorStyle = this.items.length > 0
      ? { transform: `translateX(${activeIndex * 100}%)`, width: `${100 / this.items.length}%` }
      : undefined;

    return (
      <Host>
        <style>{`:host{display:block;font-family:var(--gt-font-family)}[role="tablist"]{position:relative;display:flex;gap:var(--gt-space-xs);border-bottom:1px solid var(--gt-color-border)}:host([variant="segmented"]) [role="tablist"]{border-bottom:0;background:var(--gt-color-surface-muted);border-radius:var(--gt-radius-sm);padding:2px}:host([stretch]) button{flex:1}button{min-height:var(--gt-control-height-md);border:0;border-bottom:2px solid transparent;background:transparent;color:var(--gt-color-text-muted);font:inherit;cursor:pointer}button[aria-selected="true"]{color:var(--gt-color-text)}button:focus-visible{outline:none;box-shadow:var(--gt-focus-ring)}button:disabled{cursor:not-allowed;opacity:.5}.indicator{position:absolute;bottom:-1px;left:0;height:2px;background:var(--gt-color-primary);transition:transform var(--gt-motion-normal) var(--gt-motion-ease),width var(--gt-motion-normal) var(--gt-motion-ease)}:host([variant="segmented"]) .indicator{display:none}`}</style>
        <div role="tablist">
          {this.items.map((item) => <button aria-selected={String(item.value === this.value)} data-value={item.value} disabled={item.disabled} role="tab" type="button" onClick={() => this.select(item)}>{item.label}</button>)}
          <span class="indicator" style={indicatorStyle} />
        </div>
      </Host>
    );
  }
}
