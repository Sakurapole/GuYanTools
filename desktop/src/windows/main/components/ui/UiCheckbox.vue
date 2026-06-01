<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

type CheckboxSize = 'sm' | 'md';

const props = withDefaults(defineProps<{
  modelValue?: boolean;
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  size?: CheckboxSize;
  id?: string;
}>(), {
  modelValue: undefined,
  checked: undefined,
  indeterminate: false,
  disabled: false,
  size: 'md',
  id: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  change: [value: boolean];
}>();

const propChecked = computed(() =>
  props.modelValue !== undefined ? props.modelValue : (props.checked ?? false),
);
const localChecked = ref(propChecked.value);

watch(propChecked, (value) => {
  localChecked.value = value;
});

// Resolve the active checked state from either v-model or the :checked prop.
const isChecked = computed(() => localChecked.value);

const wrapClass = computed(() => [
  'ui-checkbox',
  `ui-checkbox--${props.size}`,
  {
    'ui-checkbox--checked': isChecked.value,
    'ui-checkbox--indeterminate': props.indeterminate,
    'ui-checkbox--disabled': props.disabled,
  },
]);

function handleChange(event: Event): void {
  if (props.disabled) return;
  const checked = (event.target as HTMLInputElement).checked;
  localChecked.value = checked;
  emit('update:modelValue', checked);
  emit('change', checked);
}
</script>

<template>
  <label :class="wrapClass">
    <!-- Hidden native input keeps full a11y and form behaviour -->
    <input
      :id="id || undefined"
      class="ui-checkbox__input"
      type="checkbox"
      :checked="isChecked"
      :indeterminate="indeterminate"
      :disabled="disabled"
      @change="handleChange"
    />

    <!-- Custom visible box -->
    <span class="ui-checkbox__box" aria-hidden="true">
      <!-- Checkmark icon -->
      <svg
        v-if="isChecked && !indeterminate"
        class="ui-checkbox__icon"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2.5 7L5.5 10L11.5 4"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <!-- Indeterminate dash icon -->
      <svg
        v-else-if="indeterminate"
        class="ui-checkbox__icon"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3 7H11"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </span>

    <!-- Optional label text -->
    <span v-if="$slots.default" class="ui-checkbox__label">
      <slot />
    </span>
  </label>
</template>

<style lang="scss" scoped>
.ui-checkbox {
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

// Visually hidden native input — preserved for a11y and form semantics.
.ui-checkbox__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;

  // Relay focus-visible to our custom box so keyboard users get a ring.
  &:focus-visible + .ui-checkbox__box {
    box-shadow: var(--ui-focus-ring);
    border-color: var(--ui-checkbox-focus-border, var(--ui-input-focus-border));
  }
}

// The visible square
.ui-checkbox__box {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: var(--ui-border-width-thin, 1px) solid var(--ui-checkbox-border, var(--ui-input-border));
  border-radius: var(--ui-radius-xs, 4px);
  background: var(--ui-checkbox-bg, var(--ui-input-bg));
  color: var(--ui-checkbox-check-color, var(--ui-text-inverse));
  transition:
    background-color 0.16s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.16s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.16s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.12s cubic-bezier(0.4, 0, 0.2, 1);
}

// Size variants
.ui-checkbox--sm .ui-checkbox__box {
  width: 14px;
  height: 14px;
  border-radius: 3px;
}

.ui-checkbox--md .ui-checkbox__box {
  width: 18px;
  height: 18px;
}

// Hover — only when not disabled
.ui-checkbox:not(.ui-checkbox--disabled):hover .ui-checkbox__box {
  border-color: var(--ui-checkbox-hover-border, var(--ui-input-focus-border));
  transform: scale(1.04);
}

// Checked & indeterminate states
.ui-checkbox--checked .ui-checkbox__box,
.ui-checkbox--indeterminate .ui-checkbox__box {
  background: var(--ui-checkbox-checked-bg, var(--primary-color));
  border-color: var(--ui-checkbox-checked-border, var(--primary-color));
  color: var(--ui-checkbox-check-color, #fff);
}

// Checkmark / dash SVG
.ui-checkbox__icon {
  display: block;
  animation: uiCheckboxPop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.ui-checkbox--sm .ui-checkbox__icon {
  width: 10px;
  height: 10px;
}

.ui-checkbox--md .ui-checkbox__icon {
  width: 12px;
  height: 12px;
}

@keyframes uiCheckboxPop {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

// Label text
.ui-checkbox__label {
  font-size: 0.9rem;
  line-height: 1.4;
  color: var(--ui-text-primary);
}

.ui-checkbox--sm .ui-checkbox__label {
  font-size: 0.82rem;
}
</style>
