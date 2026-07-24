import { GuYanButtonElement } from './elements/gt-button';
import { GuYanCardElement } from './elements/gt-card';
import { GuYanCheckboxElement } from './elements/gt-checkbox';
import { GuYanEmptyStateElement } from './elements/gt-empty-state';
import { GuYanFieldElement } from './elements/gt-field';
import { GuYanIconButtonElement } from './elements/gt-icon-button';
import { GuYanInputElement } from './elements/gt-input';
import { GuYanRadioElement } from './elements/gt-radio';
import { GuYanStateCardElement } from './elements/gt-state-card';
import { GuYanSwitchElement } from './elements/gt-switch';
import { GuYanTabsElement } from './elements/gt-tabs';
import { GuYanTextareaElement } from './elements/gt-textarea';

const definitions: Array<[string, CustomElementConstructor]> = [
  ['gt-button', GuYanButtonElement],
  ['gt-checkbox', GuYanCheckboxElement],
  ['gt-icon-button', GuYanIconButtonElement],
  ['gt-input', GuYanInputElement],
  ['gt-radio', GuYanRadioElement],
  ['gt-card', GuYanCardElement],
  ['gt-field', GuYanFieldElement],
  ['gt-empty-state', GuYanEmptyStateElement],
  ['gt-state-card', GuYanStateCardElement],
  ['gt-switch', GuYanSwitchElement],
  ['gt-tabs', GuYanTabsElement],
  ['gt-textarea', GuYanTextareaElement],
];

export function registerGuYanElements(): void {
  for (const [name, constructor] of definitions) {
    if (!customElements.get(name)) customElements.define(name, constructor);
  }
}
