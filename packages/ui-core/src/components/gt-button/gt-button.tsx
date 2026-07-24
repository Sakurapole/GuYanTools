import { Component, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

export interface GtButtonClickDetail {
  disabled: boolean;
}

@Component({
  tag: 'gt-button',
  shadow: true,
})
export class GtButton {
  @Prop({ reflect: true }) variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary';
  @Prop({ reflect: true }) size: 'sm' | 'md' | 'lg' = 'md';
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) active = false;
  @Prop({ reflect: true }) block = false;
  @Prop() type: 'button' | 'submit' | 'reset' = 'button';

  @Event({ eventName: 'gt-click', bubbles: true, composed: true }) click!: EventEmitter<GtButtonClickDetail>;

  private handleClick = (): void => {
    this.click.emit({ disabled: this.disabled });
  };

  render() {
    return (
      <Host>
        <style>{`:host{display:inline-block;font-family:var(--gt-font-family)}:host([block]){display:block}button{display:inline-flex;align-items:center;justify-content:center;gap:var(--gt-space-sm);min-height:var(--gt-control-height-md);padding:0 var(--gt-control-padding-x-md);border:1px solid var(--gt-color-border);border-radius:var(--gt-radius-sm);background:var(--gt-color-surface-muted);color:var(--gt-color-text);cursor:pointer;font:inherit;font-weight:600}:host([size="sm"]) button{min-height:var(--gt-control-height-sm);padding-inline:var(--gt-control-padding-x-sm)}:host([size="lg"]) button{min-height:var(--gt-control-height-lg);padding-inline:var(--gt-control-padding-x-lg)}:host([variant="primary"]) button{background:var(--gt-color-primary);border-color:var(--gt-color-primary);color:var(--gt-color-text-inverse)}:host([variant="danger"]) button{background:var(--gt-color-danger-soft);border-color:transparent;color:var(--gt-color-danger)}:host([variant="ghost"]) button{background:transparent;border-color:transparent}:host([active]) button,button:hover:not(:disabled){box-shadow:var(--gt-focus-ring)}:host([block]) button{width:100%}button:focus-visible{outline:none;box-shadow:var(--gt-focus-ring)}button:disabled{cursor:not-allowed;opacity:.56}.label{min-width:0}`}</style>
        <button disabled={this.disabled} type={this.type} onClick={this.handleClick}>
          <slot name="prefix" />
          <span class="label"><slot /></span>
          <slot name="suffix" />
        </button>
      </Host>
    );
  }
}
