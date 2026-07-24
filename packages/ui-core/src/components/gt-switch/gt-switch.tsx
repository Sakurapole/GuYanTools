import { Component, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

export interface GtSwitchChangeDetail {
  checked: boolean;
}

@Component({ tag: 'gt-switch', shadow: true })
export class GtSwitch {
  @Prop({ mutable: true, reflect: true }) checked = false;
  @Prop({ reflect: true }) disabled = false;
  @Prop({ attribute: 'aria-label' }) ariaLabel = '';

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtSwitchChangeDetail>;

  private toggle = (): void => {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.change.emit({ checked: this.checked });
  };

  render() {
    return (
      <Host>
        <style>{`:host{display:inline-block}button{width:38px;height:22px;padding:2px;border:0;border-radius:999px;background:var(--gt-color-border);cursor:pointer}span{display:block;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform var(--gt-motion-normal) var(--gt-motion-ease)}:host([checked]) button{background:var(--gt-color-primary)}:host([checked]) span{transform:translateX(16px)}button:focus-visible{outline:none;box-shadow:var(--gt-focus-ring)}button:disabled{cursor:not-allowed;opacity:.56}`}</style>
        <button aria-checked={String(this.checked)} aria-label={this.ariaLabel} disabled={this.disabled} role="switch" type="button" onClick={this.toggle}><span /></button>
      </Host>
    );
  }
}
