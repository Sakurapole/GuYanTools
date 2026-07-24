import { GuYanElement, escapeHtml } from './base';
import { computeOverlayPlacement, type OverlayPlacement, OverlayPortal } from './overlay';

export class GuYanTooltipElement extends GuYanElement {
  static observedAttributes = ['open', 'content', 'placement', 'delay', 'disabled'];
  private portal: OverlayPortal | null = null;
  private showTimer: number | undefined;
  private readonly openListener = () => this.scheduleOpen();
  private readonly closeListener = () => this.close();

  get open(): boolean { return this.booleanAttribute('open'); }
  set open(value: boolean) { this.reflectBoolean('open', value); }

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mouseenter', this.openListener);
    this.addEventListener('mouseleave', this.closeListener);
    this.syncPortal();
  }

  disconnectedCallback(): void {
    this.removeEventListener('mouseenter', this.openListener);
    this.removeEventListener('mouseleave', this.closeListener);
    window.clearTimeout(this.showTimer);
    this.close();
  }

  attributeChangedCallback(): void { super.attributeChangedCallback(); this.syncPortal(); }

  protected render(): void { this.root.innerHTML = '<slot></slot>'; }

  private scheduleOpen(): void {
    if (this.booleanAttribute('disabled')) return;
    window.clearTimeout(this.showTimer);
    this.showTimer = window.setTimeout(() => { this.open = true; }, Number(this.stringAttribute('delay', '300')) || 0);
  }

  private syncPortal(): void {
    if (!this.isConnected || !this.open || this.booleanAttribute('disabled') || this.portal) return;
    this.portal = new OverlayPortal('tooltip', escapeHtml(this.stringAttribute('content')), undefined);
    const panel = this.portal.element.querySelector<HTMLElement>('.panel')!;
    const anchor = this.getBoundingClientRect();
    const placement = computeOverlayPlacement((this.stringAttribute('placement', 'top') as OverlayPlacement), anchor, panel.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
    panel.dataset.placement = placement;
    panel.style.left = `${placement === 'left' ? anchor.left - panel.offsetWidth : placement === 'right' ? anchor.right : anchor.left}px`;
    panel.style.top = `${placement === 'top' ? anchor.top - panel.offsetHeight : placement === 'bottom' ? anchor.bottom : anchor.top}px`;
  }

  private close(): void {
    window.clearTimeout(this.showTimer);
    this.showTimer = undefined;
    this.open = false;
    this.portal?.destroy();
    this.portal = null;
  }
}
