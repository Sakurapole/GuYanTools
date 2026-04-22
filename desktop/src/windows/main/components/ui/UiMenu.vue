<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import UiCard from './UiCard.vue';

const props = withDefaults(defineProps<{
  visible: boolean;
  x?: number;
  y?: number;
  closeOnClickOutside?: boolean;
}>(), {
  x: 0,
  y: 0,
  closeOnClickOutside: true,
});

const emit = defineEmits<{
  close: [];
}>();

const menuRef = ref<HTMLElement | null>(null);

const menuStyle = computed(() => {
  let left = props.x;
  let top = props.y;

  if (menuRef.value) {
    const menuWidth = menuRef.value.offsetWidth || 200;
    const menuHeight = menuRef.value.offsetHeight || 150;

    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 10;
    }

    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 10;
    }
  }

  return {
    left: `${Math.max(10, left)}px`,
    top: `${Math.max(10, top)}px`,
  };
});

function handleClickOutside(event: MouseEvent) {
  if (!props.visible || !props.closeOnClickOutside) {
    return;
  }

  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('close');
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.visible || event.key !== 'Escape') {
    return;
  }

  emit('close');
}

watch(() => props.visible, visible => {
  if (!visible) {
    return;
  }

  requestAnimationFrame(() => {
    if (menuRef.value) {
      // force computed style update after content mounts
      void menuRef.value.offsetWidth;
    }
  });
});

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" ref="menuRef" class="ui-menu-shell" :style="menuStyle">
      <UiCard class="ui-menu" variant="elevated" padding="none" radius="sm">
        <div class="ui-menu__content">
          <slot />
        </div>
      </UiCard>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.ui-menu-shell {
  position: fixed;
  z-index: 9999;
}

.ui-menu {
  /* 宽度: 基于视口 18vw，约束在 140px ~ 220px */
  min-width: clamp(80px, 18vw, 120px);
  max-width: clamp(200px, 28vw, 320px);
  /* 最大高度: 防止菜单项过多时溢出屏幕 */
  max-height: clamp(200px, 50vh, 480px);
  overflow: visible;
  padding: 4px;
  background: var(--ui-menu-bg);
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
  box-shadow: var(--ui-menu-shadow);
  animation: uiMenuFadeIn 0.12s ease-out;
}

.ui-menu__content {
  max-height: inherit;
  overflow-y: auto;
  overflow-x: hidden;
}

@keyframes uiMenuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
