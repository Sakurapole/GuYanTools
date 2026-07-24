import { GuYanElement, escapeHtml } from './base';
import { type OpenChangeDetail, OverlayPortal, type OverlayCloseReason } from './overlay';

export class GuYanDialogElement extends GuYanElement {
  static observedAttributes = ['open', 'close-on-mask', 'close-on-esc', 'persistent', 'aria-label'];
  private portal: OverlayPortal | null = null;
  private contentNodes: Node[] = [];
  private trigger: HTMLElement | null = null;
  private readonly keyboardListener = (event: KeyboardEvent) => this.handleKeydown(event);

  get open(): boolean { return this.booleanAttribute('open'); }
  set open(value: boolean) { this.reflectBoolean('open', value); }

  connectedCallback(): void { super.connectedCallback(); this.syncPortal(); }
  disconnectedCallback(): void { this.closePortal(); }
  attributeChangedCallback(): void { super.attributeChangedCallback(); this.syncPortal(); }

  protected render(): void {
    this.root.innerHTML = `<style>:host{display:none}:host([open]){display:contents}</style><slot></slot>`;
  }

  close(reason: OverlayCloseReason = 'programmatic'): void {
    if (!this.open) return;
    this.open = false;
    this.emit<OpenChangeDetail>('gt-open-change', { open: false, reason });
  }

  private syncPortal(): void {
    if (!this.isConnected) return;
    if (this.open && !this.portal) {
      this.trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const content = document.createDocumentFragment();
      this.contentNodes = Array.from(this.childNodes);
      content.append(...this.contentNodes);
      this.portal = new OverlayPortal(this.overlayType, content, () => {
        if (!this.booleanAttribute('persistent') && this.closeOnMask) this.close('mask');
      });
      const panel = this.portal.element.querySelector<HTMLElement>('.panel')!;
      panel.setAttribute('aria-label', this.stringAttribute('aria-label', 'Dialog'));
      panel.dataset.position = this.stringAttribute('position', 'right');
      if (this.overlayType === 'drawer') {
        panel.style.width = this.stringAttribute('width', '400px');
        if (panel.dataset.position === 'left') panel.style.marginLeft = '0';
      }
      window.addEventListener('keydown', this.keyboardListener);
      queueMicrotask(() => this.portal?.element.querySelector<HTMLElement>('.panel')?.focus());
    } else if (!this.open) this.closePortal();
  }

  private get closeOnMask(): boolean { return this.getAttribute('close-on-mask') !== 'false'; }
  private get closeOnEsc(): boolean { return this.getAttribute('close-on-esc') !== 'false'; }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.closeOnEsc && !this.booleanAttribute('persistent')) {
      event.preventDefault();
      this.close('escape');
    }
  }

  private closePortal(): void {
    if (!this.portal) return;
    window.removeEventListener('keydown', this.keyboardListener);
    this.portal.destroy();
    this.portal = null;
    this.append(...this.contentNodes);
    this.contentNodes = [];
    this.trigger?.focus();
    this.trigger = null;
  }

  protected get overlayType(): 'dialog' | 'drawer' { return 'dialog'; }
}
