import { Component, Element, Event, h, Host, Prop, type EventEmitter } from '@stencil/core';

import type { GtValueChangeDetail } from '../gt-input/gt-input';

@Component({ tag: 'gt-textarea', shadow: true })
export class GtTextarea {
  @Prop({ mutable: true, reflect: true }) value = '';
  @Prop() placeholder = '';
  @Prop({ reflect: true }) disabled = false;
  @Prop({ attribute: 'readonly', reflect: true }) readOnly = false;
  @Prop() rows = 3;
  @Prop({ attribute: 'maxlength' }) maxLength?: number;
  @Prop() resize: 'none' | 'both' | 'horizontal' | 'vertical' = 'vertical';

  @Event({ eventName: 'gt-input', bubbles: true, composed: true }) input!: EventEmitter<GtValueChangeDetail>;
  @Event({ eventName: 'gt-change', bubbles: true, composed: true }) change!: EventEmitter<GtValueChangeDetail>;

  @Element() host!: HTMLElement & { select?: () => Promise<void> };
  private textareaElement?: HTMLTextAreaElement;

  componentDidLoad(): void {
    Object.assign(this.host, {
      focus: async () => {
        this.textareaElement?.focus();
      },
      select: async () => {
        if (typeof this.textareaElement?.select === 'function') this.textareaElement.select();
      },
    });
  }

  private updateValue(value: string, event: 'input' | 'change'): void {
    this.value = value;
    (event === 'input' ? this.input : this.change).emit({ value });
  }

  render() {
    return (
      <Host>
        <style>{`:host{display:block;font-family:var(--gt-font-family)}textarea{width:100%;box-sizing:border-box;padding:var(--gt-space-sm);border:1px solid var(--gt-color-border);border-radius:var(--gt-radius-sm);background:var(--gt-color-surface);color:var(--gt-color-text);font:inherit;resize:${this.resize}}textarea:focus{outline:0;box-shadow:var(--gt-focus-ring)}textarea:disabled{cursor:not-allowed;opacity:.56}`}</style>
        <textarea
          ref={(element) => { this.textareaElement = element; }}
          disabled={this.disabled}
          maxLength={this.maxLength}
          placeholder={this.placeholder}
          readOnly={this.readOnly}
          rows={this.rows}
          value={this.value}
          onInput={(event) => this.updateValue((event.target as HTMLTextAreaElement).value, 'input')}
          onChange={(event) => this.updateValue((event.target as HTMLTextAreaElement).value, 'change')}
        />
      </Host>
    );
  }
}
