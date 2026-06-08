<script setup lang="ts">
import { computed } from 'vue';

type ToolbarDensity = 'compact' | 'normal';

const props = withDefaults(defineProps<{
  density?: ToolbarDensity;
  wrap?: boolean;
  align?: 'start' | 'center' | 'end' | 'between';
}>(), {
  density: 'normal',
  wrap: false,
  align: 'start',
});

const toolbarClass = computed(() => [
  'ui-toolbar',
  `ui-toolbar--${props.density}`,
  `ui-toolbar--${props.align}`,
  {
    'ui-toolbar--wrap': props.wrap,
  },
]);
</script>

<template>
  <div :class="toolbarClass">
    <div v-if="$slots.leading" class="ui-toolbar__group ui-toolbar__group--leading">
      <slot name="leading" />
    </div>
    <div class="ui-toolbar__group ui-toolbar__group--main">
      <slot />
    </div>
    <div v-if="$slots.trailing" class="ui-toolbar__group ui-toolbar__group--trailing">
      <slot name="trailing" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ui-toolbar {
  display: flex;
  min-width: 0;
  align-items: center;

  &--compact {
    gap: 6px;
  }

  &--normal {
    gap: 10px;
  }

  &--wrap {
    flex-wrap: wrap;
  }

  &--start {
    justify-content: flex-start;
  }

  &--center {
    justify-content: center;
  }

  &--end {
    justify-content: flex-end;
  }

  &--between {
    justify-content: space-between;
  }
}

.ui-toolbar__group {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: inherit;
}

.ui-toolbar__group--main {
  flex: 1 1 auto;
}

.ui-toolbar__group--trailing {
  flex: 0 0 auto;
  margin-left: auto;
}
</style>
