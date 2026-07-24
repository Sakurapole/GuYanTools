import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiInput from './UiInput.vue';
import UiTabs from './UiTabs.vue';

describe('shared UI library compatibility entries', () => {
  it('delegates input v-model updates to the Stencil-backed Vue package', async () => {
    const input = mount(UiInput, { props: { modelValue: 'one' } });

    await input.find('gt-input').trigger('gt-input', { detail: { value: 'two' } });

    expect(input.emitted('update:modelValue')).toEqual([['two']]);
  });

  it('delegates tab changes to the shared UI library', async () => {
    const tabs = mount(UiTabs, {
      props: { modelValue: 'overview', items: [{ key: 'details', label: 'Details' }] },
    });

    await tabs.find('gt-tabs').trigger('gt-change', { detail: { value: 'details' } });

    expect(tabs.emitted('update:modelValue')).toEqual([['details']]);
  });
});
