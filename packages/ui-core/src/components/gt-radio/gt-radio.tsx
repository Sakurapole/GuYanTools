import { Component, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

export interface GtRadioChangeDetail {
  checked: boolean;
}

@Component({ tag: 'gt-radio', shadow: true })
export class GtRadio {
  @Prop({ mutable: true, reflect: true }) checked = false;
  @Prop({ reflect: true }) disabled = false;
  @Prop() label = '';
  @Prop() name = '';
  @Prop() value = '';

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtRadioChangeDetail>;

  private handleChange = (event: Event): void => {
    this.checked = (event.target as HTMLInputElement).checked;
    this.change.emit({ checked: this.checked });
  };

  render() {
    return (
      <Host>
        <style>{`:host{display:inline-block;font-family:var(--gt-font-family)}label{display:inline-flex;align-items:center;gap:var(--gt-space-sm);color:var(--gt-color-text);cursor:pointer}input{accent-color:var(--gt-color-primary)}input:disabled+span{cursor:not-allowed;opacity:.56}`}</style>
        <label>
          <input checked={this.checked} disabled={this.disabled} name={this.name} type="radio" value={this.value} onChange={this.handleChange} />
          <span><slot>{this.label}</slot></span>
        </label>
      </Host>
    );
  }
}
