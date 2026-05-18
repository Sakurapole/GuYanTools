import { acceptHMRUpdate, defineStore } from 'pinia';
import { readonly, ref } from 'vue';
import type { NotificationImageSource, NotificationSize, NotificationType } from '@/contracts/notification';

export type InAppNotificationTone = 'info' | 'success' | 'warning' | 'error';

export interface InAppNotificationInput {
  tone?: InAppNotificationTone;
  type?: NotificationType;
  size?: NotificationSize;
  title?: string;
  message: string;
  imageUrl?: string;
  imageSource?: NotificationImageSource;
  icon?: string;
  clickRoute?: string;
  duration?: number;
  dedupeKey?: string;
}

export interface InAppNotificationItem {
  id: string;
  tone: InAppNotificationTone;
  type: NotificationType;
  size: NotificationSize;
  title: string;
  message: string;
  imageUrl: string;
  imageSource?: NotificationImageSource;
  icon: string;
  clickRoute: string;
  duration: number;
  dedupeKey: string;
  createdAt: number;
}

const MAX_VISIBLE = 4;
const DEFAULT_DURATION_MS = 3000;

type TimerState = {
  timerId: number;
  startedAt: number;
  remainingMs: number;
};

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `in-app-notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useInAppNotificationStore = defineStore('in-app-notification', () => {
  const items = ref<InAppNotificationItem[]>([]);
  const timers = new Map<string, TimerState>();

  function clearTimer(id: string) {
    const state = timers.get(id);
    if (!state) return;
    window.clearTimeout(state.timerId);
    timers.delete(id);
  }

  function dismiss(id: string) {
    clearTimer(id);
    items.value = items.value.filter((item) => item.id !== id);
  }

  function scheduleDismiss(id: string, duration: number) {
    clearTimer(id);
    if (duration <= 0) return;

    const timerId = window.setTimeout(() => {
      dismiss(id);
    }, duration);

    timers.set(id, {
      timerId,
      startedAt: Date.now(),
      remainingMs: duration,
    });
  }

  function notify(input: InAppNotificationInput) {
    const tone = input.tone ?? 'info';
    const message = input.message.trim();
    if (!message) return '';

    const dedupeKey = input.dedupeKey ?? `${tone}:${input.title ?? ''}:${message}`;
    const existing = items.value.find((item) => item.dedupeKey === dedupeKey);
    if (existing) {
      dismiss(existing.id);
    }

    const item: InAppNotificationItem = {
      id: createId(),
      tone,
      type: input.type ?? 'text',
      size: input.size ?? 'md',
      title: input.title?.trim() || defaultTitle(tone),
      message,
      imageUrl: input.imageUrl?.trim() || '',
      imageSource: input.imageSource,
      icon: input.icon?.trim() || '',
      clickRoute: input.clickRoute?.trim() || '',
      duration: input.duration ?? DEFAULT_DURATION_MS,
      dedupeKey,
      createdAt: Date.now(),
    };

    items.value = [item, ...items.value].slice(0, MAX_VISIBLE);
    const activeIds = new Set(items.value.map((entry) => entry.id));
    for (const id of timers.keys()) {
      if (!activeIds.has(id)) {
        clearTimer(id);
      }
    }
    scheduleDismiss(item.id, item.duration);
    return item.id;
  }

  function pause(id: string) {
    const state = timers.get(id);
    if (!state) return;
    window.clearTimeout(state.timerId);
    timers.set(id, {
      ...state,
      timerId: 0,
      remainingMs: Math.max(0, state.remainingMs - (Date.now() - state.startedAt)),
    });
  }

  function resume(id: string) {
    const state = timers.get(id);
    if (!state || state.timerId !== 0) return;
    if (state.remainingMs <= 0) {
      dismiss(id);
      return;
    }
    scheduleDismiss(id, state.remainingMs);
  }

  function clearAll() {
    for (const id of timers.keys()) {
      clearTimer(id);
    }
    items.value = [];
  }

  return {
    items: readonly(items),
    notify,
    dismiss,
    pause,
    resume,
    clearAll,
  };
});

function defaultTitle(tone: InAppNotificationTone) {
  if (tone === 'error') return '操作失败';
  if (tone === 'warning') return '请注意';
  if (tone === 'success') return '已完成';
  return '提示';
}

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useInAppNotificationStore, import.meta.hot));
}
