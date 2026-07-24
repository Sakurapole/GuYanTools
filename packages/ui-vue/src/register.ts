import { defineCustomElements } from '@guyantools/ui-core';

// Generated proxies carry Vue event/property metadata; wrappers retain legacy APIs.
import './generated/stencil-proxies';

let registered = false;

export function ensureGuYanElements(): void {
  if (!registered && typeof window !== 'undefined') {
    defineCustomElements();
    registered = true;
  }
}
