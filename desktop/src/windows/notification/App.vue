<template>
  <div class="notification-wrapper" :class="[`notification--${data.size}`, `notification--${data.type}`, { 'notification--visible': visible }]">
    <div class="notification-card" @mouseenter="pauseAutoClose" @mouseleave="resumeAutoClose" @click="activateNotification">
      <!-- 关闭按钮 -->
      <button class="notification-close" @click.stop="close" title="关闭">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </button>

      <!-- text 类型 -->
      <div v-if="data.type === 'text'" class="notification-text">
        <div v-if="data.title" class="notification-title">{{ data.title }}</div>
        <div v-if="data.message" class="notification-message">{{ data.message }}</div>
      </div>

      <!-- image 类型 -->
      <div v-else-if="data.type === 'image'" class="notification-image">
        <img
          v-if="data.imageUrl"
          :src="data.imageUrl"
          class="notification-image__img"
          alt="notification"
        />
        <div class="notification-image__overlay">
          <div v-if="data.title" class="notification-title">{{ data.title }}</div>
          <div v-if="data.message" class="notification-message">{{ data.message }}</div>
        </div>
      </div>

      <!-- richText 类型 -->
      <div v-else-if="data.type === 'richText'" class="notification-rich">
        <div v-if="data.icon" class="notification-rich__icon">
          <span class="notification-rich__icon-glyph">{{ data.icon }}</span>
        </div>
        <div class="notification-rich__body">
          <div v-if="data.title" class="notification-title">{{ data.title }}</div>
          <div v-if="data.message" class="notification-message">{{ data.message }}</div>
        </div>
        <img
          v-if="data.imageUrl"
          :src="data.imageUrl"
          class="notification-rich__thumb"
          alt="thumbnail"
        />
      </div>

      <!-- 进度条 -->
      <div v-if="duration > 0" class="notification-progress">
        <div
          class="notification-progress__bar"
          :style="{ animationDuration: `${duration}ms`, animationPlayState: paused ? 'paused' : 'running' }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import type { NotificationPayload } from '@/contracts/notification';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ipc = (window as any).ipcRenderer as {
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, listener: (...args: any[]) => void) => (() => void) | undefined;
} | undefined;

const data = reactive<NotificationPayload>({
  type: 'text',
  size: 'md',
  title: '',
  message: '',
  duration: 5000,
});

const visible = ref(false);
const paused = ref(false);
const duration = ref(5000);

let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;
let remainingTime = 0;
let timerStartedAt = 0;

function startAutoClose() {
  if (duration.value <= 0) return;
  remainingTime = duration.value;
  timerStartedAt = Date.now();
  autoCloseTimer = setTimeout(close, remainingTime);
}

function pauseAutoClose() {
  if (!autoCloseTimer || duration.value <= 0) return;
  clearTimeout(autoCloseTimer);
  autoCloseTimer = null;
  paused.value = true;
  const elapsed = Date.now() - timerStartedAt;
  remainingTime = Math.max(0, remainingTime - elapsed);
}

function resumeAutoClose() {
  if (duration.value <= 0) return;
  paused.value = false;
  if (remainingTime > 0) {
    timerStartedAt = Date.now();
    autoCloseTimer = setTimeout(close, remainingTime);
  }
}

function close() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
  visible.value = false;
  // 等出场动画完成后通知主进程关闭窗口
  setTimeout(() => {
    ipc?.send('notification:close');
  }, 320);
}

function activateNotification() {
  if (data.clickRoute) {
    ipc?.send('notification:activate', data.clickRoute);
  }
  close();
}

onMounted(() => {
  // 接收通知数据
  const removeListener = ipc?.on('notification:data', (payload: NotificationPayload) => {
    Object.assign(data, payload);
    duration.value = payload.duration ?? 5000;

    // 触发入场动画
    requestAnimationFrame(() => {
      visible.value = true;
    });

    startAutoClose();
  });

  // cleanup
  onBeforeUnmount(() => {
    removeListener?.();
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
  });
});
</script>

<style>
/* 全局 - 透明背景 */
html,
body {
  margin: 0;
  padding: 0;
  background: transparent !important;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

#notification-app {
  background: transparent;
}
</style>

<style scoped>
.notification-wrapper {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  padding: 0;
  margin: 0;
  background: transparent;

  transform: translateX(110%);
  opacity: 0;
  transition: transform 0.36s cubic-bezier(0.22, 1, 0.36, 1),
              opacity 0.28s ease-out;
}

.notification-wrapper.notification--visible {
  transform: translateX(0);
  opacity: 1;
}

.notification-card {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  border: 1px solid rgba(102, 204, 255, 0.22);
  background: rgba(20, 35, 45, 0.88);
  box-shadow:
    0 14px 36px rgba(0, 0, 0, 0.32),
    0 0 0 1px rgba(255, 255, 255, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(18px) saturate(1.6);
  overflow: hidden;
  color: rgba(220, 240, 255, 0.92);
  cursor: default;
  user-select: none;
}

.notification-card:hover {
  border-color: rgba(102, 204, 255, 0.36);
  box-shadow:
    0 18px 42px rgba(0, 0, 0, 0.38),
    0 0 0 1px rgba(255, 255, 255, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* ─── Close ─── */
.notification-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(220, 240, 255, 0.5);
  cursor: pointer;
  transition: all 0.18s ease;
}

.notification-close:hover {
  background: rgba(102, 204, 255, 0.18);
  color: rgba(220, 240, 255, 0.92);
}

/* ─── Title & Message ─── */
.notification-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  color: rgba(220, 240, 255, 0.95);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-message {
  font-size: 12.5px;
  line-height: 1.5;
  color: rgba(220, 240, 255, 0.65);
  overflow: hidden;
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

/* ─── Text Type ─── */
.notification-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 14px 40px 14px 18px;
}

/* ─── Image Type ─── */
.notification-image {
  flex: 1;
  position: relative;
  display: flex;
  align-items: stretch;
}

.notification-image__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 11px;
}

.notification-image__overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px 14px 12px;
  background: linear-gradient(0deg, rgba(2, 7, 13, 0.72) 0%, transparent 100%);
}

.notification-image__overlay .notification-title {
  color: #fff;
}

.notification-image__overlay .notification-message {
  color: rgba(255, 255, 255, 0.72);
}

/* ─── RichText Type ─── */
.notification-rich {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 40px 14px 16px;
}

.notification-rich__icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(102, 204, 255, 0.14);
  border: 1px solid rgba(102, 204, 255, 0.18);
}

.notification-rich__icon-glyph {
  font-size: 20px;
}

.notification-rich__body {
  flex: 1;
  min-width: 0;
}

.notification-rich__thumb {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* ─── Size Variants ─── */
.notification--sm .notification-title {
  font-size: 13px;
}

.notification--sm .notification-message {
  font-size: 12px;
  line-clamp: 1;
  -webkit-line-clamp: 1;
}

.notification--lg .notification-title {
  font-size: 15px;
}

.notification--lg .notification-message {
  line-clamp: 5;
  -webkit-line-clamp: 5;
}

.notification--lg .notification-rich__icon {
  width: 48px;
  height: 48px;
}

.notification--lg .notification-rich__thumb {
  width: 72px;
  height: 72px;
}

/* ─── Progress Bar ─── */
.notification-progress {
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
}

.notification-progress__bar {
  height: 100%;
  background: linear-gradient(90deg, #66ccff, #a78bfa);
  transform-origin: left center;
  animation: notificationShrink linear forwards;
  border-radius: 0 2px 2px 0;
}

@keyframes notificationShrink {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
</style>
