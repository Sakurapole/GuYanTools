import { GuYanProgressElement } from './gt-progress';
import { GuYanBadgeElement } from './gt-badge';
import { GuYanLogViewElement } from './gt-log-view';

let registered = false;

/**
 * Registers lightweight plugin-only elements that complement @guyantools/ui-core.
 * Idempotent; safe to call multiple times.
 */
export function registerGuYanPluginExtras(): void {
  if (registered) return;
  if (!customElements.get('gt-progress'))
    customElements.define('gt-progress', GuYanProgressElement);
  if (!customElements.get('gt-badge')) customElements.define('gt-badge', GuYanBadgeElement);
  if (!customElements.get('gt-log-view')) customElements.define('gt-log-view', GuYanLogViewElement);
  registered = true;
}

export { GuYanProgressElement, GuYanBadgeElement, GuYanLogViewElement };
