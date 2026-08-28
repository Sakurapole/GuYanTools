import { Component, Element, Event, h, Host, Prop, Watch, type EventEmitter } from '@stencil/core';

import { OverlayPortal } from '../../utils/overlay-controller';

export type GtPopupVariant = 'dialog' | 'drawer' | 'floating';
export type GtPopupPlacement = 'center' | 'left' | 'right' | 'top' | 'bottom';
export type GtPopupCloseReason = 'mask' | 'outside' | 'escape' | 'programmatic';
export interface GtPopupOpenChangeDetail { open: boolean; reason: GtPopupCloseReason; }

@Component({ tag: 'gt-popup-surface', shadow: true, styleUrl: 'gt-popup-surface.css' })
export class GtPopupSurface {
  @Prop({ mutable: true, reflect: true }) modelValue = false;
  @Prop({ reflect: true }) variant: GtPopupVariant = 'dialog';
  @Prop({ reflect: true }) placement: GtPopupPlacement = 'center';
  @Prop() teleported = true;
  @Prop({ attribute: 'teleport-to' }) teleportTo = 'body';
  @Prop() fixed = true;
  @Prop() overlay = true;
  @Prop() width: string | number = '';
  @Prop({ attribute: 'max-width' }) maxWidth: string | number = '';
  @Prop() height: string | number = '';
  @Prop({ attribute: 'max-height' }) maxHeight: string | number = '';
  @Prop({ attribute: 'z-index' }) zIndex: string | number = 'var(--ui-z-toast)';
  @Prop({ attribute: 'close-on-mask' }) closeOnMask = true;
  @Prop({ attribute: 'close-on-outside' }) closeOnOutside = true;
  @Prop({ attribute: 'close-on-esc' }) closeOnEsc = true;
  @Prop() persistent = false;
  @Prop() role = 'dialog';
  @Prop({ attribute: 'aria-label' }) ariaLabel = '';
  @Prop({ attribute: 'aria-labelledby' }) ariaLabelledby = '';
  @Prop({ attribute: 'panel-class' }) panelClass: string | string[] | Record<string, boolean> = '';
  @Prop({ attribute: 'overlay-class' }) overlayClass: string | string[] | Record<string, boolean> = '';
  @Prop({ attribute: 'panel-style' }) panelStyle: string | Record<string, string | number> = '';
  @Element() host!: HTMLElement;

  @Event({ eventName: 'gt-open-change', bubbles: true, composed: true }) openChange!: EventEmitter<GtPopupOpenChangeDetail>;
  @Event({ eventName: 'gt-open', bubbles: true, composed: true }) openEvent!: EventEmitter<void>;
  @Event({ eventName: 'gt-close', bubbles: true, composed: true }) closeEvent!: EventEmitter<void>;
  @Event({ eventName: 'gt-mask-click', bubbles: true, composed: true }) maskClick!: EventEmitter<void>;
  @Event({ eventName: 'gt-outside-click', bubbles: true, composed: true }) outsideClick!: EventEmitter<void>;

  private portal?: OverlayPortal;
  private contentNodes: Node[] = [];

  componentDidLoad(): void {
    document.addEventListener('keydown', this.handleKeydown, true);
    document.addEventListener('pointerdown', this.handleOutside, true);
    this.syncPortal();
  }

  disconnectedCallback(): void {
    document.removeEventListener('keydown', this.handleKeydown, true);
    document.removeEventListener('pointerdown', this.handleOutside, true);
    this.removePortal();
  }

  @Watch('modelValue')
  @Watch('variant')
  @Watch('placement')
  @Watch('width')
  @Watch('maxWidth')
  @Watch('height')
  @Watch('maxHeight')
  @Watch('panelClass')
  @Watch('panelStyle')
  syncPortal(): void {
    if (!this.host.isConnected) return;
    if (!this.modelValue) {
      this.removePortal();
      return;
    }
    if (!this.portal) {
      this.contentNodes = Array.from(this.host.childNodes);
      const content = document.createDocumentFragment();
      content.append(...this.contentNodes);
      const target = this.resolveTarget();
      this.portal = new OverlayPortal('popup', content, this.host, () => this.close('mask'), { target, overlay: this.hasOverlay() });
      this.portal.element.dataset.variant = this.variant;
      this.portal.element.dataset.placement = this.placement;
      this.applyPortalClasses();
      this.applyPanelAttributes();
      this.openEvent.emit();
    }
    this.applyPortalClasses();
    this.applyPanelAttributes();
  }

  private resolveTarget(): HTMLElement {
    if (!this.teleported) return this.host.parentElement ?? document.body;
    if (this.teleportTo === 'body') return document.body;
    return document.querySelector<HTMLElement>(this.teleportTo) ?? document.body;
  }

  private hasOverlay(): boolean { return this.overlay && this.variant !== 'floating'; }

  private panel(): HTMLElement | undefined { return this.portal?.element.querySelector<HTMLElement>('[part="panel"]') ?? undefined; }

  private applyPortalClasses(): void {
    if (!this.portal) return;
    this.portal.element.dataset.variant = this.variant;
    this.portal.element.dataset.placement = this.placement;
    this.portal.element.style.zIndex = this.normalizeSize(this.zIndex) ?? '';
    this.applyClasses(this.portal.element, this.overlayClass);
  }

  private applyPanelAttributes(): void {
    const panel = this.panel();
    if (!panel) return;
    panel.setAttribute('role', this.role);
    if (this.ariaLabel) panel.setAttribute('aria-label', this.ariaLabel);
    else panel.removeAttribute('aria-label');
    if (this.ariaLabelledby) panel.setAttribute('aria-labelledby', this.ariaLabelledby);
    else panel.removeAttribute('aria-labelledby');
    this.applyClasses(panel, this.panelClass);
    const style = this.panelStyle;
    if (typeof style === 'string') panel.setAttribute('style', `${style};${this.baseStyle()}`);
    else {
      Object.entries(style ?? {}).forEach(([key, value]) => { panel.style.setProperty(this.toCssName(key), String(value)); });
      Object.entries(this.baseStyleMap()).forEach(([key, value]) => { panel.style.setProperty(key, value); });
    }
  }

  private baseStyle(): string {
    return Object.entries(this.baseStyleMap()).map(([key, value]) => `${key}:${value}`).join(';');
  }

  private baseStyleMap(): Record<string, string> {
    const result: Record<string, string> = { position: this.fixed ? 'fixed' : 'absolute' };
    for (const [key, value] of [['width', this.width], ['max-width', this.maxWidth], ['height', this.height], ['max-height', this.maxHeight]] as const) {
      const normalized = this.normalizeSize(value);
      if (normalized) result[key] = normalized;
    }
    return result;
  }

  private normalizeSize(value: string | number): string | undefined {
    if (value === '' || value === undefined) return undefined;
    return typeof value === 'number' ? `${value}px` : value;
  }

  private toCssName(key: string): string { return key.startsWith('--') ? key : key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`); }

  private applyClasses(element: HTMLElement, value: string | string[] | Record<string, boolean>): void {
    const classes = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\s+/) : Object.entries(value).filter(([, enabled]) => enabled).map(([name]) => name);
    classes.filter(Boolean).forEach(name => element.classList.add(name));
  }

  private removePortal(): void {
    if (!this.portal) return;
    this.portal.destroy();
    this.portal = undefined;
    this.host.append(...this.contentNodes);
    this.contentNodes = [];
  }

  private close(reason: GtPopupCloseReason): void {
    if (!this.modelValue || this.persistent) return;
    this.modelValue = false;
    this.openChange.emit({ open: false, reason });
    this.closeEvent.emit();
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (this.modelValue && this.closeOnEsc && event.key === 'Escape') {
      event.preventDefault();
      this.close('escape');
    }
  };

  private handleOutside = (event: PointerEvent): void => {
    if (!this.modelValue || this.hasOverlay() || !this.closeOnOutside) return;
    const target = event.target as Node | null;
    const panel = this.panel();
    if (target && panel?.contains(target)) return;
    this.outsideClick.emit();
    this.close('outside');
  };

  render() { return <Host hidden={!this.modelValue}><slot /></Host>; }
}
