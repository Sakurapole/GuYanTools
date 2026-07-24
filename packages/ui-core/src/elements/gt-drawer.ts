import { GuYanDialogElement } from './gt-dialog';

export class GuYanDrawerElement extends GuYanDialogElement {
  static observedAttributes = ['open', 'close-on-mask', 'close-on-esc', 'persistent', 'aria-label', 'position', 'width', 'overlay'];

  protected get overlayType(): 'drawer' { return 'drawer'; }
}
