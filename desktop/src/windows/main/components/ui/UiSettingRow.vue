<script lang="ts" setup>
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  label?: string;
  hint?: string;
  value?: string | number;
  bordered?: boolean;
}>(), {
  label: '',
  hint: '',
  value: '',
  bordered: true,
});

const rowClass = computed(() => [
  'ui-setting-row',
  {
    'ui-setting-row--bordered': props.bordered,
  },
]);
</script>

<template>
  <div :class="rowClass">
    <div class="ui-setting-row__main">
      <span class="ui-setting-row__label">
        <slot name="label">{{ label }}</slot>
      </span>
      <small v-if="hint || $slots.hint" class="ui-setting-row__hint">
        <slot name="hint">{{ hint }}</slot>
      </small>
    </div>
    <strong v-if="value !== '' || $slots.value" class="ui-setting-row__value">
      <slot name="value">{{ value }}</slot>
    </strong>
    <div v-if="$slots.default" class="ui-setting-row__control">
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ui-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 48px;
  color: var(--ui-text-primary);
  font-size: 0.94rem;
}

.ui-setting-row--bordered {
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.ui-setting-row__main {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
}

.ui-setting-row__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-setting-row__hint,
.ui-setting-row__label small {
  color: var(--ui-text-muted);
  font-size: 0.8rem;
  font-weight: 500;
}

.ui-setting-row__value {
  flex: 0 0 auto;
  font-size: 0.9rem;
  font-weight: 700;
}

.ui-setting-row__control {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
}
</style>
