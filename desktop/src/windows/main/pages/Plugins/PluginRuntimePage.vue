<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { notifyError } from '../../composables/useInAppNotification';
import { resolvePluginPageIdentity } from './plugin_runtime_identity';

const route = useRoute();
const hostRef = ref<HTMLElement | null>(null);

const pluginIdentity = resolvePluginPageIdentity({
  meta: route.meta as Record<string, unknown>,
  params: route.params as Record<string, unknown>,
});
const pluginId = pluginIdentity.pluginId;
const pageId = pluginIdentity.pageId;
const errorMessage = ref('');

let resizeObserver: ResizeObserver | null = null;
let boundsSyncTimers: number[] = [];

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
    await window.pluginHostApi.mountPage(pluginId, pageId, bounds);
    errorMessage.value = '';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '插件页面挂载失败';
    notifyError(error, '插件页面挂载失败');
  }
}

function scheduleBoundsSync() {
  boundsSyncTimers.forEach((timer) => window.clearTimeout(timer));
  boundsSyncTimers = [0, 100, 300, 700].map((delay) =>
    window.setTimeout(() => {
      void updateBounds();
    }, delay)
  );
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
    scheduleBoundsSync();
  });

  if (hostRef.value) {
    resizeObserver.observe(hostRef.value);
  }

  void nextTick(async () => {
    // The route host can receive its final width after the main shell's
    // sidebar and bottom bar finish their first layout pass. Mount once after
    // two frames, then re-apply bounds during that settling window.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await syncPageMount();
    scheduleBoundsSync();
  });
  window.addEventListener('resize', updateBounds);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  boundsSyncTimers.forEach((timer) => window.clearTimeout(timer));
  boundsSyncTimers = [];
  window.removeEventListener('resize', updateBounds);
  void window.pluginHostApi?.unmountPage(pluginId, pageId);
});
</script>

<template>
  <div ref="hostRef" class="plugin-runtime-page">
    <div
      v-if="errorMessage"
      class="plugin-runtime-page__error ui-status-banner ui-status-banner--danger"
    >
      {{ errorMessage }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.plugin-runtime-page {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: transparent;
}

.plugin-runtime-page__error {
  position: absolute;
  z-index: 1;
  inset: 16px;
  height: fit-content;
}
</style>
