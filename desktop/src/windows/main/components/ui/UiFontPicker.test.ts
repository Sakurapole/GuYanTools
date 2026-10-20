import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import UiFontPicker from './UiFontPicker.vue';

const InputStub = {
  name: 'UiInput',
  props: ['modelValue'],
  emits: ['update:modelValue', 'focus', 'keydown'],
  template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @focus="$emit(\'focus\')" @keydown="$emit(\'keydown\', $event)" />',
};

describe('UiFontPicker', () => {
  it('filters local fonts and emits only a selected installed family', async () => {
    const wrapper = mount(UiFontPicker, {
      attachTo: document.body,
      props: {
        modelValue: 'system-default',
        options: [
          { label: '系统默认', value: 'system-default' },
          { label: 'Cascadia Code', value: 'Cascadia Code' },
          { label: 'Consolas', value: 'Consolas' },
        ],
      },
      global: { stubs: { UiInput: InputStub } },
    });

    await wrapper.find('input').trigger('focus');
    await wrapper.find('input').setValue('cas');
    await nextTick();
    expect(document.body.querySelectorAll('.ui-font-picker__option')).toHaveLength(1);
    expect(document.body.querySelector('.ui-font-picker__option')?.textContent).toBe('Cascadia Code');

    (document.body.querySelector('.ui-font-picker__option') as HTMLButtonElement).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Cascadia Code']);
    wrapper.unmount();
  });
});
