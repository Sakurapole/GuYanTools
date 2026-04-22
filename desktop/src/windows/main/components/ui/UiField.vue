<script lang="ts" setup>
import { computed } from 'vue';

type FieldLayout = 'vertical' | 'horizontal';

const props = withDefaults(defineProps<{
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  for?: string;
  layout?: FieldLayout;
}>(), {
  label: '',
  hint: '',
  error: '',
  required: false,
  for: '',
  layout: 'vertical',
});

const fieldClass = computed(() => [
  'ui-field',
  `ui-field--${props.layout}`,
  {
    'ui-field--error': Boolean(props.error),
  },
]);
</script>

<template>
  <div :class="fieldClass">
    <label v-if="props.label || $slots.label" class="ui-field__label" :for="props.for || undefined">
      <slot name="label">
        <span>{{ props.label }}</span>
      </slot>
      <span v-if="props.required" class="ui-field__required">*</span>
    </label>

    <div class="ui-field__control">
      <slot />
    </div>

    <div v-if="props.error || props.hint || $slots.error || $slots.hint" class="ui-field__meta">
      <slot v-if="$slots.error" name="error" />
      <p v-else-if="props.error" class="ui-field__error">{{ props.error }}</p>
      <slot v-else-if="$slots.hint" name="hint" />
      <p v-else class="ui-field__hint">{{ props.hint }}</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ui-field {
  display: flex;
  flex-direction: column;
  gap: 8px;

  &--horizontal {
    display: grid;
    grid-template-columns: minmax(96px, 132px) minmax(0, 1fr);
    align-items: start;
    gap: 12px 16px;

    .ui-field__meta {
      grid-column: 2;
    }
  }
}

.ui-field__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ui-field-label);
  font-size: 0.9rem;
  font-weight: 600;
}

.ui-field__required {
  color: var(--ui-field-error);
}

.ui-field__control {
  min-width: 0;
}

.ui-field__meta {
  min-height: 18px;
}

.ui-field__hint,
.ui-field__error {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.4;
}

.ui-field__hint {
  color: var(--ui-field-hint);
}

.ui-field__error {
  color: var(--ui-field-error);
}
</style>
