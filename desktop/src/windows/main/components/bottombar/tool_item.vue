<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import IconRenderer from '../ui/IconRenderer.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import Svgicon from '../svgs/svgicon.vue';

const props = withDefaults(defineProps<{
  tabId: string;
  tabName: string;
  url?: string;
  icon?: string;
  closable?: boolean;
  active?: boolean;
  iconOnly?: boolean;
}>(), {
  tabId: 'default',
  tabName: 'default',
  url: '/',
  closable: true,
  active: false,
  iconOnly: false,
});

const emit = defineEmits<{
  close: [tabId: string];
  dragstart: [tabId: string, event: DragEvent];
  dragenter: [tabId: string, event: DragEvent];
  drop: [tabId: string, event: DragEvent];
  dragend: [];
  hover: [tabId: string, rect: DOMRect];
  hoverend: [tabId: string];
}>();

const router = useRouter();
const isDragOver = ref(false);
const toolItemRef = ref<HTMLElement | null>(null);

function onTabMouseEnter() {
  if (toolItemRef.value) {
    emit('hover', props.tabId, toolItemRef.value.getBoundingClientRect());
  }
}

function onTabMouseLeave() {
  emit('hoverend', props.tabId);
}

const handleTabClick = () => {
  if (props.url) {
    router.push(props.url);
  }
};

const handleClose = (event: Event) => {
  event.stopPropagation();
  emit('close', props.tabId);
};

function onDragStart(e: DragEvent) {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', props.tabId);
  }
  emit('dragstart', props.tabId, e);
}

function onDragEnter(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = true;
  emit('dragenter', props.tabId, e);
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = true;
}

function onDragLeave() {
  isDragOver.value = false;
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = false;
  emit('drop', props.tabId, e);
}

function onDragEnd() {
  isDragOver.value = false;
  emit('dragend');
}

// 内置 SVG 图标（viewBox 0 0 24 24）
const svgIcons: Record<string, string> = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  plugins: 'M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z',
  terminal: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm1.5 3.5L8.5 11l-3 2.5 1 1.2L11 11l-4.5-3.7-1 1.2zM12 14h6v-1.5h-6V14z',
  ftp: 'M15 5H5a2 2 0 0 0-2 2v10h2V7h10V5zm4 4H9a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2zm-5 9h-2v-2h2v2zm0-3h-2v-4h2v4zm5 3h-2v-2h2v2zm-3-5-3 3-3-3h2V11h2v2h2z',
  todo: 'M22 5.18L10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8c1.57 0 3.04.46 4.28 1.25l1.45-1.45A10.02 10.02 0 0 0 12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10h-2c0 4.41-3.59 8-8 8z',
  knowledge: 'M5 4.5A2.5 2.5 0 0 1 7.5 2H20v16H8a2 2 0 0 0-2 2h14v2H7a4 4 0 0 1-4-4V6.5A2 2 0 0 1 5 4.5zM6 6.5V17.1c.57-.36 1.26-.6 2-.6h10V4H7.5A1.5 1.5 0 0 0 6 5.5v1zM8 7h8v2H8V7zm0 4h6v2H8v-2z',
  ai: 'M12 2a6 6 0 0 1 6 6v1.2a4.8 4.8 0 0 1 1.4 8.2l1.3 2.6h-2.2l-1-2H6.5l-1 2H3.3l1.3-2.6A4.8 4.8 0 0 1 6 9.2V8a6 6 0 0 1 6-6zm0 2a4 4 0 0 0-4 4v1h8V8a4 4 0 0 0-4-4zm-1 7H8.8A2.8 2.8 0 0 0 6 13.8v.4A2.8 2.8 0 0 0 8.8 17H11v-6zm2 0v6h2.2a2.8 2.8 0 0 0 2.8-2.8v-.4a2.8 2.8 0 0 0-2.8-2.8H13zm-4 2h1.5v2H9v-2zm4.5 0H15v2h-1.5v-2z',
  script: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 2.5L17.5 8H14V4.5zM8.6 17.4 5.8 14.6l2.8-2.8L10 13.2l-1.4 1.4L10 16l-1.4 1.4zm6.8 0L14 16l1.4-1.4L14 13.2l1.4-1.4 2.8 2.8-2.8 2.8zm-4.3.1-1.4-.5 3.2-8.5 1.4.5-3.2 8.5z',
  devtools: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
};
</script>

<template>
  <div ref="toolItemRef" class="tool-item-container" :class="{ 'is-active': active, 'drag-over': isDragOver, 'is-dragging': false, 'tool-item-container--icon-only': iconOnly }"
    :title="tabName"
    v-ripple @click="handleTabClick"
    draggable="true"
    @dragstart="onDragStart"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @dragend="onDragEnd"
    @mouseenter="onTabMouseEnter"
    @mouseleave="onTabMouseLeave">
    <div class="tool-content">
      <span v-if="icon && svgIcons[icon]" class="tool-icon">
        <Svgicon width="15" height="15" viewBox="0 0 24 24">
          <path :d="svgIcons[icon]" />
        </Svgicon>
      </span>
      <IconRenderer v-else-if="icon" :icon="icon" :size="15" color="currentColor" class="tool-icon" />
      <span v-if="!iconOnly" class="tool-name">{{ tabName }}</span>
    </div>
    <UiIconButton v-if="closable" class="close-btn" variant="ghost" size="sm" shape="circle" title="关闭标签"
      @click="handleClose">
      <Svgicon width="14" height="14" viewBox="0 0 24 24">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
      </Svgicon>
    </UiIconButton>
  </div>
</template>

<style lang="scss">
@use "../../assets/layout.scss";
@use "../../assets/cssvars.scss" as *;

.tool-item-container {
  @include layout.flex-row($justify-content: space-between, $align-items: center);
  min-width: 100px;
  height: 100%;
  background-color: var(--ui-surface-glass);
  border-right: var(--ui-border-width-thin) solid var(--ui-border-accent);
  transition: background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, opacity 0.2s ease;
  cursor: pointer;
  color: var(--ui-text-primary);
  position: relative;

  &--icon-only {
    width: 46px;
    min-width: 46px;
    justify-content: center;
    padding: 0;

    & .tool-content {
      width: 100%;
      height: 100%;
      padding-left: 0;
      justify-content: center;
    }

    & .tool-icon {
      opacity: 0.86;
    }

    & .close-btn {
      position: absolute;
      top: 2px;
      right: 2px;
      margin-right: 0;
      transform: scale(0.82);
      pointer-events: auto;
    }
  }

  &.is-active {
    background-color: var(--ui-surface-overlay);
    box-shadow: inset 0 -2px 0 var(--primary-color);
  }

  &:hover {
    background-color: var(--ui-surface-overlay);
  }

  // 拖拽时自身半透明
  &[draggable="true"]:active {
    opacity: 0.7;
  }

  // 拖拽悬停目标指示器
  &.drag-over {
    &::before {
      content: "";
      position: absolute;
      left: 0;
      top: 4px;
      bottom: 4px;
      width: 2px;
      background: var(--primary-color);
      border-radius: 2px;
      animation: indicator-in 0.15s ease;
    }
  }

  & .tool-content {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding-left: 10px;
    overflow: hidden;
  }

  & .tool-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.65;
    transition: opacity 0.15s;

    svg {
      fill: currentColor;
    }
  }

  &.is-active .tool-icon {
    opacity: 1;
  }

  & .tool-name {
    display: inline-flex;
    align-items: center;
    font-size: 13px;
    color: var(--ui-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  & .close-btn {
    margin-right: 6px;
    color: var(--ui-text-muted);
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;

    svg {
      fill: currentColor;
    }

    &:hover {
      color: var(--primary-color);
    }
  }

  &:hover .close-btn {
    opacity: 1;
  }
}

@keyframes indicator-in {
  from {
    transform: scaleY(0);
    opacity: 0;
  }
  to {
    transform: scaleY(1);
    opacity: 1;
  }
}
</style>
