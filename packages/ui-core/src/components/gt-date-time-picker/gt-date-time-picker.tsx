import { Component, Element, Event, h, Host, Prop, State, type EventEmitter } from '@stencil/core';

import '../gt-date-picker/gt-date-picker';
import '../gt-time-picker/gt-time-picker';

export type GtDateTimeMode = 'date' | 'datetime';
export type GtDateTimeValueFormat = 'date' | 'datetime-local' | 'sql' | 'timestamp';

export interface GtDateTimeChangeDetail { value: string | number | undefined; }

@Component({ tag: 'gt-date-time-picker', shadow: true, styleUrl: 'gt-date-time-picker.css' })
export class GtDateTimePicker {
  @Prop({ mutable: true }) value: string | number | undefined;
  @Prop() placeholder = '选择日期和时间';
  @Prop() datePlaceholder = '日期';
  @Prop() timePlaceholder = '时间';
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) mode: GtDateTimeMode = 'datetime';
  @Prop() valueFormat?: GtDateTimeValueFormat;
  @Prop() valueType?: 'string' | 'timestamp';
  @Prop() minuteStep = 5;
  @Prop() clearable = true;
  @Prop({ attribute: 'close-on-outside' }) closeOnOutside = true;
  @Element() host!: HTMLElement;

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtDateTimeChangeDetail>;

  @State() private datePart = '';
  @State() private timePart = '00:00';

  private dateElement?: HTMLElement;
  private timeElement?: HTMLElement;

  componentWillLoad(): void { this.syncParts(); }

  componentDidLoad(): void {
    this.bindChildren();
    this.host.addEventListener('gt-change', this.handleBubbledChange as EventListener);
  }

  componentDidRender(): void { this.bindChildren(); }

  disconnectedCallback(): void {
    this.host.removeEventListener('gt-change', this.handleBubbledChange as EventListener);
    this.dateElement?.removeEventListener('gt-change', this.handleDateChange as EventListener);
    this.timeElement?.removeEventListener('gt-change', this.handleTimeChange as EventListener);
  }

  private bindChildren(): void {
    const dateElement = this.host.shadowRoot?.querySelector<HTMLElement>('gt-date-picker');
    const timeElement = this.host.shadowRoot?.querySelector<HTMLElement>('gt-time-picker');
    if (dateElement !== this.dateElement) {
      this.dateElement?.removeEventListener('gt-change', this.handleDateChange as EventListener);
      dateElement?.addEventListener('gt-change', this.handleDateChange as EventListener);
      this.dateElement = dateElement ?? undefined;
    }
    if (timeElement !== this.timeElement) {
      this.timeElement?.removeEventListener('gt-change', this.handleTimeChange as EventListener);
      timeElement?.addEventListener('gt-change', this.handleTimeChange as EventListener);
      this.timeElement = timeElement ?? undefined;
    }
  }

  private bindDateElement = (element?: HTMLElement): void => {
    if (element === this.dateElement) return;
    this.dateElement?.removeEventListener('gt-change', this.handleDateChange as EventListener);
    element?.addEventListener('gt-change', this.handleDateChange as EventListener);
    this.dateElement = element ?? undefined;
  };

  private bindTimeElement = (element?: HTMLElement): void => {
    if (element === this.timeElement) return;
    this.timeElement?.removeEventListener('gt-change', this.handleTimeChange as EventListener);
    element?.addEventListener('gt-change', this.handleTimeChange as EventListener);
    this.timeElement = element ?? undefined;
  };

  private parseValue(value: string | number | undefined): { date: string; time: string } {
    if (value === undefined || value === null || value === '') return { date: '', time: '' };
    let local = typeof value === 'number' ? this.toLocalDateTime(value) : value.trim();
    const separator = local.includes('T') ? local.indexOf('T') : local.indexOf(' ');
    if (separator < 0) return { date: local, time: '' };
    return { date: local.slice(0, separator), time: local.slice(separator + 1, separator + 6) };
  }

  private toLocalDateTime(value: number): string {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private syncParts(): void {
    const parsed = this.parseValue(this.value);
    this.datePart = parsed.date;
    if (parsed.time) this.timePart = parsed.time;
  }

  private resolvedFormat(): GtDateTimeValueFormat {
    if (this.valueFormat) return this.valueFormat;
    if (this.valueType === 'timestamp') return 'timestamp';
    if (this.mode === 'date') return 'date';
    return 'datetime-local';
  }

  private emitCombined(): void {
    let value: string | number | undefined;
    if (!this.datePart) value = this.resolvedFormat() === 'timestamp' ? undefined : '';
    else if (this.mode === 'date' || this.resolvedFormat() === 'date') value = this.datePart;
    else {
      const time = this.timePart || '00:00';
      const combined = `${this.datePart}T${time}`;
      if (this.resolvedFormat() === 'timestamp') value = new Date(combined).getTime();
      else if (this.resolvedFormat() === 'sql') value = `${this.datePart} ${time}:00`;
      else value = combined;
    }
    this.value = value;
    this.change.emit({ value });
  }

  private handleDateChange = (event: Event): void => {
    event.stopPropagation();
    const detail = (event as CustomEvent<{ value?: string }>).detail;
    if (!detail || typeof detail.value !== 'string') return;
    this.datePart = detail.value;
    this.emitCombined();
  };

  private handleBubbledChange = (event: Event): void => {
    const source = event.composedPath()[0] as HTMLElement | undefined;
    if (source === this.host) return;
    if (source?.tagName.toLowerCase() === 'gt-date-picker') this.handleDateChange(event);
    else if (source?.tagName.toLowerCase() === 'gt-time-picker') this.handleTimeChange(event);
  };

  private handleTimeChange = (event: Event): void => {
    event.stopPropagation();
    const detail = (event as CustomEvent<{ value?: string }>).detail;
    if (!detail || typeof detail.value !== 'string') return;
    this.timePart = detail.value;
    this.emitCombined();
  };

  render() {
    return (
      <Host>
        <div part="base" class={{ [`mode-${this.mode}`]: true }}>
          <gt-date-picker
            value={this.datePart}
            placeholder={this.mode === 'date' ? this.placeholder : this.datePlaceholder}
            disabled={this.disabled}
            clearable={this.clearable}
            closeOnOutside={this.closeOnOutside}
            size={this.size}
            ref={this.bindDateElement}
          />
          {this.mode === 'datetime' ? (
            <gt-time-picker ref={this.bindTimeElement} value={this.timePart} placeholder={this.timePlaceholder} disabled={this.disabled || !this.datePart} minuteStep={this.minuteStep} closeOnOutside={this.closeOnOutside} size={this.size} />
          ) : null}
        </div>
      </Host>
    );
  }
}
