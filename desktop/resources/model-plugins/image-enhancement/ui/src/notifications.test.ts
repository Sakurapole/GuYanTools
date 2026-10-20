import { describe, expect, it, vi } from 'vitest';
import { createPluginNotifier, getErrorMessage } from './notifications';
import type { JobRecord } from '../../../../../src/contracts/plugin_media';

describe('image plugin application notifications', () => {
  it('preserves structured errors and sends severity through the host API', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const notifier = createPluginNotifier({ showNotification });
    await notifier.notify('error', { message: '依赖安装失败', code: 'INTERNAL' }, '运行环境');
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'richText',
        tone: 'error',
        title: 'AI 图像处理工具 · 运行环境',
        message: '依赖安装失败',
        duration: 8000,
      })
    );
    expect(getErrorMessage({ code: 'E_FAIL' })).toContain('E_FAIL');
  });

  it('reports job submission and terminal results once without notifying progress', () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const notifier = createPluginNotifier({ showNotification });
    const job = { id: 'job-1', kind: 'model-packages', status: 'queued' } as JobRecord;
    notifier.job(job);
    notifier.job({ ...job, status: 'running', progress: 0.5 });
    notifier.job({ ...job, status: 'failed', error: { message: '下载失败' } });
    notifier.job({ ...job, status: 'failed', error: { message: '下载失败' } });
    notifier.job(job);
    expect(showNotification).toHaveBeenCalledTimes(2);
    expect(showNotification.mock.calls[1][0]).toMatchObject({ tone: 'error', message: '下载失败' });
  });

  it('does not suppress a repeated user action and does not recurse when notifications are denied', async () => {
    const showNotification = vi.fn().mockRejectedValue(new Error('PERMISSION_DENIED'));
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const notifier = createPluginNotifier({ showNotification });
    await expect(notifier.notify('success', '配置已保存')).resolves.toBe(false);
    await expect(notifier.notify('success', '配置已保存')).resolves.toBe(false);
    expect(showNotification).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it('captures unhandled errors and removes listeners on disposal', () => {
    const target = new EventTarget();
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const notifier = createPluginNotifier({ showNotification });
    const cleanup = notifier.listen(target);
    const event = new Event('unhandledrejection', { cancelable: true });
    Object.assign(event, { reason: new Error('异步异常') });
    target.dispatchEvent(event);
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'error', message: '异步异常' })
    );
    cleanup();
    target.dispatchEvent(event);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });
});
