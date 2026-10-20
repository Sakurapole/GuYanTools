import type { InjectionKey } from 'vue';
import type {
  NotificationPayload,
  NotificationTone,
} from '../../../../../src/contracts/notification';
import type { JobRecord } from '../../../../../src/contracts/plugin_media';

export type NotificationSystem = {
  showNotification: (payload: NotificationPayload) => Promise<void>;
};

export function getErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message || cause.name;
  if (typeof cause === 'string') return cause;
  if (cause && typeof cause === 'object') {
    if ('message' in cause && typeof cause.message === 'string') return cause.message;
    try {
      return JSON.stringify(cause);
    } catch {
      /* Fall back for non-serializable errors. */
    }
  }
  return String(cause ?? '未知错误');
}

const jobLabels: Record<string, string> = {
  'model-inference': '图像处理',
  'model-environment-create': '创建运行环境',
  'model-environment-remove': '删除运行环境',
  'model-packages': '包管理',
  'model-dependencies': '安装模型依赖',
};

export function createPluginNotifier(system?: NotificationSystem) {
  // Bound per-page bookkeeping; job events may arrive before the action response.
  const jobs = new Map<string, string>();
  async function notify(tone: NotificationTone, cause: unknown, title = '提示'): Promise<boolean> {
    const message = getErrorMessage(cause).trim();
    if (!message) return false;
    try {
      if (!system?.showNotification)
        throw new Error('应用通知不可用，请批准 system.notifications。');
      await system.showNotification({
        type: 'richText',
        size: 'md',
        tone,
        title: `AI 图像处理工具 · ${title}`,
        message,
        icon: tone === 'success' ? '✓' : tone === 'info' ? 'i' : '!',
        duration: tone === 'error' ? 8000 : tone === 'warning' ? 6000 : 4000,
      });
      return true;
    } catch (error) {
      // A rejected notification must not become another unhandled rejection.
      console.warn('[AI 图像处理工具] 应用通知发送失败', getErrorMessage(error), message);
      return false;
    }
  }

  function job(record: JobRecord) {
    const previous = jobs.get(record.id);
    if (previous && ['completed', 'failed', 'cancelled'].includes(previous)) return;
    const terminal = ['completed', 'failed', 'cancelled'].includes(record.status);
    jobs.delete(record.id);
    jobs.set(record.id, record.status);
    if (jobs.size > 200) jobs.delete(jobs.keys().next().value!);
    const label = jobLabels[record.kind] ?? '任务';
    if (terminal) {
      if (record.status === 'failed')
        void notify('error', record.error || `${label}失败。`, `${label}失败`);
      else if (record.status === 'completed') void notify('success', `${label}已完成。`, label);
      else void notify('info', `${label}已取消。`, label);
    } else if (!previous) void notify('info', `${label}已提交。`, label);
  }

  function listen(target: EventTarget): () => void {
    const onError = (event: Event) => {
      const error = event as ErrorEvent;
      // Browser layout diagnostics are not application failures.
      if (error.message?.startsWith('ResizeObserver loop')) return;
      void notify('error', error.error ?? error.message, '页面运行异常');
    };
    const onRejection = (event: Event) => {
      if (event.defaultPrevented) return;
      void notify('error', (event as PromiseRejectionEvent).reason, '异步操作失败');
    };
    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onRejection);
    return () => {
      target.removeEventListener('error', onError);
      target.removeEventListener('unhandledrejection', onRejection);
      jobs.clear();
    };
  }
  return { notify, job, listen };
}
export const pluginNotifierKey: InjectionKey<ReturnType<typeof createPluginNotifier>> =
  Symbol('pluginNotifications');
