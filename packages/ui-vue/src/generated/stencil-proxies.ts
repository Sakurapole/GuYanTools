/* eslint-disable */
/* tslint:disable */
/* auto-generated vue proxies */
import { defineContainer, type StencilVueComponent } from '@stencil/vue-output-target/runtime';

import type { JSX } from '@guyantools/ui-core/dist/custom-elements';

import { defineCustomElement as defineGtButton } from '@guyantools/ui-core/dist/custom-elements/gt-button.js';
import { defineCustomElement as defineGtCard } from '@guyantools/ui-core/dist/custom-elements/gt-card.js';
import { defineCustomElement as defineGtEmptyState } from '@guyantools/ui-core/dist/custom-elements/gt-empty-state.js';
import { defineCustomElement as defineGtField } from '@guyantools/ui-core/dist/custom-elements/gt-field.js';
import { defineCustomElement as defineGtIconButton } from '@guyantools/ui-core/dist/custom-elements/gt-icon-button.js';
import { defineCustomElement as defineGtStateCard } from '@guyantools/ui-core/dist/custom-elements/gt-state-card.js';



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


export const GtStateCard: StencilVueComponent<JSX.GtStateCard> = /*@__PURE__*/ defineContainer<JSX.GtStateCard>('gt-state-card', defineGtStateCard, [
  'state',
  'description',
  'compact'
]);
