<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { notifyError } from '../../composables/useInAppNotification';

const route = useRoute();
const hostRef = ref<HTMLElement | null>(null);

const pluginId = computed(() => String(route.params.pluginId ?? ''));
const pageId = computed(() => String(route.params.pageId ?? ''));
const title = computed(() => String(route.meta.title ?? `${pluginId.value}/${pageId.value}`));
const errorMessage = ref('');

let resizeObserver: ResizeObserver | null = null;

function readBounds() {
  const element = hostRef.value;
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

async function syncPageMount() {
  if (!window.pluginHostApi) {
    errorMessage.value = 'pluginHostApi 不可用';
    return;
  }

  const bounds = readBounds();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return;
  }

  try {
    await window.pluginHostApi.mountPage(pluginId.value, pageId.value, bounds);
    errorMessage.value = '';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '插件页面挂载失败';
    notifyError(error, '插件页面挂载失败');
  }
}

async function updateBounds() {
  if (!window.pluginHostApi) {
    return;
  }

  const bounds = readBounds();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return;
  }

  await window.pluginHostApi.updateMountedPageBounds(bounds);
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    void updateBounds();
  });

  if (hostRef.value) {
    resizeObserver.observe(hostRef.value);
  }

  void nextTick(syncPageMount);
  window.addEventListener('resize', updateBounds);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('resize', updateBounds);
  void window.pluginHostApi?.unmountPage(pluginId.value, pageId.value);
});
</script>

<template>
  <div class="plugin-runtime-page">
    <header class="plugin-runtime-page__header">
      <div>
        <h1>{{ title }}</h1>
        <p>{{ pluginId }} / {{ pageId }}</p>
      </div>
    </header>

    <div class="plugin-runtime-page__surface ui-glass-surface" ref="hostRef">
      <div v-if="errorMessage" class="plugin-runtime-page__error ui-status-banner ui-status-banner--danger">
        {{ errorMessage }}
      </div>
      <div v-else class="plugin-runtime-page__hint ui-status-hint">
        插件页面已由主进程运行时接管并挂载到当前容器区域。
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.plugin-runtime-page {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  padding: 24px;
  box-sizing: border-box;
  background:
    linear-gradient(135deg, rgba(93, 158, 237, 0.12), transparent 35%),
    var(--background-color);
}

.plugin-runtime-page__header h1,
.plugin-runtime-page__header p {
  margin: 0;
}

.plugin-runtime-page__header p {
  margin-top: 8px;
  color: var(--ui-text-muted);
}

.plugin-runtime-page__surface {
  position: relative;
  min-height: 0;
  margin-top: 18px;
  overflow: hidden;
}

.plugin-runtime-page__hint,
.plugin-runtime-page__error {
  position: absolute;
  left: 18px;
  top: 18px;
  z-index: 1;
}

.plugin-runtime-page__hint {
  max-width: calc(100% - 36px);
}
</style>
