import { Component, Element, Event, h, Host, Prop, State, type EventEmitter } from '@stencil/core';

export interface GtCheckedChangeDetail {
  checked: boolean;
  indeterminate?: boolean;
}

@Component({ tag: 'gt-checkbox', shadow: true, styleUrl: 'gt-checkbox.css' })
export class GtCheckbox {
  @Prop({ mutable: true, reflect: true }) checked = false;
  @Prop({ mutable: true, reflect: true }) indeterminate = false;
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) size: 'sm' | 'md' = 'md';
  @Prop() label = '';
  @Prop() name = '';
  @Prop() value = '';

  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtCheckedChangeDetail>;

  @Element() host!: HTMLElement;
  private checkbox?: HTMLInputElement;
  private labelSlot?: HTMLSlotElement;
  @State() private hasLabelSlot = false;

  componentDidLoad(): void {
    this.syncLabelSlot();
  }

  componentDidRender(): void {
    if (this.checkbox) this.checkbox.indeterminate = this.indeterminate;
  }

  private handleChange = (event: Event): void => {
    this.checked = (event.target as HTMLInputElement).checked;
    this.indeterminate = false;
    this.change.emit({ checked: this.checked, indeterminate: false });
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
          <input part="input" ref={(element) => { this.checkbox = element; }} checked={this.checked} disabled={this.disabled} id={this.host.id || undefined} name={this.name} type="checkbox" value={this.value} onChange={this.handleChange} />
          <span part="control" class="box" aria-hidden="true">
            {this.checked && !this.indeterminate ? <svg class="icon" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg> : null}
            {this.indeterminate ? <svg class="icon" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7H11" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg> : null}
          </span>
          <span part="label" class="label" hidden={!hasLabel}><slot ref={(element) => { this.labelSlot = element; }} onSlotchange={this.syncLabelSlot}>{this.label}</slot></span>
        </label>
      </Host>
    );
  }
}
