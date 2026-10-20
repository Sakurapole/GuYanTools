import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import {
  ensureGuYanElements,
  UiEmptyState,
  UiField,
  UiIconButton,
  UiTextarea,
  UiTooltip,
} from '../src';

describe('Vue adapter compatibility', () => {
  it('exports the shared custom-element registrar', () => {
    expect(ensureGuYanElements).toBeTypeOf('function');
  });

  it('preserves textarea events, empty-state actions, and tooltip content', async () => {
    const textarea = mount(UiTextarea, { props: { modelValue: 'before' } });
    await textarea.find('gt-textarea').trigger('gt-input', { detail: { value: 'after' } });
    const empty = mount(UiEmptyState, {
      props: { title: 'No plugins' },
      slots: { default: '<button>Create</button>' },
    });
    const tooltip = mount(UiTooltip, {
      props: { content: 'Plugin help' },
      slots: { default: '<button>?</button>' },
    });

    expect(textarea.emitted('update:modelValue')).toEqual([['after']]);
    expect(empty.text()).toContain('Create');
    expect(tooltip.text()).toContain('?');
  });

  it('keeps icon-only buttons out of the labeled custom-element mode', () => {
    const iconButton = mount(UiIconButton, {
      attrs: { title: 'Refresh' },
      slots: { default: '<svg viewBox="0 0 16 16" />' },
    });

    expect(iconButton.find('gt-icon-button').attributes('label')).toBeUndefined();
  });

  it('only renders named field slots when content is provided', () => {
    const field = mount(UiField, {
      props: { label: '目录名称', required: true },
      slots: { default: '<input />' },
    });

    expect(field.find('gt-field').exists()).toBe(true);
    expect(field.find('[slot="label"]').exists()).toBe(false);
    expect(field.find('[slot="hint"]').exists()).toBe(false);
    expect(field.find('[slot="error"]').exists()).toBe(false);

    const customLabel = mount(UiField, {
      slots: { label: '<strong>自定义标签</strong>', default: '<input />' },
    });
    expect(customLabel.find('[slot="label"]').text()).toBe('自定义标签');
  });
});
