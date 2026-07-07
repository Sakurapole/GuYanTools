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
    style.background = 'transparent';
  } else if (c.type === 'video') {
    style.background = 'transparent'; // Let video handle it
  }

  if (c.backgroundStyle?.opacity !== undefined && c.backgroundStyle.opacity < 1) {
    style.opacity = c.backgroundStyle.opacity;
  }

  return style;
});

const backgroundSize = computed(() => props.config.backgroundStyle?.backgroundSize || 'cover');
const backgroundPosition = computed(() => props.config.backgroundStyle?.backgroundPosition || 'center');
const backgroundRepeat = computed(() => props.config.backgroundStyle?.backgroundRepeat || 'no-repeat');
const useImgTag = computed(() =>
  props.config.type === 'image' &&
  Boolean(props.config.image) &&
  backgroundRepeat.value === 'no-repeat'
);

const cssBackgroundImageStyle = computed(() => {
  if (props.config.type !== 'image' || !props.config.image || useImgTag.value) return {};
  return {
    backgroundImage: `url(${props.config.image})`,
    backgroundSize: backgroundSize.value,
    backgroundPosition: backgroundPosition.value,
    backgroundRepeat: backgroundRepeat.value,
  };
});

function toObjectFit(backgroundSizeValue: string): 'contain' | 'cover' | 'fill' | 'none' {
  switch (backgroundSizeValue) {
    case 'contain':
      return 'contain';
    case '100% 100%':
      return 'fill';
    case 'auto':
      return 'none';
    default:
      return 'cover';
  }
}

const videoStyle = computed(() => ({
  objectFit: toObjectFit(backgroundSize.value),
  objectPosition: backgroundPosition.value,
}));

const imageStyle = computed(() => ({
  objectFit: toObjectFit(backgroundSize.value),
  objectPosition: backgroundPosition.value,
}));

const backgroundMemoKey = computed(() => [
  props.config.type,
  props.config.color,
  props.config.image,
  props.config.video,
  backgroundSize.value,
  backgroundPosition.value,
  backgroundRepeat.value,
  String(props.config.backgroundStyle?.opacity ?? 1),
].join('::'));
</script>

<template>
  <div v-memo="[backgroundMemoKey]" class="todo-background" :style="[baseStyle, cssBackgroundImageStyle]">
    <img
      v-if="useImgTag"
      :src="config.image"
      class="bg-image"
      :style="imageStyle"
      alt=""
      decoding="async"
      draggable="false"
    />
    <video
      v-if="config.type === 'video' && config.video"
      :src="config.video"
      class="bg-video"
      :style="videoStyle"
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
  contain: paint;
  transform: translateZ(0);
  backface-visibility: hidden;
  will-change: transform;
  image-rendering: auto;
  -webkit-image-rendering: auto;
}

.bg-image,
.bg-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: translateZ(0);
  backface-visibility: hidden;
}
</style>
