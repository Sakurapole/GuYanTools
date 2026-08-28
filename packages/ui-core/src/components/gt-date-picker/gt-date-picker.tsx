import { Component, Element, Event, h, Host, Prop, State, Watch, type EventEmitter } from '@stencil/core';

import { OverlayPortal } from '../../utils/overlay-controller';

export interface GtDateChangeDetail { value: string; }

@Component({ tag: 'gt-date-picker', shadow: true, styleUrl: 'gt-date-picker.css' })
export class GtDatePicker {
  @Prop({ mutable: true, reflect: true }) value = '';
  @Prop() placeholder = '选择日期';
  @Prop() clearable = true;
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop() min = '';
  @Prop() max = '';
  @Prop({ attribute: 'close-on-outside' }) closeOnOutside = true;
  @Element() host!: HTMLElement;

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtDateChangeDetail>;
  @Event({ eventName: 'gt-clear', bubbles: true, composed: true }) clear!: EventEmitter<void>;

  @State() private isOpen = false;
  @State() private viewYear = new Date().getFullYear();
  @State() private viewMonth = new Date().getMonth();

  private portal?: OverlayPortal;
  private triggerElement?: HTMLButtonElement;
  private boundTriggerElement?: HTMLButtonElement;

  componentDidLoad(): void {
    this.syncView();
    this.bindTrigger();
    document.addEventListener('mousedown', this.handleOutside, true);
  }

  componentDidRender(): void { this.bindTrigger(); }

  disconnectedCallback(): void {
    this.boundTriggerElement?.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('mousedown', this.handleOutside, true);
    this.close(false);
  }

  @Watch('value')
  syncView(): void {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.value);
    if (match) {
      this.viewYear = Number(match[1]);
      this.viewMonth = Number(match[2]) - 1;
    }
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
    this.portal.element.dataset.gtOverlay = 'date-picker';
    this.portal.element.dataset.variant = 'floating';
    this.portal.element.dataset.placement = 'bottom';
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

  private formatLabel(): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.value);
    return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : this.value;
  }

  private isDateDisabled(date: string): boolean {
    return Boolean((this.min && date < this.min) || (this.max && date > this.max));
  }

  private selectDate = (date: string): void => {
    if (this.isDateDisabled(date)) return;
    this.value = date;
    this.change.emit({ value: date });
    this.close();
  };

  private clearDate = (event: MouseEvent): void => {
    event.stopPropagation();
    this.value = '';
    this.change.emit({ value: '' });
    this.clear.emit();
    this.close(false);
  };

  private monthLabel(): string { return `${this.viewYear}年${this.viewMonth + 1}月`; }

  private moveMonth(direction: 1 | -1): void {
    if (direction > 0 && this.viewMonth === 11) { this.viewMonth = 0; this.viewYear += 1; }
    else if (direction < 0 && this.viewMonth === 0) { this.viewMonth = 11; this.viewYear -= 1; }
    else this.viewMonth += direction;
    this.renderPanel();
  }

  private renderPanel(): void {
    const body = this.portal?.element.querySelector<HTMLElement>('[part="body"]');
    if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);
    const calendar = document.createElement('div');
    calendar.setAttribute('part', 'calendar');

    const nav = document.createElement('div');
    nav.setAttribute('part', 'nav');
    const previous = document.createElement('button');
    previous.type = 'button'; previous.setAttribute('part', 'nav-prev'); previous.setAttribute('aria-label', '上个月'); previous.textContent = '‹';
    previous.addEventListener('click', () => this.moveMonth(-1));
    const title = document.createElement('button');
    title.type = 'button'; title.setAttribute('part', 'nav-title'); title.textContent = this.monthLabel(); title.addEventListener('click', () => { const now = new Date(); this.viewYear = now.getFullYear(); this.viewMonth = now.getMonth(); this.renderPanel(); });
    const next = document.createElement('button');
    next.type = 'button'; next.setAttribute('part', 'nav-next'); next.setAttribute('aria-label', '下个月'); next.textContent = '›';
    next.addEventListener('click', () => this.moveMonth(1));
    nav.append(previous, title, next);
    calendar.append(nav);

    const weekdays = document.createElement('div');
    weekdays.setAttribute('part', 'weekdays');
    ['日', '一', '二', '三', '四', '五', '六'].forEach(label => { const day = document.createElement('span'); day.textContent = label; weekdays.append(day); });
    calendar.append(weekdays);

    const grid = document.createElement('div');
    grid.setAttribute('part', 'grid');
    const firstDay = new Date(this.viewYear, this.viewMonth, 1).getDay();
    const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
    const daysInPreviousMonth = new Date(this.viewYear, this.viewMonth, 0).getDate();
    const today = new Date();
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    for (let index = 0; index < 42; index += 1) {
      const dayOffset = index - firstDay + 1;
      const date = new Date(this.viewYear, this.viewMonth, dayOffset);
      const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const button = document.createElement('button');
      button.type = 'button'; button.setAttribute('part', 'day'); button.dataset.date = dateValue; button.textContent = String(date.getDate());
      if (date.getMonth() !== this.viewMonth) button.dataset.outside = '';
      if (dateValue === todayValue) button.dataset.today = '';
      if (dateValue === this.value) button.dataset.selected = '';
      const blocked = this.isDateDisabled(dateValue);
      button.disabled = blocked;
      if (blocked) button.dataset.disabled = '';
      button.addEventListener('click', () => this.selectDate(dateValue));
      grid.append(button);
    }
    void daysInMonth; void daysInPreviousMonth;
    calendar.append(grid);
    body.append(calendar);
    const panel = this.portal?.element.querySelector<HTMLElement>('[part="panel"]');
    panel?.setAttribute('role', 'dialog');
    panel?.classList.add('gt-date-picker-panel');
  }

  private reposition = (): void => {
    const panel = this.portal?.element.querySelector<HTMLElement>('[part="panel"]');
    if (!panel || !this.triggerElement) return;
    const anchor = this.triggerElement.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 16);
    const height = panel.getBoundingClientRect().height || 310;
    const openUpward = window.innerHeight - anchor.bottom < height + 6 && anchor.top > height + 6;
    panel.style.position = 'fixed';
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
    panel.style.top = openUpward ? `${Math.max(8, anchor.top - height - 6)}px` : `${anchor.bottom + 6}px`;
    panel.dataset.placement = openUpward ? 'top' : 'bottom';
  };

  render() {
    const label = this.formatLabel();
    return (
      <Host>
        <div part="base" class={{ disabled: this.disabled }}>
          <button ref={element => { this.triggerElement = element; }} part="trigger" type="button" disabled={this.disabled} aria-haspopup="dialog" aria-expanded={String(this.isOpen)} onClick={this.toggle}>
            <span part="icon" aria-hidden="true">▣</span>
            <span part="label" data-placeholder={!label ? '' : undefined}>{label || this.placeholder}</span>
            {this.clearable && this.value ? <button part="clear" type="button" aria-label="清除日期" onClick={this.clearDate}>×</button> : null}
          </button>
        </div>
      </Host>
    );
  }
}
