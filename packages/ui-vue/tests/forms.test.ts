import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { UiCheckbox, UiInput, UiRadio, UiSwitch, UiTabs, type UiTabItem } from '../src';

describe('Vue form adapters', () => {
  it('maps gt-input detail to v-model and preserves exposed focus helpers', async () => {
    const wrapper = mount(UiInput, { props: { modelValue: 'before' } });
    await wrapper.find('gt-input').trigger('gt-input', { detail: { value: 'after' } });

    expect(wrapper.emitted('update:modelValue')).toEqual([['after']]);
    expect(typeof (wrapper.vm as unknown as { focus: () => void }).focus).toBe('function');
    expect(typeof (wrapper.vm as unknown as { select: () => void }).select).toBe('function');
  });

  it('only reserves input prefix and suffix slots when supplied', () => {
    const plain = mount(UiInput, { props: { modelValue: 'new-folder' } });
    expect(plain.find('[slot="prefix"]').exists()).toBe(false);
    expect(plain.find('[slot="suffix"]').exists()).toBe(false);

    const decorated = mount(UiInput, {
      props: { modelValue: 'search' },
      slots: { prefix: '<span>🔎</span>', suffix: '<button>×</button>' },
    });
    expect(decorated.find('[slot="prefix"]').text()).toBe('🔎');
    expect(decorated.find('[slot="suffix"]').text()).toBe('×');
  });

  it('maps selection controls and tabs to their Vue API', async () => {
    const items: UiTabItem[] = [{ key: 'overview', label: 'Overview' }];
    const checkbox = mount(UiCheckbox, { props: { modelValue: false } });
    const radio = mount(UiRadio, { props: { modelValue: 'one', value: 'two' } });
    const toggle = mount(UiSwitch, { props: { modelValue: false } });
    const tabs = mount(UiTabs, { props: { modelValue: 'overview', items } });

    await checkbox.find('gt-checkbox').trigger('gt-change', { detail: { checked: true } });
    await radio.find('gt-radio').trigger('gt-change', { detail: { checked: true } });
    await toggle.find('gt-switch').trigger('gt-change', { detail: { checked: true } });
    await tabs.find('gt-tabs').trigger('gt-change', { detail: { value: 'overview' } });

    expect(checkbox.emitted('change')).toEqual([[true]]);
    expect(radio.emitted('update:modelValue')).toEqual([['two']]);
    expect(toggle.emitted('update:modelValue')).toEqual([[true]]);
    expect(tabs.emitted('change')).toEqual([['overview']]);
  });
});
