import { Component, Element as StencilElement, Event, h, Host, Prop, Watch, type EventEmitter } from '@stencil/core';

import { OverlayPortal } from '../../utils/overlay-controller';

export type GtMenuCloseReason = 'outside' | 'escape' | 'programmatic';
export interface GtMenuCloseDetail { reason: GtMenuCloseReason; }

@Component({ tag: 'gt-menu', shadow: true, styleUrl: 'gt-menu.css' })
export class GtMenu {
  @Prop({ mutable: true, reflect: true }) visible = false;
  @Prop() x = 0;
  @Prop() y = 0;
  @Prop({ attribute: 'close-on-click-outside' }) closeOnClickOutside = true;
  @Prop({ attribute: 'outside-ignore-selector' }) outsideIgnoreSelector: string | string[] = '';
  @Prop() maxHeight = '';
  @StencilElement() host!: HTMLElement;

  @Event({ eventName: 'gt-close', bubbles: true, composed: true }) close!: EventEmitter<GtMenuCloseDetail>;

  private portal?: OverlayPortal;
  private contentNodes: Node[] = [];

  componentDidLoad(): void {
    this.syncPortal();
    document.addEventListener('mousedown', this.handleOutside, true);
    document.addEventListener('keydown', this.handleKeydown, true);
  }

  disconnectedCallback(): void {
    document.removeEventListener('mousedown', this.handleOutside, true);
    document.removeEventListener('keydown', this.handleKeydown, true);
    this.removePortal();
  }

  @Watch('visible')
  syncPortal(): void {
    if (!this.host.isConnected) return;
    if (!this.visible) {
      this.removePortal();
      return;
    }
    if (this.portal) {
      this.reposition();
      return;
    }

    this.contentNodes = Array.from(this.host.childNodes);
    const content = document.createDocumentFragment();
    content.append(...this.contentNodes);
    this.portal = new OverlayPortal('popup', content, this.host, undefined, { overlay: false });
    this.portal.element.dataset.gtOverlay = 'menu';
    this.portal.element.dataset.variant = 'menu';
    const panel = this.panel();
    panel?.setAttribute('role', 'menu');
    panel?.setAttribute('aria-label', this.host.getAttribute('aria-label') || '菜单');
    this.reposition();
  }

  @Watch('x')
  @Watch('y')
  @Watch('maxHeight')
  reposition(): void {
    const panel = this.panel();
    if (!panel) return;
    const width = panel.offsetWidth || 220;
    const height = panel.offsetHeight || 180;
    const maxLeft = Math.max(10, window.innerWidth - width - 10);
    const maxTop = Math.max(10, window.innerHeight - height - 10);
    panel.style.position = 'fixed';
    panel.style.margin = '0';
    panel.style.left = `${Math.min(Math.max(10, this.x), maxLeft)}px`;
    panel.style.top = `${Math.min(Math.max(10, this.y), maxTop)}px`;
    if (this.maxHeight) panel.style.maxHeight = this.maxHeight;
  }

  private panel(): HTMLElement | undefined {
    return this.portal?.element.querySelector<HTMLElement>('[part="panel"]') ?? undefined;
  }

  private removePortal(): void {
    if (!this.portal) return;
    this.portal.destroy();
    this.portal = undefined;
    this.host.append(...this.contentNodes);
    this.contentNodes = [];
  }

  private closeMenu(reason: GtMenuCloseReason): void {
    if (!this.visible) return;
    this.visible = false;
    this.close.emit({ reason });
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (this.visible && event.key === 'Escape') {
      event.preventDefault();
      this.closeMenu('escape');
    }
  };

  private handleOutside = (event: MouseEvent): void => {
    if (!this.visible || !this.closeOnClickOutside) return;
    const target = event.target as Node | null;
    const panel = this.panel();
    if (target && (this.host.contains(target) || panel?.contains(target))) return;
    const targetElement = target instanceof HTMLElement ? target : target?.parentElement;
    const selectors = Array.isArray(this.outsideIgnoreSelector) ? this.outsideIgnoreSelector : [this.outsideIgnoreSelector];
    if (targetElement && selectors.some(selector => selector && targetElement.closest(selector))) return;
    this.closeMenu('outside');
  };

  render() {
    return <Host hidden={!this.visible}><slot /></Host>;
  }
}
