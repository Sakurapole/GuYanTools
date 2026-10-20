import { Component, Element, Event, h, Host, Prop, Watch, type EventEmitter } from '@stencil/core';

import { OverlayPortal } from '../../utils/overlay-controller';
import type { GtOpenChangeDetail, GtOverlayCloseReason } from '../gt-dialog/gt-dialog';

@Component({ tag: 'gt-drawer', shadow: true, styleUrl: 'gt-drawer.css' })
export class GtDrawer {
  @Prop({ mutable: true, reflect: true }) open = false;
  @Prop({ reflect: true }) position: 'left' | 'right' = 'right';
  @Prop() width = '400px';
  @Prop({ reflect: true }) overlay = true;
  @Prop({ attribute: 'close-on-mask' }) closeOnMask = true;
  @Prop({ attribute: 'close-on-esc' }) closeOnEsc = true;
  @Prop({ reflect: true }) persistent = false;
  @Prop({ attribute: 'aria-label' }) ariaLabel = 'Drawer';
  @Element() host!: HTMLElement;

  @Event({ eventName: 'gt-open-change', bubbles: true, composed: true })
  openChange!: EventEmitter<GtOpenChangeDetail>;

  @Event({ eventName: 'gt-after-close', bubbles: true, composed: true })
  afterClose!: EventEmitter<void>;

  private closeTimer?: number;
  private closingPanel?: HTMLElement;
  private contentNodes: Node[] = [];
  private portal?: OverlayPortal;
  private trigger?: HTMLElement | null;

  componentDidLoad(): void {
    document.addEventListener('keydown', this.handleKeydown);
    this.syncPortal();
  }

  disconnectedCallback(): void {
    document.removeEventListener('keydown', this.handleKeydown);
    this.removePortal();
  }

  @Watch('open')
  syncPortal(): void {
    if (!this.host.isConnected) return;
    if (!this.open) {
      this.beginClose();
      return;
    }
    if (this.portal) {
      this.cancelClose();
      this.portal.element.removeAttribute('data-state');
      return;
    }

    this.trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const content = document.createDocumentFragment();
    this.contentNodes = Array.from(this.host.childNodes);
    content.append(...this.contentNodes);
    this.portal = new OverlayPortal('drawer', content, this.host, () => {
      if (!this.persistent && this.closeOnMask) this.close('mask');
    });
    const panel = this.portal.element.querySelector<HTMLElement>('.panel');
    if (panel) {
      panel.setAttribute('aria-label', this.ariaLabel);
      const labelledBy = this.host.getAttribute('aria-labelledby');
      if (labelledBy) panel.setAttribute('aria-labelledby', labelledBy);
      this.portal.element.style.setProperty('--gt-drawer-width', this.width);
      panel.dataset.position = this.position;
      if (!this.overlay)
        this.portal.element.querySelector<HTMLElement>('[data-overlay-mask]')?.remove();
    }
    queueMicrotask(() => panel?.focus());
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (!this.open) return;
    if (event.key === 'Tab') {
      this.trapFocus(event);
      return;
    }
    if (event.key === 'Escape' && this.closeOnEsc && !this.persistent) {
      event.preventDefault();
      this.close('escape');
    }
  };

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.portal?.element.querySelector<HTMLElement>('.panel');
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (currentIndex === -1 || (!event.shiftKey && currentIndex === focusable.length - 1)) {
      event.preventDefault();
      focusable[0].focus();
    } else if (event.shiftKey && currentIndex === 0) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    }
  }

  private close(reason: GtOverlayCloseReason): void {
    if (!this.open) return;
    this.open = false;
    this.openChange.emit({ open: false, reason });
  }

  private beginClose(): void {
    if (!this.portal || this.portal.element.dataset.state === 'closing') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.finishClose();
      return;
    }
    this.portal.element.dataset.state = 'closing';
    this.closingPanel =
      this.portal.element.querySelector<HTMLElement>('[part="panel"]') ?? undefined;
    this.closingPanel?.addEventListener('animationend', this.handleExitEnd);
    // A hidden window or a consumer disabling animation must still release the portal.
    this.closeTimer = window.setTimeout(() => this.finishClose(), 260);
  }

  private handleExitEnd = (event: Event): void => {
    if (event.target === this.closingPanel) this.finishClose();
  };

  private cancelClose(): void {
    if (this.closeTimer !== undefined) window.clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    this.closingPanel?.removeEventListener('animationend', this.handleExitEnd);
    this.closingPanel = undefined;
  }

  private finishClose(): void {
    if (this.open || !this.portal) return;
    this.removePortal();
    this.afterClose.emit();
  }

  private removePortal(): void {
    this.cancelClose();
    if (!this.portal) return;
    this.portal.destroy();
    this.portal = undefined;
    this.host.append(...this.contentNodes);
    this.contentNodes = [];
    this.trigger?.focus();
    this.trigger = undefined;
  }

  render() {
    return (
      <Host>
        <span part="base">
          <slot />
        </span>
      </Host>
    );
  }
}
