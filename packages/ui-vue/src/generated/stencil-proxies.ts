/* eslint-disable */
/* tslint:disable */
/* auto-generated vue proxies */
import { defineContainer, type StencilVueComponent } from '@stencil/vue-output-target/runtime';

import type { JSX } from '@guyantools/ui-core/dist/custom-elements';

import { defineCustomElement as defineGtButton } from '@guyantools/ui-core/dist/custom-elements/gt-button.js';
import { defineCustomElement as defineGtCard } from '@guyantools/ui-core/dist/custom-elements/gt-card.js';
import { defineCustomElement as defineGtCheckbox } from '@guyantools/ui-core/dist/custom-elements/gt-checkbox.js';
import { defineCustomElement as defineGtDialog } from '@guyantools/ui-core/dist/custom-elements/gt-dialog.js';
import { defineCustomElement as defineGtDrawer } from '@guyantools/ui-core/dist/custom-elements/gt-drawer.js';
import { defineCustomElement as defineGtEmptyState } from '@guyantools/ui-core/dist/custom-elements/gt-empty-state.js';
import { defineCustomElement as defineGtField } from '@guyantools/ui-core/dist/custom-elements/gt-field.js';
import { defineCustomElement as defineGtIconButton } from '@guyantools/ui-core/dist/custom-elements/gt-icon-button.js';
import { defineCustomElement as defineGtInput } from '@guyantools/ui-core/dist/custom-elements/gt-input.js';
import { defineCustomElement as defineGtRadio } from '@guyantools/ui-core/dist/custom-elements/gt-radio.js';
import { defineCustomElement as defineGtStateCard } from '@guyantools/ui-core/dist/custom-elements/gt-state-card.js';
import { defineCustomElement as defineGtSwitch } from '@guyantools/ui-core/dist/custom-elements/gt-switch.js';
import { defineCustomElement as defineGtTabs } from '@guyantools/ui-core/dist/custom-elements/gt-tabs.js';
import { defineCustomElement as defineGtTextarea } from '@guyantools/ui-core/dist/custom-elements/gt-textarea.js';
import { defineCustomElement as defineGtTooltip } from '@guyantools/ui-core/dist/custom-elements/gt-tooltip.js';



export const GtButton: StencilVueComponent<JSX.GtButton> = /*@__PURE__*/ defineContainer<JSX.GtButton>('gt-button', defineGtButton, [
  'variant',
  'size',
  'disabled',
  'active',
  'block',
  'type',
  'gt-click'
], [
  'gt-click'
]);


export const GtCard: StencilVueComponent<JSX.GtCard> = /*@__PURE__*/ defineContainer<JSX.GtCard>('gt-card', defineGtCard, [
  'variant',
  'padding',
  'radius',
  'hoverable',
  'interactive'
]);


export const GtCheckbox: StencilVueComponent<JSX.GtCheckbox> = /*@__PURE__*/ defineContainer<JSX.GtCheckbox>('gt-checkbox', defineGtCheckbox, [
  'checked',
  'indeterminate',
  'disabled',
  'label',
  'name',
  'value',
  'gt-change'
], [
  'gt-change'
]);


export const GtDialog: StencilVueComponent<JSX.GtDialog> = /*@__PURE__*/ defineContainer<JSX.GtDialog>('gt-dialog', defineGtDialog, [
  'open',
  'modal',
  'closeOnMask',
  'closeOnEsc',
  'persistent',
  'ariaLabel',
  'gt-open-change'
], [
  'gt-open-change'
]);


export const GtDrawer: StencilVueComponent<JSX.GtDrawer> = /*@__PURE__*/ defineContainer<JSX.GtDrawer>('gt-drawer', defineGtDrawer, [
  'open',
  'position',
  'width',
  'overlay',
  'closeOnMask',
  'closeOnEsc',
  'persistent',
  'ariaLabel',
  'gt-open-change'
], [
  'gt-open-change'
]);


export const GtEmptyState: StencilVueComponent<JSX.GtEmptyState> = /*@__PURE__*/ defineContainer<JSX.GtEmptyState>('gt-empty-state', defineGtEmptyState, [
  'description',
  'compact'
]);


export const GtField: StencilVueComponent<JSX.GtField> = /*@__PURE__*/ defineContainer<JSX.GtField>('gt-field', defineGtField, [
  'label',
  'hint',
  'error',
  'required',
  'htmlFor',
  'layout'
]);


export const GtIconButton: StencilVueComponent<JSX.GtIconButton> = /*@__PURE__*/ defineContainer<JSX.GtIconButton>('gt-icon-button', defineGtIconButton, [
  'variant',
  'size',
  'shape',
  'disabled',
  'active',
  'label',
  'ariaLabel',
  'type',
  'gt-click'
], [
  'gt-click'
]);


export const GtInput: StencilVueComponent<JSX.GtInput> = /*@__PURE__*/ defineContainer<JSX.GtInput>('gt-input', defineGtInput, [
  'value',
  'type',
  'placeholder',
  'disabled',
  'readOnly',
  'size',
  'min',
  'max',
  'step',
  'gt-input',
  'gt-change'
], [
  'gt-input',
  'gt-change'
]);


export const GtRadio: StencilVueComponent<JSX.GtRadio> = /*@__PURE__*/ defineContainer<JSX.GtRadio>('gt-radio', defineGtRadio, [
  'checked',
  'disabled',
  'label',
  'name',
  'value',
  'gt-change'
], [
  'gt-change'
]);


export const GtStateCard: StencilVueComponent<JSX.GtStateCard> = /*@__PURE__*/ defineContainer<JSX.GtStateCard>('gt-state-card', defineGtStateCard, [
  'state',
  'description',
  'compact'
]);


export const GtSwitch: StencilVueComponent<JSX.GtSwitch> = /*@__PURE__*/ defineContainer<JSX.GtSwitch>('gt-switch', defineGtSwitch, [
  'checked',
  'disabled',
  'ariaLabel',
  'gt-change'
], [
  'gt-change'
]);


export const GtTabs: StencilVueComponent<JSX.GtTabs> = /*@__PURE__*/ defineContainer<JSX.GtTabs>('gt-tabs', defineGtTabs, [
  'value',
  'items',
  'variant',
  'size',
  'stretch',
  'gt-change'
], [
  'gt-change'
]);


export const GtTextarea: StencilVueComponent<JSX.GtTextarea> = /*@__PURE__*/ defineContainer<JSX.GtTextarea>('gt-textarea', defineGtTextarea, [
  'value',
  'placeholder',
  'disabled',
  'readOnly',
  'rows',
  'maxLength',
  'resize',
  'gt-input',
  'gt-change'
], [
  'gt-input',
  'gt-change'
]);


export const GtTooltip: StencilVueComponent<JSX.GtTooltip> = /*@__PURE__*/ defineContainer<JSX.GtTooltip>('gt-tooltip', defineGtTooltip, [
  'open',
  'content',
  'placement',
  'delay',
  'disabled'
]);
