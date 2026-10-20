import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import UiSuggestInput from './UiSuggestInput.vue';

const InputStub = {
  props: ['modelValue', 'placeholder', 'disabled', 'size'],
  emits: ['update:modelValue', 'keydown', 'focus', 'blur'],
  template: '<input :value="modelValue" @focus="$emit(\'focus\')" @blur="$emit(\'blur\')" />',
};

function mountSuggestInput() {
  return mount(UiSuggestInput, {
    props: {
      modelValue: '',
      suggestions: ['Documents', 'Downloads'],
    },
    attachTo: document.body,
    global: {
      stubs: { UiInput: InputStub },
    },
  });
}

describe('UiSuggestInput outside interaction', () => {
  it('closes suggestions when pointerdown happens outside the component', async () => {
    const wrapper = mountSuggestInput();
    await wrapper.find('input').trigger('focus');
    expect(wrapper.find('.ui-suggest-input__dropdown').exists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await nextTick();

    expect(wrapper.find('.ui-suggest-input__dropdown').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps suggestions open when pointerdown happens inside the component', async () => {
    const wrapper = mountSuggestInput();
    await wrapper.find('input').trigger('focus');
    await wrapper.find('.ui-suggest-input__dropdown').trigger('pointerdown');
    await nextTick();

    expect(wrapper.find('.ui-suggest-input__dropdown').exists()).toBe(true);
    wrapper.unmount();
  });
});
