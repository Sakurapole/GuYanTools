import { GuYanButtonElement } from './elements/gt-button';
import { GuYanCardElement } from './elements/gt-card';
import { GuYanEmptyStateElement } from './elements/gt-empty-state';
import { GuYanFieldElement } from './elements/gt-field';
import { GuYanIconButtonElement } from './elements/gt-icon-button';
import { GuYanStateCardElement } from './elements/gt-state-card';

const definitions: Array<[string, CustomElementConstructor]> = [
  ['gt-button', GuYanButtonElement],
  ['gt-icon-button', GuYanIconButtonElement],
  ['gt-card', GuYanCardElement],
  ['gt-field', GuYanFieldElement],
  ['gt-empty-state', GuYanEmptyStateElement],
  ['gt-state-card', GuYanStateCardElement],
];

export function registerGuYanElements(): void {
  for (const [name, constructor] of definitions) {
    if (!customElements.get(name)) customElements.define(name, constructor);
  }
}
