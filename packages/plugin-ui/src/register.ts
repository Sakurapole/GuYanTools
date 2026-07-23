import { GuYanButtonElement } from './elements/gt-button';
import { GuYanCardElement } from './elements/gt-card';
import { GuYanDialogElement } from './elements/gt-dialog';
import { GuYanInputElement } from './elements/gt-input';

const definitions: Array<[string, CustomElementConstructor]> = [
  ['gt-button', GuYanButtonElement],
  ['gt-input', GuYanInputElement],
  ['gt-card', GuYanCardElement],
  ['gt-dialog', GuYanDialogElement],
];

export function registerGuYanElements(): void {
  for (const [name, constructor] of definitions) {
    if (!customElements.get(name)) customElements.define(name, constructor);
  }
}
