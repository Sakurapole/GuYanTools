import { Component, Element, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';
import '../gt-range/gt-range';

export interface GtSliderFieldChangeDetail {
  value: number;
}

@Component({ tag: 'gt-slider-field', shadow: true, styleUrl: 'gt-slider-field.css' })
export class GtSliderField {
  @Element() host!: HTMLElement;
  @Prop({ mutable: true, reflect: true }) value = 0;
  @Prop({ reflect: true }) min = 0;
  @Prop({ reflect: true }) max = 100;
  @Prop({ reflect: true }) step = 1;
  @Prop({ reflect: true }) disabled = false;
  @Prop() label = '';
  @Prop({ attribute: 'aria-label' }) ariaLabel = '';
  @Prop({ attribute: 'value-text' }) valueText = '';
  @Prop() unit = '';

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtSliderFieldChangeDetail>;

  componentDidLoad(): void {
    this.host.shadowRoot?.querySelector('gt-range')?.addEventListener('gt-change', this.handleChange as EventListener);
  }

  disconnectedCallback(): void {
    this.host.shadowRoot?.querySelector('gt-range')?.removeEventListener('gt-change', this.handleChange as EventListener);
  }

  private handleChange = (event: Event): void => {
    const detail = (event as CustomEvent<GtSliderFieldChangeDetail>).detail;
    const value = Number(detail.value);
    this.value = value;
    this.change.emit({ value });
  };

  render() {
    const displayValue = this.valueText || `${this.value}${this.unit}`;
    return (
      <Host>
        <label part="base">
          <span part="label" hidden={!this.label}>{this.label}</span>
          <span part="control">
            <gt-range value={this.value} min={this.min} max={this.max} step={this.step} disabled={this.disabled} aria-label={this.ariaLabel || this.label || undefined} />
            <span part="value">{displayValue}</span>
          </span>
        </label>
      </Host>
    );
  }
}
