import { registerGuYanElements } from '@guyantools/ui-core';

let registered = false;

export function ensureGuYanElements(): void {
  if (!registered && typeof window !== 'undefined') {
    registerGuYanElements();
    registered = true;
  }
}
