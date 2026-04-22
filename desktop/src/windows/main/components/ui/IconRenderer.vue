<script lang="ts" setup>
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { parseIconValue, decodeSvgIcon } from '../../composables/iconUtils';

const props = withDefaults(defineProps<{
  icon: string;
  size?: number;
  color?: string;
}>(), {
  size: 24,
  color: 'currentColor',
});

const parsed = computed(() => parseIconValue(props.icon));

const decodedSvg = computed(() => {
  if (parsed.value.type === 'svg') {
    return decodeSvgIcon(parsed.value.value);
  }
  return '';
});

const imgStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  objectFit: 'contain' as const,
}));
</script>

<template>
  <!-- Iconify 图标（包括新选的和旧版映射） -->
  <Icon
    v-if="parsed.type === 'iconify' || parsed.type === 'preset'"
    :icon="parsed.value"
    :width="size"
    :height="size"
    :color="color"
  />

  <!-- 用户上传的图片 -->
  <img
    v-else-if="parsed.type === 'image'"
    :src="parsed.value"
    :style="imgStyle"
    alt="icon"
    draggable="false"
    class="icon-renderer__image"
  />

  <!-- 用户上传的 SVG -->
  <span
    v-else-if="parsed.type === 'svg' && decodedSvg"
    class="icon-renderer__svg"
    :style="{ width: `${size}px`, height: `${size}px`, color }"
    v-html="decodedSvg"
  />

  <!-- 回退：显示文字 -->
  <span
    v-else
    class="icon-renderer__fallback"
    :style="{ fontSize: `${Math.round(size * 0.5)}px`, color }"
  >
    <slot />
  </span>
</template>

<style scoped>
.icon-renderer__image {
  display: block;
  border-radius: 2px;
}

.icon-renderer__svg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.icon-renderer__svg :deep(svg) {
  width: 100%;
  height: 100%;
}

.icon-renderer__fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}
</style>
