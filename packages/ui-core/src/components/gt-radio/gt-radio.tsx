import { Component, Element, Event, h, Host, Prop, State, type EventEmitter } from '@stencil/core';

export interface GtRadioChangeDetail {
  checked: boolean;
  value: string;
}

@Component({ tag: 'gt-radio', shadow: true, styleUrl: 'gt-radio.css' })
export class GtRadio {
  @Prop({ mutable: true, reflect: true }) checked = false;
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) size: 'sm' | 'md' = 'md';
  @Prop() label = '';
  @Prop() name = '';
  @Prop() value = '';

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtRadioChangeDetail>;

  @Element() host!: HTMLElement;
  private labelSlot?: HTMLSlotElement;
  @State() private hasLabelSlot = false;

  componentDidLoad(): void {
    this.syncLabelSlot();
  }

  private handleChange = (event: Event): void => {
    this.checked = (event.target as HTMLInputElement).checked;
    this.change.emit({ checked: this.checked, value: this.value });
  };

  private syncLabelSlot = (): void => {
    this.hasLabelSlot = Boolean(this.labelSlot?.assignedNodes({ flatten: true })
      .some(node => node.nodeType !== 3 || Boolean(node.textContent?.trim())));
  };

  render() {
    const hasLabel = Boolean(this.label) || this.hasLabelSlot;

    return (
      <Host>
        <label part="base">
          <input part="input" checked={this.checked} disabled={this.disabled} id={this.host.id || undefined} name={this.name} type="radio" value={this.value} onChange={this.handleChange} />
          <span part="control" class="mark" aria-hidden="true"><span class="dot" /></span>
          <span part="label" class="label" hidden={!hasLabel}><slot ref={(element) => { this.labelSlot = element; }} onSlotchange={this.syncLabelSlot}>{this.label}</slot></span>
        </label>
      </Host>
    );
  }
}
