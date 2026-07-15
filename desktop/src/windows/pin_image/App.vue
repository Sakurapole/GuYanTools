<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const pinId = ref<number | null>(null);
const imageSrc = ref('');
const opacity = ref(1);
const scale = ref(1);
let unsubscribePayload: (() => void) | undefined;

function onPayload(payload: { pinId: number; pngBase64: string }) {
  pinId.value = payload.pinId;
  imageSrc.value = `data:image/png;base64,${payload.pngBase64}`;
}

async function close() {
  if (pinId.value != null) {
    await window.pinImageApi?.close(pinId.value);
  }
}

async function adjustOpacity(delta: number) {
  opacity.value = Math.max(0.1, Math.min(1, opacity.value + delta));
  if (pinId.value != null) {
    await window.pinImageApi?.setOpacity(pinId.value, opacity.value);
  }
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  if (event.ctrlKey) {
    // Ctrl+滚轮调节透明度
    adjustOpacity(event.deltaY > 0 ? -0.05 : 0.05);
  } else {
    // 滚轮调节缩放
    scale.value = Math.max(0.2, Math.min(5, scale.value + (event.deltaY > 0 ? -0.1 : 0.1)));
  }
}

function onContextMenu(event: MouseEvent) {
  event.preventDefault();
}

function onDblClick() {
  void close();
}

// 拖拽移动窗口
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

function onMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;
  isDragging = true;
  dragOffsetX = event.screenX - window.screenX;
  dragOffsetY = event.screenY - window.screenY;
}

function onMouseMove(event: MouseEvent) {
  if (!isDragging) return;
  window.moveTo(event.screenX - dragOffsetX, event.screenY - dragOffsetY);
}

function onMouseUp() {
  isDragging = false;
}

onMounted(() => {
  unsubscribePayload = window.pinImageApi?.onImagePayload(onPayload);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
});

onBeforeUnmount(() => {
  unsubscribePayload?.();
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
});
</script>

<template>
  <div
    class="pin-image"
    :style="{ opacity }"
    @wheel.prevent="onWheel"
    @contextmenu="onContextMenu"
    @dblclick="onDblClick"
    @mousedown="onMouseDown"
  >
    <img
      v-if="imageSrc"
      :src="imageSrc"
      class="pin-image__img"
      :style="{ transform: `scale(${scale})` }"
      alt="贴图"
      draggable="false"
    />

    <!-- 控制条 -->
    <div class="pin-image__controls">
      <button type="button" class="pin-image__btn" title="降低透明度" @click.stop="adjustOpacity(-0.1)">−</button>
      <span class="pin-image__opacity">{{ Math.round(opacity * 100) }}%</span>
      <button type="button" class="pin-image__btn" title="增加透明度" @click.stop="adjustOpacity(0.1)">+</button>
      <button type="button" class="pin-image__btn pin-image__btn--close" title="关闭（双击）" @click.stop="close">✕</button>
    </div>
  </div>
</template>

<style scoped>
.pin-image {
  position: fixed;
  inset: 0;
  overflow: hidden;
  cursor: move;
  user-select: none;
}

.pin-image__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: center center;
  pointer-events: none;
}

.pin-image__controls {
  position: fixed;
  top: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(4px);
  opacity: 0;
  transition: opacity 0.2s;
  font: 11px/1 system-ui, sans-serif;
  color: #e2e8f0;
}

.pin-image:hover .pin-image__controls {
  opacity: 1;
}

.pin-image__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}

.pin-image__btn:hover {
  background: rgba(148, 163, 184, 0.2);
}

.pin-image__btn--close:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.pin-image__opacity {
  min-width: 32px;
  text-align: center;
  font-size: 10px;
  color: #94a3b8;
}
</style>
