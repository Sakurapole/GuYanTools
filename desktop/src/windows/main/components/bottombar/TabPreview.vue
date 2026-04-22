<script lang="ts" setup>
import { ref, watch, onBeforeUnmount, nextTick, computed } from 'vue';
import { useRouter } from 'vue-router';
import { getSnapshot, capturePageSnapshot, isSnapshotCapturing } from '@/windows/main/composables/useTabSnapshot';

const props = withDefaults(defineProps<{
  visible: boolean;
  tabName: string;
  tabUrl: string;
  tabIcon?: string;
  triggerRect: DOMRect | null;
}>(), {
  visible: false,
});

const emit = defineEmits<{
  mouseenter: [];
  mouseleave: [];
}>();

const router = useRouter();
const previewRef = ref<HTMLElement | null>(null);
const pos = ref({ x: 0, y: 0 });
const localSnapshotUrl = ref<string | null>(null);
const isCapturing = ref(false);

// 预览窗口尺寸
const PREVIEW_WIDTH = 260;

function updatePosition() {
  if (!props.triggerRect) return;
  const rect = props.triggerRect;
  const gap = 10;

  let x = rect.left + rect.width / 2;
  let y = rect.top - gap;

  // 边界保护：避免超出屏幕
  const halfW = PREVIEW_WIDTH / 2 + 12;
  if (x - halfW < 0) x = halfW;
  if (x + halfW > window.innerWidth) x = window.innerWidth - halfW;

  pos.value = { x, y };
}

async function loadSnapshot() {
  const currentPath = router.currentRoute.value.path;
  const isActiveTab = props.tabUrl === currentPath;

  // 先尝试从缓存获取
  const cached = getSnapshot(props.tabUrl);

  if (isActiveTab) {
    // 当前活跃的 Tab → 截新鲜的
    isCapturing.value = true;
    try {
      await capturePageSnapshot(currentPath);
      localSnapshotUrl.value = getSnapshot(props.tabUrl);
    } finally {
      isCapturing.value = false;
    }
  } else if (cached) {
    // 非活跃 Tab 且有缓存 → 直接用
    localSnapshotUrl.value = cached;
  } else {
    // 没有缓存
    localSnapshotUrl.value = null;
  }
}

watch(() => props.visible, async (v) => {
  if (v) {
    updatePosition();
    await nextTick();
    await loadSnapshot();
  }
});

// 预览已显示时，切换到不同 Tab → 更新位置和截图
watch(() => props.triggerRect, () => {
  if (props.visible) {
    updatePosition();
  }
});

watch(() => props.tabUrl, async () => {
  if (props.visible) {
    await nextTick();
    await loadSnapshot();
  }
});

onBeforeUnmount(() => {
  localSnapshotUrl.value = null;
});

// 内置 SVG 图标（复用 tool_item 中的）
const svgIcons: Record<string, string> = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  ftp: 'M15 5H5a2 2 0 0 0-2 2v10h2V7h10V5zm4 4H9a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2zm-5 9h-2v-2h2v2zm0-3h-2v-4h2v4zm5 3h-2v-2h2v2zm-3-5-3 3-3-3h2V11h2v2h2z',
  todo: 'M22 5.18L10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8c1.57 0 3.04.46 4.28 1.25l1.45-1.45A10.02 10.02 0 0 0 12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10h-2c0 4.41-3.59 8-8 8z',
  devtools: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
};
</script>

<template>
  <Teleport to="body">
    <Transition name="tab-preview">
      <div
        v-if="visible"
        ref="previewRef"
        class="tab-preview"
        :style="{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
        }"
        @mouseenter="emit('mouseenter')"
        @mouseleave="emit('mouseleave')"
      >
        <!-- 标题栏 -->
        <div class="tab-preview__header">
          <span v-if="tabIcon && svgIcons[tabIcon]" class="tab-preview__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path :d="svgIcons[tabIcon]" />
            </svg>
          </span>
          <span class="tab-preview__title">{{ tabName }}</span>
        </div>

        <!-- 预览内容区 -->
        <div class="tab-preview__body">
          <!-- 截图成功 -->
          <img
            v-if="localSnapshotUrl"
            :src="localSnapshotUrl"
            class="tab-preview__snapshot"
            alt="页面预览"
          />
          <!-- 加载中 -->
          <div v-else-if="isCapturing" class="tab-preview__loading">
            <div class="tab-preview__spinner" />
          </div>
          <!-- 无预览 -->
          <div v-else class="tab-preview__placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
              <path :d="svgIcons[tabIcon || 'home'] || svgIcons.home" />
            </svg>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.tab-preview {
  position: fixed;
  z-index: 10000;
  transform: translateX(-50%) translateY(-100%);
  width: 260px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--ui-surface-glass, rgba(30, 30, 40, 0.85));
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  border: 1px solid var(--ui-border-accent, rgba(255, 255, 255, 0.08));
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.35),
    0 2px 8px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  pointer-events: auto;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--ui-border-accent, rgba(255, 255, 255, 0.06));
    background: rgba(255, 255, 255, 0.03);
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-color, #60a5fa);
    opacity: 0.85;
    flex-shrink: 0;
  }

  &__title {
    font-size: 12px;
    font-weight: 500;
    color: var(--ui-text-primary, #e0e0e0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.2px;
  }

  &__body {
    width: 100%;
    height: 170px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.15);
  }

  &__snapshot {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top left;
    image-rendering: auto;
  }

  &__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  &__spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--primary-color, #60a5fa);
    border-radius: 50%;
    animation: tab-preview-spin 0.8s linear infinite;
  }

  &__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--ui-text-muted, #888);
  }
}

@keyframes tab-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

// ─── 入场 / 出场动画 ───
.tab-preview-enter-active {
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.tab-preview-leave-active {
  transition: opacity 0.15s ease,
              transform 0.15s ease;
}

.tab-preview-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(calc(-100% + 8px));
}

.tab-preview-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(calc(-100% + 6px));
}
</style>
