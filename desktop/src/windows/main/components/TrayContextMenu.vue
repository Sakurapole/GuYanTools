<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import UiMenu from './ui/UiMenu.vue';
import UiMenuItem from './ui/UiMenuItem.vue';
import UiMenuDivider from './ui/UiMenuDivider.vue';

// ── State ──────────────────────────────────────────────────────────────────────
const visible = ref(false);
const menuX = ref(0);
const menuY = ref(0);

// ── Tray API ───────────────────────────────────────────────────────────────────
let removeContextMenuListener: (() => void) | undefined;

function showMenu(x: number, y: number) {
  menuX.value = x;
  menuY.value = y;
  visible.value = true;
}

function hideMenu() {
  visible.value = false;
}

// ── Actions ────────────────────────────────────────────────────────────────────
function handleShowWindow() {
  hideMenu();
  window.trayApi?.showWindow();
}

function handleQuit() {
  hideMenu();
  window.trayApi?.quit();
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────
onMounted(() => {
  removeContextMenuListener = window.trayApi?.onContextMenu((x, y) => {
    // Tray bounds are in screen coordinates; we need to convert
    // For simplicity, show the menu at the top-right of the window
    // (near where the tray icon would be on the taskbar)
    showMenu(x, y);
  });
});

onBeforeUnmount(() => {
  removeContextMenuListener?.();
});
</script>

<template>
  <UiMenu
    :visible="visible"
    :x="menuX"
    :y="menuY"
    @close="hideMenu"
  >
    <!-- App identity header -->
    <div class="tray-menu-header">
      <div class="tray-menu-header__icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="20" height="20" rx="5" fill="url(#tray-icon-grad)" />
          <path d="M5 10.5V8L10 5L15 8V12L10 15L7 13.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          <defs>
            <linearGradient id="tray-icon-grad" x1="0" y1="0" x2="20" y2="20">
              <stop offset="0%" stop-color="#00d4aa" />
              <stop offset="100%" stop-color="#0099cc" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div class="tray-menu-header__info">
        <span class="tray-menu-header__title">GuYan Tools</span>
      </div>
    </div>

    <UiMenuDivider />

    <!-- Show/hide window -->
    <UiMenuItem @click="handleShowWindow">
      <template #icon>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="2" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3" />
          <path d="M1 5h12" stroke="currentColor" stroke-width="1.3" />
          <circle cx="3" cy="3.5" r="0.6" fill="currentColor" />
          <circle cx="5" cy="3.5" r="0.6" fill="currentColor" />
        </svg>
      </template>
      显示窗口
    </UiMenuItem>

    <UiMenuDivider />

    <!-- Quit -->
    <UiMenuItem danger @click="handleQuit">
      <template #icon>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2H11.5C11.8 2 12 2.2 12 2.5V11.5C12 11.8 11.8 12 11.5 12H9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          <path d="M6 9.5L9 7L6 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M2 7H9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        </svg>
      </template>
      退出应用
    </UiMenuItem>
  </UiMenu>
</template>

<style lang="scss" scoped>
.tray-menu-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 6px;
}

.tray-menu-header__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  overflow: hidden;
}

.tray-menu-header__info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.tray-menu-header__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
