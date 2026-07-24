<script lang="ts" setup>
import { computed } from 'vue';

type RadioSize = 'sm' | 'md';
type RadioValue = string | number | boolean;

const props = withDefaults(defineProps<{
  modelValue: RadioValue;
  value: RadioValue;
  disabled?: boolean;
  size?: RadioSize;
  id?: string;
  name?: string;
}>(), {
  disabled: false,
  size: 'md',
  id: '',
  name: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: RadioValue];
  change: [value: RadioValue];
}>();

const isChecked = computed(() => props.modelValue === props.value);

const radioClass = computed(() => [
  'ui-radio',
  `ui-radio--${props.size}`,
  {
    'ui-radio--checked': isChecked.value,
    'ui-radio--disabled': props.disabled,
  },
]);

function handleChange(): void {
  if (props.disabled) return;
  emit('update:modelValue', props.value);
  emit('change', props.value);
}
</script>

<template>
  <label :class="radioClass">
    <input
      :id="id || undefined"
      class="ui-radio__input"
      type="radio"
      :name="name || undefined"
      :value="String(value)"
      :checked="isChecked"
      :disabled="disabled"
      @change="handleChange"
    />
    <span class="ui-radio__mark" aria-hidden="true">
      <span class="ui-radio__dot" />
    </span>
    <span v-if="$slots.default" class="ui-radio__label">
      <slot />
    </span>
  </label>
</template>

<style lang="scss" scoped>
.ui-radio {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  outline: none;

  &--disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
}

.ui-radio__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;

  &:focus-visible + .ui-radio__mark {
    border-color: var(--ui-radio-focus-border, var(--ui-input-focus-border));
    box-shadow: var(--ui-focus-ring);
  }
}

.ui-radio__mark {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: var(--ui-border-width-thin, 1px) solid var(--ui-radio-border, var(--ui-input-border));
  border-radius: var(--ui-radius-full);
  background: var(--ui-radio-bg, var(--ui-input-bg));
  color: var(--ui-radio-check-color, #fff);
  transition:
    background-color 0.16s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.16s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.16s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.12s cubic-bezier(0.4, 0, 0.2, 1);
}

.ui-radio--sm .ui-radio__mark {
  width: 14px;
  height: 14px;
}

.ui-radio--md .ui-radio__mark {
  width: 18px;
  height: 18px;
}

.ui-radio:not(.ui-radio--disabled):hover .ui-radio__mark {
  border-color: var(--ui-radio-hover-border, var(--ui-input-focus-border));
  transform: scale(1.04);
}

.ui-radio--checked .ui-radio__mark {
  border-color: var(--ui-radio-checked-border, var(--primary-color));
  background: var(--ui-radio-checked-bg, var(--primary-color));
}

.ui-radio__dot {
  display: block;
  border-radius: var(--ui-radius-full);
  background: currentColor;
  opacity: 0;
  transform: scale(0.5);
  transition:
    opacity 0.14s ease,
    transform 0.14s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ui-radio--sm .ui-radio__dot {
  width: 6px;
  height: 6px;
}

.ui-radio--md .ui-radio__dot {
  width: 8px;
  height: 8px;
}

.ui-radio--checked .ui-radio__dot {
  opacity: 1;
  transform: scale(1);
}

.ui-radio__label {
  color: var(--ui-text-primary);
  font-size: 0.9rem;
  line-height: 1.4;
}

.ui-radio--sm .ui-radio__label {
  font-size: 0.82rem;
}
</style>
