<script setup lang="ts">
import { computed } from 'vue';
import type { AreaBackground } from '@/windows/main/composables/useTodoSettings';

const props = defineProps<{
  config: AreaBackground;
}>();

const baseStyle = computed(() => {
  const c = props.config;
  const style: Record<string, string | number> = {};

  if (c.type === 'color') {
    style.background = c.color;
  } else if (c.type === 'image' && c.image) {
    style.backgroundImage = `url(${c.image})`;
    style.backgroundSize = c.backgroundStyle?.backgroundSize || 'cover';
    style.backgroundPosition = c.backgroundStyle?.backgroundPosition || 'center';
    style.backgroundRepeat = c.backgroundStyle?.backgroundRepeat || 'no-repeat';
  } else if (c.type === 'video') {
    style.background = 'transparent'; // Let video handle it
  }

  if (c.backgroundStyle?.opacity !== undefined && c.backgroundStyle.opacity < 1) {
    style.opacity = c.backgroundStyle.opacity;
  }

  return style;
});
</script>

<template>
  <div class="todo-background" :style="baseStyle">
    <video
      v-if="config.type === 'video' && config.video"
      :src="config.video"
      class="bg-video"
      autoplay
      loop
      muted
      playsinline
    />
  </div>
</template>

<style scoped>
.todo-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.bg-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
