<script lang="ts" setup>
withDefaults(defineProps<{
  direction?: 'up' | 'down';
  width?: number;
  height?: number;
}>(), {
  direction: 'down',
  width: 18,
  height: 18,
});
</script>

<template>
  <svg
    :width="width"
    :height="height"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :style="{ transform: direction === 'up' ? 'rotate(180deg)' : 'none' }"
  >
    <path
      d="M6 9L12 15L18 9"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
