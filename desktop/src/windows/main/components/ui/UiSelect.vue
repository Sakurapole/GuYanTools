<script lang="ts" setup>
import { defineCustomElements } from '@guyantools/ui-core';

defineOptions({ inheritAttrs: false });

defineCustomElements();

type SelectSize = 'sm' | 'md' | 'lg';
type SelectAnimation = 'fade' | 'slide' | 'scale' | 'slideScale';

export type UiSelectOption = {
  label: string;
  value: string | number;
  disabled?: boolean;
};

const props = withDefaults(defineProps<{
  modelValue: string | number;
  options: UiSelectOption[];
  disabled?: boolean;
  size?: SelectSize;
  id?: string;
  placeholder?: string;
  animation?: SelectAnimation;
  closeOnOutside?: boolean;
}>(), {
  disabled: false,
  size: 'md',
  id: '',
  placeholder: '请选择…',
  animation: 'slideScale',
  closeOnOutside: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
  change: [value: string | number];
  focus: [];
  blur: [];
}>();

function handleChange(event: Event): void {
  const value = (event as CustomEvent<{ value: string | number }>).detail.value;
  emit('update:modelValue', value);
  emit('change', value);
}
</script>

<template>
  <gt-select
    :value="props.modelValue"
    :options="props.options"
    :disabled="props.disabled"
    :size="props.size"
    :placeholder="props.placeholder"
    :animation="props.animation"
    :close-on-outside="props.closeOnOutside"
    :id="props.id || undefined"
    v-bind="$attrs"
    @gt-change="handleChange"
    @gt-focus="emit('focus')"
    @gt-blur="emit('blur')"
  >
    <span v-if="$slots.prefix" slot="prefix"><slot name="prefix" /></span>
    <span v-if="$slots.suffix" slot="suffix"><slot name="suffix" /></span>
    <template v-if="$slots.option">
      <span
        v-for="(option, index) in props.options"
        :key="String(option.value)"
        :slot="`option-${index}`"
      >
        <slot
          name="option"
          :option="option"
          :selected="String(option.value) === String(props.modelValue)"
          :highlighted="false"
        />
      </span>
    </template>
  </gt-select>
</template>
