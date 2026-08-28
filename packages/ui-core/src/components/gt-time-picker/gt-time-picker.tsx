import { Component, Element, Event, h, Host, Prop, State, Watch, type EventEmitter } from '@stencil/core';

import { OverlayPortal } from '../../utils/overlay-controller';

export interface GtTimeChangeDetail { value: string; }

@Component({ tag: 'gt-time-picker', shadow: true, styleUrl: 'gt-time-picker.css' })
export class GtTimePicker {
  @Prop({ mutable: true, reflect: true }) value = '';
  @Prop() placeholder = '选择时间';
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop() minuteStep = 5;
  @Prop({ attribute: 'close-on-outside' }) closeOnOutside = true;
  @Element() host!: HTMLElement;

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtTimeChangeDetail>;

  @State() private isOpen = false;

  private portal?: OverlayPortal;
  private triggerElement?: HTMLButtonElement;
  private boundTriggerElement?: HTMLButtonElement;

  componentDidLoad(): void {
    this.bindTrigger();
    document.addEventListener('mousedown', this.handleOutside, true);
  }

  componentDidRender(): void { this.bindTrigger(); }

  disconnectedCallback(): void {
    this.boundTriggerElement?.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('mousedown', this.handleOutside, true);
    this.close(false);
  }

  @Watch('disabled')
  disabledChanged(): void {
    if (this.disabled) this.close(false);
  }

  @Watch('minuteStep')
  minuteStepChanged(): void {
    if (this.isOpen) this.renderPanel();
  }

  private bindTrigger(): void {
    if (this.boundTriggerElement === this.triggerElement) return;
    this.boundTriggerElement?.removeEventListener('keydown', this.handleKeydown);
    this.triggerElement?.addEventListener('keydown', this.handleKeydown);
    this.boundTriggerElement = this.triggerElement;
  }

  private open(): void {
    if (this.disabled || this.isOpen) return;
    this.isOpen = true;
    this.portal = new OverlayPortal('popup', '', this.host, undefined, { overlay: false });
    this.portal.element.dataset.gtOverlay = 'time-picker';
    this.portal.element.dataset.variant = 'floating';
    this.renderPanel();
    this.reposition();
  }

  private close(restoreFocus = true): void {
    if (!this.portal && !this.isOpen) return;
    this.portal?.destroy();
    this.portal = undefined;
    this.isOpen = false;
    if (restoreFocus) this.triggerElement?.focus();
  }

  private toggle = (): void => { if (this.isOpen) this.close(); else this.open(); };

  private handleKeydown = (event: KeyboardEvent): void => {
    if (!this.isOpen && ['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      this.open();
    } else if (this.isOpen && event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };

  private handleOutside = (event: MouseEvent): void => {
    if (!this.isOpen || !this.closeOnOutside) return;
    const target = event.target as Node | null;
    const panel = this.portal?.element.querySelector<HTMLElement>('[part="panel"]');
    if (target && (this.host.contains(target) || panel?.contains(target))) return;
    this.close(false);
  };

  private parseValue(): { hour: number; minute: number } {
    const match = /^(\d{1,2}):(\d{1,2})/.exec(this.value);
    if (!match) return { hour: -1, minute: -1 };
    return { hour: Number(match[1]), minute: Number(match[2]) };
  }

  private pad(value: number): string { return String(value).padStart(2, '0'); }

  private normalizedStep(): number {
    const step = Number(this.minuteStep);
    return Number.isFinite(step) && step > 0 && step <= 60 ? Math.max(1, Math.floor(step)) : 5;
  }

  private emitValue(hour: number, minute: number): void {
    const value = `${this.pad(hour)}:${this.pad(minute)}`;
    this.value = value;
    this.change.emit({ value });
  }

  private selectHour = (hour: number): void => {
    const { minute } = this.parseValue();
    this.emitValue(hour, minute >= 0 ? minute : 0);
  };

  private selectMinute = (minute: number): void => {
    const { hour } = this.parseValue();
    this.emitValue(hour >= 0 ? hour : 0, minute);
  };

  private selectNow = (): void => {
    const now = new Date();
    this.emitValue(now.getHours(), now.getMinutes());
    this.close(false);
  };

  private renderPanel(): void {
    const body = this.portal?.element.querySelector<HTMLElement>('[part="body"]');
    if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);

    const { hour: selectedHour, minute: selectedMinute } = this.parseValue();
    const columns = document.createElement('div');
    columns.setAttribute('part', 'columns');

    const createColumn = (label: string, values: number[], selected: number, onSelect: (value: number) => void, key: string): HTMLElement => {
      const column = document.createElement('div');
      column.setAttribute('part', 'column');
      const heading = document.createElement('div');
      heading.setAttribute('part', 'column-header');
      heading.textContent = label;
      const list = document.createElement('div');
      list.setAttribute('part', 'list');
      list.dataset.column = key;
      values.forEach(value => {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('part', 'item');
        item.dataset.value = String(value);
        item.dataset[key] = String(value);
        item.textContent = this.pad(value);
        if (value === selected) item.dataset.selected = '';
        item.addEventListener('click', () => onSelect(value));
        list.append(item);
      });
      column.append(heading, list);
      return column;
    };

    const hours = Array.from({ length: 24 }, (_, index) => index);
    const minutes = Array.from({ length: Math.ceil(60 / this.normalizedStep()) }, (_, index) => index * this.normalizedStep()).filter(value => value < 60);
    columns.append(createColumn('时', hours, selectedHour, this.selectHour, 'hour'));
    const separator = document.createElement('span');
    separator.setAttribute('part', 'separator');
    separator.textContent = ':';
    columns.append(separator, createColumn('分', minutes, selectedMinute, this.selectMinute, 'minute'));

    const footer = document.createElement('div');
    footer.setAttribute('part', 'footer-actions');
    const now = document.createElement('button');
    now.type = 'button'; now.setAttribute('part', 'now'); now.textContent = '现在'; now.addEventListener('click', this.selectNow);
    const close = document.createElement('button');
    close.type = 'button'; close.setAttribute('part', 'confirm'); close.textContent = '确定'; close.addEventListener('click', () => this.close());
    footer.append(now, close);
    body.append(columns, footer);
  }

  private reposition = (): void => {
    const panel = this.portal?.element.querySelector<HTMLElement>('[part="panel"]');
    if (!panel || !this.triggerElement) return;
    const anchor = this.triggerElement.getBoundingClientRect();
    const width = Math.min(190, window.innerWidth - 16);
    const height = panel.getBoundingClientRect().height || 240;
    const openUpward = window.innerHeight - anchor.bottom < height + 6 && anchor.top > height + 6;
    panel.style.position = 'fixed';
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
    panel.style.top = openUpward ? `${Math.max(8, anchor.top - height - 6)}px` : `${anchor.bottom + 6}px`;
    panel.dataset.placement = openUpward ? 'top' : 'bottom';
  };

  private displayLabel(): string {
    const { hour, minute } = this.parseValue();
    return hour >= 0 && minute >= 0 ? `${this.pad(hour)}:${this.pad(minute)}` : this.value;
  }

  render() {
    const label = this.displayLabel();
    return (
      <Host>
        <div part="base">
          <button
            ref={element => { this.triggerElement = element; }}
            part="trigger"
            type="button"
            disabled={this.disabled}
            aria-haspopup="dialog"
            aria-expanded={String(this.isOpen)}
            onClick={this.toggle}
          >
            <span part="icon" aria-hidden="true">◷</span>
            <span part="label" data-placeholder={!label ? '' : undefined}>{label || this.placeholder}</span>
            <span part="arrow" aria-hidden="true" />
          </button>
        </div>
      </Host>
    );
  }
}
