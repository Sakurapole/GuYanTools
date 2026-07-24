import { Component, Element, Event, h, Host, Prop, Watch, type EventEmitter } from '@stencil/core';

import { OverlayPortal } from '../../utils/overlay-controller';

export type GtOverlayCloseReason = 'escape' | 'mask' | 'programmatic';

export interface GtOpenChangeDetail {
  open: boolean;
  reason: GtOverlayCloseReason;
}

@Component({ tag: 'gt-dialog', shadow: true })
export class GtDialog {
  @Prop({ mutable: true, reflect: true }) open = false;
  @Prop({ reflect: true }) modal = true;
  @Prop({ attribute: 'close-on-mask' }) closeOnMask = true;
  @Prop({ attribute: 'close-on-esc' }) closeOnEsc = true;
  @Prop({ reflect: true }) persistent = false;
  @Prop({ attribute: 'aria-label' }) ariaLabel = 'Dialog';
  @Element() host!: HTMLElement;

  @Event({ eventName: 'gt-open-change', bubbles: true, composed: true }) openChange!: EventEmitter<GtOpenChangeDetail>;

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
      this.removePortal();
      return;
    }
    if (this.portal) return;

    this.trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const content = document.createDocumentFragment();
    this.contentNodes = Array.from(this.host.childNodes);
    content.append(...this.contentNodes);
    this.portal = new OverlayPortal('dialog', content, () => {
      if (!this.persistent && this.closeOnMask) this.close('mask');
    });
    const panel = this.portal.element.querySelector<HTMLElement>('.panel');
    panel?.setAttribute('aria-label', this.ariaLabel);
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
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
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

  private removePortal(): void {
    if (!this.portal) return;
    this.portal.destroy();
    this.portal = undefined;
    this.host.append(...this.contentNodes);
    this.contentNodes = [];
    this.trigger?.focus();
    this.trigger = undefined;
  }

  render() {
    return <Host><style>{`:host{display:none}:host([open]){display:contents}`}</style><slot /></Host>;
  }
}
