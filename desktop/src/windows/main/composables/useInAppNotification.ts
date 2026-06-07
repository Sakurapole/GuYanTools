import type { App } from 'vue';
import { useInAppNotificationStore, type InAppNotificationInput, type InAppNotificationTone } from '../stores/in_app_notification_store';

export function getErrorMessage(error: unknown, fallback = '未知错误') {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '').trim();
    if (message) return message;
  }
  return fallback;
}

export function notifyInApp(
  tone: InAppNotificationTone,
  title: string,
  message: string,
  options?: Omit<InAppNotificationInput, 'tone' | 'title' | 'message'>,
) {
  return useInAppNotificationStore().notify({
    ...options,
    tone,
    title,
    message,
  });
}

export function notifyInAppPayload(input: InAppNotificationInput) {
  return useInAppNotificationStore().notify(input);
}

export function notifyError(error: unknown, title = '操作失败', options?: { duration?: number; dedupeKey?: string }) {
  return notifyInApp('error', title, getErrorMessage(error), options);
}

export function notifyWarning(message: string, title = '请注意', options?: { duration?: number; dedupeKey?: string }) {
  return notifyInApp('warning', title, message, options);
}

export function notifyInfo(message: string, title = '提示', options?: { duration?: number; dedupeKey?: string }) {
  return notifyInApp('info', title, message, options);
}

export function notifySuccess(message: string, title = '已完成', options?: { duration?: number; dedupeKey?: string }) {
  return notifyInApp('success', title, message, options);
}

export function isBenignResizeObserverLoopError(error: unknown) {
  const message = getErrorMessage(error, '');
  return (
    message === 'ResizeObserver loop completed with undelivered notifications.'
    || message === 'ResizeObserver loop limit exceeded'
  );
}

export function installInAppErrorHandlers(app: App) {
  app.config.errorHandler = (error, _instance, info) => {
    console.error('[Vue] Unhandled component error:', info, error);
    notifyError(error, '页面组件异常', {
      dedupeKey: `vue:${info}:${getErrorMessage(error)}`,
    });
  };

  window.addEventListener('error', (event) => {
    const error = event.error ?? event.message;
    if (isBenignResizeObserverLoopError(error)) {
      event.preventDefault();
      return;
    }
    console.error('[Window] Unhandled error:', error);
    notifyError(error, '页面运行异常', {
      dedupeKey: `window:${event.filename}:${event.lineno}:${event.colno}:${getErrorMessage(error)}`,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    window.setTimeout(() => {
      if (event.defaultPrevented) return;
      console.error('[Window] Unhandled promise rejection:', event.reason);
      notifyError(event.reason, '异步操作失败', {
        dedupeKey: `promise:${getErrorMessage(event.reason)}`,
      });
    }, 0);
  });
}
