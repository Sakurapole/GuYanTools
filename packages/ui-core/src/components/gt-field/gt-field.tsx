import { Component, h, Host, Prop } from '@stencil/core';

@Component({ tag: 'gt-field', shadow: true })
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
        <style>{`:host{display:block;color:var(--gt-color-text);font-family:var(--gt-font-family)}.field{display:grid;gap:var(--gt-space-sm)}:host([layout="horizontal"]) .field{grid-template-columns:minmax(96px,132px) minmax(0,1fr);column-gap:var(--gt-space-lg)}label{font-size:var(--gt-font-size-md);font-weight:600}.required,.error{color:var(--gt-color-danger)}.hint,.error{margin:0;font-size:var(--gt-font-size-sm);color:var(--gt-color-text-muted)}.error{color:var(--gt-color-danger)}.meta{min-height:18px}:host([layout="horizontal"]) .meta{grid-column:2}`}</style>
        <div class="field">
          {this.label ? <label htmlFor={this.htmlFor}>{this.label}{this.required ? <span class="required">*</span> : null}</label> : <slot name="label" />}
          <div><slot /></div>
          <div class="meta">
            {this.error ? <p class="error">{this.error}</p> : null}
            {!this.error && this.hint ? <p class="hint">{this.hint}</p> : null}
            <slot name="error" />
            <slot name="hint" />
          </div>
        </div>
      </Host>
    );
  }
}
