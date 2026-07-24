<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { NotificationImageSource } from '@/contracts/notification';
import UiIconButton from './ui/UiIconButton.vue';
import { useInAppNotificationStore, type InAppNotificationItem } from '../stores/in_app_notification_store';

const props = withDefaults(defineProps<{
  popup?: boolean;
}>(), {
  popup: false,
});

const notificationStore = useInAppNotificationStore();
const router = useRouter();

const hostStyle = computed(() => ({
  '--in-app-notification-top': props.popup ? '32px' : '48px',
}));

function toneIcon(item: InAppNotificationItem) {
  if (item.icon) return item.icon;
  if (item.tone === 'error') return '!';
  if (item.tone === 'warning') return '!';
  if (item.tone === 'success') return '✓';
  return 'i';
}

function resolveImageUrl(item: InAppNotificationItem) {
  return item.imageUrl || resolveImageSource(item.imageSource);
}

function resolveImageSource(source?: NotificationImageSource) {
  if (!source) return '';
  if (source.type === 'url') return source.url;
  if (source.type === 'dataUrl') return source.dataUrl;
  if (source.type === 'base64') {
    const base64 = source.base64.trim();
    if (!base64) return '';
    return base64.startsWith('data:') ? base64 : `data:${source.mimeType || 'image/png'};base64,${base64}`;
  }
  return '';
}

function activate(item: InAppNotificationItem) {
  if (!item.clickRoute) return;
  void router.push(item.clickRoute);
  notificationStore.dismiss(item.id);
}
</script>

<template>
  <Teleport to="body">
    <TransitionGroup
      name="in-app-notification"
      tag="div"
      class="in-app-notification-host"
      :style="hostStyle"
      aria-live="polite"
      aria-relevant="additions removals"
    >
      <article
        v-for="item in notificationStore.items"
        :key="item.id"
        class="in-app-notification"
        :class="[
          `in-app-notification--${item.tone}`,
          `in-app-notification--${item.type}`,
          `in-app-notification--${item.size}`,
          { 'in-app-notification--clickable': item.clickRoute },
        ]"
        role="status"
        @mouseenter="notificationStore.pause(item.id)"
        @mouseleave="notificationStore.resume(item.id)"
        @click="activate(item)"
      >
        <div v-if="item.type !== 'image'" class="in-app-notification__icon" aria-hidden="true">
          {{ toneIcon(item) }}
        </div>
        <div class="in-app-notification__body">
          <div class="in-app-notification__title">{{ item.title }}</div>
          <div class="in-app-notification__message">{{ item.message }}</div>
        </div>
        <img
          v-if="item.type !== 'text' && resolveImageUrl(item)"
          class="in-app-notification__image"
          :src="resolveImageUrl(item)"
          alt=""
        />
        <UiIconButton
          class="in-app-notification__close"
          size="sm"
          variant="ghost"
          title="关闭"
          aria-label="关闭通知"
          @click.stop="notificationStore.dismiss(item.id)"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
        </UiIconButton>
      </article>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped lang="scss">
.in-app-notification-host {
  position: fixed;
  top: var(--in-app-notification-top, 48px);
  right: 0;
  z-index: var(--ui-z-modal);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  width: min(420px, calc(100vw - 16px));
  pointer-events: none;
}

.in-app-notification {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 28px;
  gap: 10px;
  align-items: start;
  width: 100%;
  min-height: 64px;
  padding: 12px 10px 12px 14px;
  box-sizing: border-box;
  border: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle);
  border-right: 0;
  border-radius: var(--ui-radius-md, 8px) 0 0 var(--ui-radius-md, 8px);
  background: var(--ui-surface-glass-strong, rgba(255, 255, 255, 0.94));
  color: var(--ui-text-primary);
  box-shadow: -10px 12px 28px rgba(9, 38, 64, 0.14);
  backdrop-filter: blur(16px);
  pointer-events: auto;
}

.in-app-notification--richText {
  grid-template-columns: 28px minmax(0, 1fr) 52px 28px;
}

.in-app-notification--image {
  grid-template-columns: minmax(0, 1fr) 72px 28px;
}

.in-app-notification--sm {
  min-height: 56px;
}

.in-app-notification--lg {
  min-height: 86px;
}

.in-app-notification--clickable {
  cursor: pointer;
}

.in-app-notification__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ui-radius-sm, 6px);
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
}

.in-app-notification__body {
  min-width: 0;
}

.in-app-notification__title {
  overflow: hidden;
  color: var(--ui-text-primary);
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.in-app-notification__message {
  margin-top: 3px;
  color: var(--ui-text-muted);
  font-size: 0.82rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.in-app-notification__image {
  width: 52px;
  height: 52px;
  align-self: center;
  border: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm, 6px);
  object-fit: cover;
}

.in-app-notification--image .in-app-notification__image {
  width: 72px;
  height: 56px;
}

.in-app-notification--lg .in-app-notification__image {
  width: 82px;
  height: 66px;
}

.in-app-notification__close.ui-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--ui-radius-sm, 6px);
  background: transparent;
  color: var(--ui-icon-button-text);
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease;
  transform: none;

  &:hover:not(:disabled) {
    background: var(--ui-icon-button-hover-bg);
    color: var(--ui-icon-button-hover-text);
    transform: none;
  }

  :deep(svg) {
    fill: none;
    stroke: currentColor;
  }
}

.in-app-notification--error {
  border-color: rgba(220, 38, 38, 0.34);

  .in-app-notification__icon {
    background: rgba(220, 38, 38, 0.12);
    color: var(--ui-state-error, #dc2626);
  }
}

.in-app-notification--warning .in-app-notification__icon {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.in-app-notification--success .in-app-notification__icon {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

.in-app-notification--info .in-app-notification__icon {
  background: rgba(102, 204, 255, 0.16);
  color: var(--primary-color);
}

.in-app-notification-enter-active,
.in-app-notification-leave-active,
.in-app-notification-move {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.in-app-notification-enter-from,
.in-app-notification-leave-to {
  opacity: 0;
  transform: translateX(22px);
}

.in-app-notification-leave-active {
  position: absolute;
}
</style>
