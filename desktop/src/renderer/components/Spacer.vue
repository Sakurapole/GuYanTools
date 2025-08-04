<template>
  <div :class="[
    'spacer',
    `spacer--${direction}`,
    { 'spacer--divider': type === 'divider' }
  ]" :style="spacerStyle">
    <span v-if="type === 'divider'" class="spacer__divider-line">|</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  size: { type: [String, Number], default: '16px' },
  type: { type: String, default: 'blank' },
  direction: { type: String, default: 'horizontal' },
});

function parseSize(val: string | number) {
  return typeof val === 'number' ? `${val}px` : val;
}

const spacerStyle = computed(() => {
  const s = parseSize(props.size);
  if (props.type === 'blank') {
    if (props.direction === 'horizontal') {
      return { display: 'inline-block', width: s };
    } else {
      return { display: 'inline-block', height: s };
    }
  } else {
    // divider
    if (props.direction === 'horizontal') {
      return {
        display: 'inline-flex',
        alignItems: 'center',
        margin: `0 ${s}`
      };
    } else {
      return {
        display: 'inline-flex',
        alignItems: 'center',
        flexDirection: 'column' as 'column',
        margin: `${s} 0`
      };
    }
  }
});
</script>

<style scoped>
.spacer--divider .spacer__divider-line {
  color: var(--divider-color, #66CCFF);
  user-select: none;
}
</style>