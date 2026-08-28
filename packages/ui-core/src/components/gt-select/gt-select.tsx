import { Component, Element, Event, h, Host, Prop, State, Watch, type EventEmitter } from '@stencil/core';

import { OverlayPortal } from '../../utils/overlay-controller';

export interface GtSelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

export interface GtSelectChangeDetail {
  value: string | number;
}

@Component({ tag: 'gt-select', shadow: true, styleUrl: 'gt-select.css' })
export class GtSelect {
  @Prop({ mutable: true, reflect: true }) value: string | number = '';
  @Prop() options: GtSelectOption[] = [];
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop() placeholder = '请选择…';
  @Prop({ reflect: true }) animation: 'fade' | 'slide' | 'scale' | 'slideScale' = 'slideScale';
  @Prop({ attribute: 'close-on-outside' }) closeOnOutside = true;
  @Element() host!: HTMLElement;

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtSelectChangeDetail>;
  @Event({ eventName: 'gt-focus', bubbles: true, composed: true }) focusEvent!: EventEmitter<void>;
  @Event({ eventName: 'gt-blur', bubbles: true, composed: true }) blurEvent!: EventEmitter<void>;

  @State() private isOpen = false;
  @State() private highlightedIndex = -1;
  @State() private hasPrefix = false;
  @State() private hasSuffix = false;

  private portal?: OverlayPortal;
  private triggerElement?: HTMLButtonElement;
  private boundTriggerElement?: HTMLButtonElement;
  private prefixSlot?: HTMLSlotElement;
  private suffixSlot?: HTMLSlotElement;
  private movedOptionNodes = new Map<number, { node: HTMLElement; slot: string }>();

  componentDidLoad(): void {
    this.syncSlots();
    this.bindTriggerKeydown();
    document.addEventListener('mousedown', this.handleOutside, true);
    window.addEventListener('resize', this.repositionPortal);
    window.addEventListener('scroll', this.repositionPortal, true);
  }

  disconnectedCallback(): void {
    this.boundTriggerElement?.removeEventListener('keydown', this.handleTriggerKeydown);
    document.removeEventListener('mousedown', this.handleOutside, true);
    window.removeEventListener('resize', this.repositionPortal);
    window.removeEventListener('scroll', this.repositionPortal, true);
    this.close(false);
  }

  componentDidRender(): void {
    this.bindTriggerKeydown();
  }

  private bindTriggerKeydown(): void {
    if (this.boundTriggerElement === this.triggerElement) return;
    this.boundTriggerElement?.removeEventListener('keydown', this.handleTriggerKeydown);
    this.triggerElement?.addEventListener('keydown', this.handleTriggerKeydown);
    this.boundTriggerElement = this.triggerElement;
  }

  @Watch('options')
  optionsChanged(): void {
    if (this.isOpen) this.renderOptions();
  }

  @Watch('disabled')
  disabledChanged(): void {
    if (this.disabled) this.close(false);
  }

  private syncSlots = (): void => {
    this.hasPrefix = this.slotHasContent(this.prefixSlot);
    this.hasSuffix = this.slotHasContent(this.suffixSlot);
  };

  private slotHasContent(slot?: HTMLSlotElement): boolean {
    return Boolean(slot?.assignedNodes({ flatten: true }).some((node) => node.nodeType !== 3 || Boolean(node.textContent?.trim())));
  }

  private selectedIndex(): number {
    return this.options.findIndex((option) => String(option.value) === String(this.value));
  }

  private selectedLabel(): string {
    return this.options.find((option) => String(option.value) === String(this.value))?.label ?? '';
  }

  private open(): void {
    if (this.disabled || this.isOpen) return;
    this.isOpen = true;
    this.highlightedIndex = this.selectedIndex();
    const content = document.createDocumentFragment();
    this.portal = new OverlayPortal('select', content, this.host);
    this.portal.element.id = `${this.host.id || 'gt-select'}-listbox`;
    this.portal.element.dataset.animation = this.animation;
    this.portal.element.addEventListener('gt-overlay-reposition', this.repositionPortal);
    this.renderOptions();
    this.repositionPortal();
    this.focusEvent.emit();
  }

  private close(restoreFocus = true): void {
    if (!this.isOpen && !this.portal) return;
    this.portal?.destroy();
    this.portal = undefined;
    this.restoreOptionNodes();
    this.isOpen = false;
    this.highlightedIndex = -1;
    this.blurEvent.emit();
    if (restoreFocus) this.triggerElement?.focus();
  }

  private toggle = (): void => {
    if (this.isOpen) this.close();
    else this.open();
  };

  private handleTriggerKeydown = (event: KeyboardEvent): void => {
    if (!this.isOpen) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.open();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveHighlight(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveHighlight(-1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = this.options[this.highlightedIndex];
      if (option) this.selectOption(option);
    }
  };

  private moveHighlight(direction: 1 | -1): void {
    if (!this.options.length) return;
    let index = this.highlightedIndex;
    for (let count = 0; count < this.options.length; count += 1) {
      index = (index + direction + this.options.length) % this.options.length;
      if (!this.options[index].disabled) {
        this.highlightedIndex = index;
        this.scrollHighlightedIntoView();
        return;
      }
    }
  }

  private selectOption(option: GtSelectOption): void {
    if (option.disabled) return;
    this.value = option.value;
    this.change.emit({ value: option.value });
    this.close();
  }

  private handleOutside = (event: MouseEvent): void => {
    if (!this.isOpen || !this.closeOnOutside) return;
    const target = event.target as Node | null;
    const panel = this.portal?.element.querySelector<HTMLElement>('[part="panel"]');
    if (target && (this.host.contains(target) || panel?.contains(target))) return;
    this.close(false);
  };

  private renderOptions(): void {
    const body = this.portal?.element.querySelector<HTMLElement>('[part="body"]');
    if (!body) return;
    const list = document.createElement('div');
    list.dataset.selectOptions = '';
    list.setAttribute('role', 'listbox');
    this.options.forEach((option, index) => {
      const selected = String(option.value) === String(this.value);
      const item = document.createElement('div');
      item.dataset.value = String(option.value);
      item.dataset.index = String(index);
      item.setAttribute('part', 'option');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(selected));
      item.setAttribute('aria-disabled', String(Boolean(option.disabled)));
      if (selected) item.dataset.selected = '';
      if (option.disabled) item.dataset.disabled = '';
      if (index === this.highlightedIndex) item.dataset.highlighted = '';
      item.addEventListener('click', () => this.selectOption(option));
      item.addEventListener('mouseenter', () => {
        if (!option.disabled) this.highlightedIndex = index;
        this.updateHighlightedOptions();
      });

      const custom = this.optionNode(index);
      if (custom) {
        item.append(custom.node);
      } else {
        const check = document.createElement('span');
        check.setAttribute('part', 'check');
        if (selected) {
          check.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>';
        }
        const label = document.createElement('span');
        label.setAttribute('part', 'option-label');
        label.textContent = option.label;
        item.append(check, label);
      }
      list.append(item);
    });
    while (body.firstChild) {
      body.removeChild(body.firstChild);
    }
    body.append(list);
  }

  private optionNode(index: number): { node: HTMLElement; slot: string } | undefined {
    const slot = `option-${index}`;
    const existing = this.movedOptionNodes.get(index);
    if (existing) return existing;
    const node = Array.from(this.host.children).find((child) => child.getAttribute('slot') === slot);
    if (!(node instanceof HTMLElement)) return undefined;
    const entry = { node, slot };
    this.movedOptionNodes.set(index, entry);
    return entry;
  }

  private restoreOptionNodes(): void {
    for (const { node, slot } of this.movedOptionNodes.values()) {
      node.setAttribute('slot', slot);
      this.host.append(node);
    }
    this.movedOptionNodes.clear();
  }

  private updateHighlightedOptions(): void {
    this.portal?.element.querySelectorAll<HTMLElement>('[data-select-options] [part="option"]').forEach((item) => {
      if (Number(item.dataset.index) === this.highlightedIndex) item.setAttribute('data-highlighted', '');
      else item.removeAttribute('data-highlighted');
    });
  }

  private scrollHighlightedIntoView(): void {
    const item = this.portal?.element.querySelector<HTMLElement>(`[data-select-options] [data-index="${this.highlightedIndex}"]`);
    if (item && typeof item.scrollIntoView === 'function') item.scrollIntoView({ block: 'nearest' });
    this.updateHighlightedOptions();
  }

  private repositionPortal = (): void => {
    const panel = this.portal?.element.querySelector<HTMLElement>('[part="panel"]');
    if (!panel || !this.triggerElement) return;
    const anchor = this.triggerElement.getBoundingClientRect();
    const availableBelow = Math.max(0, window.innerHeight - anchor.bottom - 16);
    const availableAbove = Math.max(0, anchor.top - 16);
    const measuredHeight = panel.getBoundingClientRect().height || 260;
    const openUpward = availableBelow < Math.min(measuredHeight, 280) && availableAbove > availableBelow;
    panel.dataset.placement = openUpward ? 'top' : 'bottom';
    panel.style.position = 'fixed';
    panel.style.left = `${Math.max(8, anchor.left)}px`;
    panel.style.top = openUpward ? `${Math.max(8, anchor.top - Math.min(measuredHeight, 280) - 6)}px` : `${anchor.bottom + 6}px`;
    panel.style.minWidth = `${anchor.width}px`;
    panel.style.maxHeight = `${Math.max(96, Math.min(280, openUpward ? availableAbove : availableBelow || 280))}px`;
  };

  render() {
    const selectedLabel = this.selectedLabel();
    return (
      <Host>
        <div part="base" class="shell">
          <button
            ref={(element) => { this.triggerElement = element; }}
            part="trigger"
            type="button"
            disabled={this.disabled}
            aria-haspopup="listbox"
            aria-expanded={String(this.isOpen)}
            aria-controls={this.isOpen ? `${this.host.id || 'gt-select'}-listbox` : undefined}
            onClick={this.toggle}
          >
            <span part="prefix" hidden={!this.hasPrefix}><slot name="prefix" ref={(element) => { this.prefixSlot = element; }} onSlotchange={this.syncSlots} /></span>
            <span part="label" data-placeholder={!selectedLabel ? '' : undefined}>{selectedLabel || this.placeholder}</span>
            <span part="suffix" hidden={!this.hasSuffix}><slot name="suffix" ref={(element) => { this.suffixSlot = element; }} onSlotchange={this.syncSlots} /></span>
            <span part="arrow" aria-hidden="true" />
          </button>
        </div>
      </Host>
    );
  }
}
