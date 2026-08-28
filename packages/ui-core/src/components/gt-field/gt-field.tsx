import { Component, h, Host, Prop, State } from '@stencil/core';

@Component({ tag: 'gt-field', shadow: true, styleUrl: 'gt-field.css' })
export class GtField {
  @Prop() label = '';
  @Prop() hint = '';
  @Prop() error = '';
  @Prop({ reflect: true }) required = false;
  @Prop({ attribute: 'for' }) htmlFor = '';
  @Prop({ reflect: true }) layout: 'horizontal' | 'vertical' = 'vertical';
  @State() private hasLabelSlot = false;
  @State() private hasErrorSlot = false;
  @State() private hasHintSlot = false;

  private labelSlot?: HTMLSlotElement;
  private errorSlot?: HTMLSlotElement;
  private hintSlot?: HTMLSlotElement;

  componentDidLoad(): void {
    this.syncSlots();
  }

  private syncSlots = (): void => {
    this.hasLabelSlot = this.slotHasContent(this.labelSlot);
    this.hasErrorSlot = this.slotHasContent(this.errorSlot);
    this.hasHintSlot = this.slotHasContent(this.hintSlot);
  };

  private slotHasContent(slot?: HTMLSlotElement): boolean {
    return Boolean(slot?.assignedNodes({ flatten: true }).some(node => node.nodeType !== 3 || Boolean(node.textContent?.trim())));
  }

  render() {
    const hasLabel = Boolean(this.label) || this.hasLabelSlot;
    const hasMeta = Boolean(this.error) || this.hasErrorSlot || Boolean(this.hint) || this.hasHintSlot;
    const showError = !this.hasErrorSlot && Boolean(this.error);
    const showHintSlot = !this.hasErrorSlot && !this.error && this.hasHintSlot;
    const showHint = !this.hasErrorSlot && !this.error && !this.hasHintSlot && Boolean(this.hint);

    return (
      <Host>
        <div part="base" class="field">
          <label part="label" class="field-label" hidden={!hasLabel} htmlFor={this.htmlFor}>
            <span class="slot" hidden={!this.hasLabelSlot}>
              <slot name="label" ref={(element) => { this.labelSlot = element; }} onSlotchange={this.syncSlots} />
            </span>
            {!this.hasLabelSlot ? this.label : null}
            {this.required ? <span part="required" class="required">*</span> : null}
          </label>
          <div part="body"><slot /></div>
          <div part="meta" class="meta" hidden={!hasMeta}>
            <span class="slot" hidden={!this.hasErrorSlot}>
              <slot name="error" ref={(element) => { this.errorSlot = element; }} onSlotchange={this.syncSlots} />
            </span>
            {showError ? <p part="error" class="error">{this.error}</p> : null}
            <span class="slot" hidden={!showHintSlot}>
              <slot name="hint" ref={(element) => { this.hintSlot = element; }} onSlotchange={this.syncSlots} />
            </span>
            {showHint ? <p part="hint" class="hint">{this.hint}</p> : null}
          </div>
        </div>
      </Host>
    );
  }
}
