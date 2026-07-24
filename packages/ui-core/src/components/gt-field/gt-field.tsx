import { Component, h, Host, Prop } from '@stencil/core';

@Component({ tag: 'gt-field', shadow: true, styleUrl: 'gt-field.css' })
export class GtField {
  @Prop() label = '';
  @Prop() hint = '';
  @Prop() error = '';
  @Prop({ reflect: true }) required = false;
  @Prop({ attribute: 'for' }) htmlFor = '';
  @Prop({ reflect: true }) layout: 'horizontal' | 'vertical' = 'vertical';

  render() {
    return (
      <Host>
        <div part="base" class="field">
          {this.label ? <label part="label" htmlFor={this.htmlFor}>{this.label}{this.required ? <span class="required">*</span> : null}</label> : <slot name="label" />}
          <div part="body"><slot /></div>
          <div class="meta">
            {this.error ? <p part="error" class="error">{this.error}</p> : null}
            {!this.error && this.hint ? <p part="hint" class="hint">{this.hint}</p> : null}
            <slot name="error" />
            <slot name="hint" />
          </div>
        </div>
      </Host>
    );
  }
}
