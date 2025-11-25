<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  x: number;
  y: number;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
  open: [];
  delete: [];
  changeBackground: [];
}>();

const menuRef = ref<HTMLElement | null>(null);

// 计算菜单位置，确保不超出屏幕
const menuStyle = computed(() => {
  let left = props.x;
  let top = props.y;

  if (menuRef.value) {
    const menuWidth = menuRef.value.offsetWidth || 200;
    const menuHeight = menuRef.value.offsetHeight || 150;

    // 防止超出右边界
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 10;
    }

    // 防止超出下边界
    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 10;
    }
  }

  return {
    left: `${left}px`,
    top: `${top}px`,
  };
});

const handleClickOutside = (event: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('close');
  }
};

const handleOpen = () => {
  emit('open');
  emit('close');
};

const handleDelete = () => {
  emit('delete');
  emit('close');
};

const handleChangeBackground = () => {
  emit('changeBackground');
  emit('close');
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" ref="menuRef" class="context-menu" :style="menuStyle">
      <div class="menu-item" @click="handleOpen">
        <span class="menu-icon">📂</span>
        <span class="menu-text">打开</span>
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="handleChangeBackground">
        <span class="menu-icon">🎨</span>
        <span class="menu-text">更换背景</span>
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item menu-item--danger" @click="handleDelete">
        <span class="menu-icon">🗑️</span>
        <span class="menu-text">删除</span>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.context-menu {
  position: fixed;
  background: var(--menu-bg-color);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  box-shadow: 0 4px 16px var(--menu-shadow-color),
    0 0 0 1px var(--menu-border-color);
  padding: 6px;
  min-width: 180px;
  z-index: 9999;
  animation: menuFadeIn 0.15s ease-out;
  transition: background 0.3s ease, box-shadow 0.3s ease;
}

@keyframes menuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
  color: var(--menu-item-text-color);
  font-size: 14px;

  &:hover {
    background: var(--menu-item-hover-bg-color);
  }

  &:active {
    transform: scale(0.98);
  }

  &--danger {
    &:hover {
      background: var(--menu-danger-hover-bg-color);
      color: var(--menu-danger-color);

      .menu-icon {
        transform: scale(1.1);
      }
    }
  }
}

.menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  margin-right: 10px;
  font-size: 16px;
  transition: transform 0.15s ease;
}

.menu-text {
  flex: 1;
  font-weight: 500;
}

.menu-divider {
  height: 1px;
  background: var(--menu-divider-color);
  margin: 4px 0;
  transition: background 0.3s ease;
}
</style>
