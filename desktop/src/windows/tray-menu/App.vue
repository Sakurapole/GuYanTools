<script lang="ts" setup>
import { onBeforeUnmount, onMounted } from 'vue';
import type { AppConfig } from '@/contracts/app_config';
import {
  SYSTEM_FONT_OPTION_VALUE,
  SYSTEM_FONT_STACK,
} from '@/contracts/app_config';

// ipcRenderer is injected by preload.ts into every renderer window
const ipc = (window as any).ipcRenderer as { send: (channel: string, ...args: any[]) => void } | undefined;
let removeConfigListener: (() => void) | undefined;

if (!document.documentElement.classList.contains('light') && !document.documentElement.classList.contains('dark')) {
  document.documentElement.classList.add('light');
}

// ── Actions ────────────────────────────────────────────────────────────────────

function handleShowWindow() {
  ipc?.send('tray:show-window');
}

function handleQuit() {
  ipc?.send('tray:quit');
}

function buildFontFamilyValue(fontFamily: string) {
  if (fontFamily === SYSTEM_FONT_OPTION_VALUE) {
    return SYSTEM_FONT_STACK;
  }

  const escaped = fontFamily.replace(/"/g, '\\"');
  return `"${escaped}", ${SYSTEM_FONT_STACK}`;
}

function applyRuntimeConfig(config: AppConfig) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(config.appearance.theme);
  root.style.fontSize = `${config.appearance.baseFontSize}px`;
  root.style.setProperty('--app-font-family', buildFontFamilyValue(config.appearance.fontFamily));
}

// Close on blur is handled automatically by the main process (BrowserWindow blur event).

onMounted(() => {
  ipc?.send('tray-menu:ready');
  void window.appConfigApi?.getConfig().then(applyRuntimeConfig);
  removeConfigListener = window.appConfigApi?.onDidChange(applyRuntimeConfig);
});

onBeforeUnmount(() => {
  removeConfigListener?.();
});
</script>

<template>
  <div class="tray-menu" @mouseleave.self="() => {}">
    <!-- App header -->
    <div class="tray-menu__header">
      <div class="tray-menu__header-icon">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="22" height="22" rx="6" fill="url(#grad-hdr)" />
          <path d="M6 12V9L11 6L16 9V13L11 16L8 14.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          <defs>
            <linearGradient id="grad-hdr" x1="0" y1="0" x2="22" y2="22">
              <stop offset="0%" stop-color="#00d4aa" />
              <stop offset="100%" stop-color="#0099cc" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <span class="tray-menu__header-title">GuYan Tools</span>
    </div>

    <div class="tray-menu__divider" />

    <!-- Show window -->
    <button class="tray-menu__item" @click="handleShowWindow">
      <span class="tray-menu__item-icon">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <rect x="1" y="2" width="13" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3" />
          <path d="M1 5.5h13" stroke="currentColor" stroke-width="1.3" />
          <circle cx="3.2" cy="3.8" r="0.65" fill="currentColor" />
          <circle cx="5.4" cy="3.8" r="0.65" fill="currentColor" />
        </svg>
      </span>
      <span class="tray-menu__item-text">显示窗口</span>
    </button>

    <div class="tray-menu__divider" />

    <!-- Quit -->
    <button class="tray-menu__item tray-menu__item--danger" @click="handleQuit">
      <span class="tray-menu__item-icon">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M9.5 2H12C12.3 2 12.5 2.2 12.5 2.5V12.5C12.5 12.8 12.3 13 12 13H9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          <path d="M6.5 10L9.5 7.5L6.5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M2.5 7.5H9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        </svg>
      </span>
      <span class="tray-menu__item-text">退出应用</span>
    </button>
  </div>
</template>

<style lang="scss">
@use '../main/assets/foundation.scss';
@use '../main/assets/theme.scss';

/* Reset */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Global font */
body {
  font-family: var(--app-font-family, 'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif);
  -webkit-font-smoothing: antialiased;
  background: transparent;
  overflow: hidden;
  user-select: none;
}
</style>

<style scoped>
.tray-menu {
  width: 100%;
  height: 100%;
  padding: 5px;
  background: var(--ui-menu-bg);
  border: var(--ui-border-width-thin) solid var(--menu-border-color);
  border-radius: var(--ui-radius-sm);
  box-shadow: var(--ui-menu-shadow);
  backdrop-filter: var(--ui-backdrop-blur-md) saturate(1.35);
  -webkit-backdrop-filter: var(--ui-backdrop-blur-md) saturate(1.35);
  display: flex;
  flex-direction: column;
  gap: 2px;

  /* Animate in */
  animation: menuIn 0.12s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes menuIn {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.tray-menu__header {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px 5px;
}

.tray-menu__header-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.tray-menu__header-title {
  font-size: var(--ui-font-size-xs);
  font-weight: 650;
  color: var(--ui-text-primary);
  letter-spacing: 0;
}

.tray-menu__divider {
  height: 1px;
  margin: 2px 4px;
  background: var(--menu-divider-color);
}

.tray-menu__item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: var(--ui-radius-xs);
  background: transparent;
  color: var(--menu-item-text-color);
  cursor: pointer;
  font-size: var(--ui-font-size-sm);
  font-weight: 500;
  font-family: inherit;
  text-align: left;
  transition: background 0.1s ease, color 0.1s ease;
}

.tray-menu__item:hover {
  background: var(--menu-item-hover-bg-color);
  color: var(--ui-text-primary);
}

.tray-menu__item:active {
  background: var(--ui-tabs-active-bg);
  transform: scale(0.99);
}

.tray-menu__item--danger {
  color: var(--menu-danger-color);
}

.tray-menu__item--danger:hover {
  background: var(--menu-danger-hover-bg-color);
  color: var(--menu-danger-color);
}

.tray-menu__item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.8;
}

.tray-menu__item:hover .tray-menu__item-icon {
  opacity: 1;
}

.tray-menu__item-text {
  flex: 1;
}
</style>
