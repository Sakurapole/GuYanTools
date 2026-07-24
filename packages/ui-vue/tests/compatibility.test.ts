import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { UiEmptyState, UiTextarea, UiTooltip } from '../src';

describe('Vue adapter compatibility', () => {
  it('preserves textarea events, empty-state actions, and tooltip content', async () => {
    const textarea = mount(UiTextarea, { props: { modelValue: 'before' } });
    await textarea.find('gt-textarea').trigger('gt-input', { detail: { value: 'after' } });
    const empty = mount(UiEmptyState, { props: { title: 'No plugins' }, slots: { default: '<button>Create</button>' } });
    const tooltip = mount(UiTooltip, { props: { content: 'Plugin help' }, slots: { default: '<button>?</button>' } });

    expect(textarea.emitted('update:modelValue')).toEqual([['after']]);
    expect(empty.text()).toContain('Create');
    expect(tooltip.text()).toContain('?');
  });
});
