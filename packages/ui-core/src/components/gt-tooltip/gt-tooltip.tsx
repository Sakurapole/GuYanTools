import { Component, Element, h, Host, Listen, Prop, Watch } from '@stencil/core';

import { computeOverlayPlacement, OverlayPortal, type OverlayPlacement } from '../../utils/overlay-controller';

@Component({ tag: 'gt-tooltip', shadow: true })
export class GtTooltip {
  @Prop({ mutable: true, reflect: true }) open = false;
  @Prop() content = '';
  @Prop({ reflect: true }) placement: OverlayPlacement = 'top';
  @Prop() delay = 300;
  @Prop({ reflect: true }) disabled = false;
  @Element() host!: HTMLElement;

  private portal?: OverlayPortal;
  private showTimer?: number;

  componentDidLoad(): void {
    this.syncPortal();
  }

  disconnectedCallback(): void {
    this.close();
  }

  @Watch('open')
  syncPortal(): void {
    if (!this.open || this.disabled) {
      this.removePortal();
      return;
    }
    if (this.portal) return;

    this.portal = new OverlayPortal('tooltip', this.content);
    this.positionPortal();
    this.portal.element.addEventListener('gt-overlay-reposition', () => this.positionPortal());
  }

  @Listen('mouseenter')
  scheduleOpen(): void {
    if (this.disabled) return;
    window.clearTimeout(this.showTimer);
    this.showTimer = window.setTimeout(() => { this.open = true; }, Number(this.delay) || 0);
  }

  @Listen('mouseleave')
  close(): void {
    window.clearTimeout(this.showTimer);
    this.showTimer = undefined;
    this.open = false;
    this.removePortal();
  }

  private positionPortal(): void {
    const panel = this.portal?.element.querySelector<HTMLElement>('.panel');
    if (!panel) return;
    const anchor = this.host.getBoundingClientRect();
    const placement = computeOverlayPlacement(this.placement, anchor, panel.getBoundingClientRect(), {
      height: window.innerHeight,
      width: window.innerWidth,
    });
    panel.dataset.placement = placement;
    panel.style.left = `${placement === 'left' ? anchor.left - panel.offsetWidth : placement === 'right' ? anchor.right : anchor.left}px`;
    panel.style.top = `${placement === 'top' ? anchor.top - panel.offsetHeight : placement === 'bottom' ? anchor.bottom : anchor.top}px`;
  }

  private removePortal(): void {
    this.portal?.destroy();
    this.portal = undefined;
  }

  render() {
    return <Host><slot /></Host>;
  }
}
