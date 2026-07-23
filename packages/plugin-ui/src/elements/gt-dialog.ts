import { GuYanElement } from './base';

const styles = `
  :host { display: contents; font-family: var(--gt-font-family); }
  dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); padding: 0; border: 1px solid var(--gt-color-border); border-radius: var(--gt-radius-lg); background: var(--gt-color-surface); color: var(--gt-color-text); box-shadow: var(--gt-shadow-lg); }
  dialog::backdrop { background: var(--gt-color-overlay); }
  dialog:not([open]) { display: none; }
  .dialog__body { padding: 20px; }
`;

export class GuYanDialogElement extends GuYanElement {
  static observedAttributes = ['open'];
  private dialog: HTMLDialogElement;

  constructor() {
    super();
    this.root.innerHTML = `<style>${styles}</style><dialog><div class="dialog__body"><slot></slot></div></dialog>`;
    this.dialog = this.root.querySelector('dialog')!;
    this.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      this.close('cancel');
    });
  }

  get open(): boolean { return this.booleanAttribute('open'); }
  set open(value: boolean) { value ? this.setAttribute('open', '') : this.removeAttribute('open'); }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }

  close(reason = 'close') {
    this.removeAttribute('open');
    this.emit('gt-close', { reason });
  }

  private render() {
    if (this.open && !this.dialog.open) this.dialog.showModal();
    if (!this.open && this.dialog.open) this.dialog.close();
  }
}
