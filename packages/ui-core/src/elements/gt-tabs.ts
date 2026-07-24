import { GuYanElement, escapeHtml } from './base';

export interface TabChangeDetail { value: string; }
export interface GuYanTabItem { value: string; label: string; disabled?: boolean; }

export class GuYanTabsElement extends GuYanElement {
  static observedAttributes = ['value', 'variant', 'size', 'stretch'];
  private tabItems: GuYanTabItem[] = [];
  get value(): string { return this.stringAttribute('value'); }
  set value(value: string) { this.reflectString('value', value); }
  get items(): GuYanTabItem[] { return this.tabItems; }
  set items(value: GuYanTabItem[]) { this.tabItems = value; this.render(); }
  protected render(): void {
    const tabs = this.tabItems.map(item => `<button type="button" role="tab" data-value="${escapeHtml(item.value)}" aria-selected="${item.value === this.value}" ${item.disabled ? 'disabled' : ''}>${escapeHtml(item.label)}</button>`).join('');
    this.root.innerHTML = `<style>:host{display:block;font-family:var(--gt-font-family)}[role="tablist"]{display:flex;gap:var(--gt-space-xs);border-bottom:1px solid var(--gt-color-border)}:host([stretch]) button{flex:1}button{min-height:var(--gt-control-height-md);border:0;border-bottom:2px solid transparent;background:transparent;color:var(--gt-color-text-muted);font:inherit;cursor:pointer}button[aria-selected="true"]{border-color:var(--gt-color-primary);color:var(--gt-color-text)}button:focus-visible{outline:none;box-shadow:var(--gt-focus-ring)}button:disabled{cursor:not-allowed;opacity:.5}</style><div role="tablist">${tabs}</div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach(tab => {
      tab.addEventListener('click', () => {
        if (!tab.disabled) {
          this.value = tab.dataset.value ?? '';
          this.emit<TabChangeDetail>('gt-change', { value: this.value });
        }
      });
    });
  }
}
