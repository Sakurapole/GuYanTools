import { Component, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

@Component({ tag: 'gt-range', shadow: true, styleUrl: 'gt-range.css' })
export class GtRange {
  @Prop({ mutable: true, reflect: true }) value = 0;
  @Prop({ reflect: true }) min = 0;
  @Prop({ reflect: true }) max = 100;
  @Prop({ reflect: true }) step = 1;
  @Prop({ reflect: true }) disabled = false;
  @Prop({ attribute: 'aria-label' }) ariaLabel = '';

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<{ value: number }>;

  private clamp(value: number): number {
    const min = Number(this.min);
    const max = Number(this.max);
    const step = Number(this.step) || 1;
    const clamped = Math.min(max, Math.max(min, value));
    return Math.round((clamped - min) / step) * step + min;
  }

  private handleInput = (event: Event): void => {
    const value = this.clamp(Number((event.target as HTMLInputElement).value));
    this.value = value;
    this.change.emit({ value });
  };

  render() {
    const range = Number(this.max) - Number(this.min);
    const progress = range > 0 ? ((Number(this.value) - Number(this.min)) / range) * 100 : 0;
    return <Host style={{ '--gt-range-progress': `${Math.max(0, Math.min(100, progress))}%` }}>
      <div part="base" class="base">
        <div part="track" class="track"><div part="fill" class="fill" /></div>
        <input part="input" type="range" value={String(this.value)} min={String(this.min)} max={String(this.max)} step={String(this.step)} disabled={this.disabled} aria-label={this.ariaLabel || undefined} onInput={this.handleInput} />
        <span part="thumb" class="thumb" aria-hidden="true" />
      </div>
    </Host>;
  }
}
