import { describe, expect, it, vi } from 'vitest';
vi.mock('../windows', () => ({ showNotification: vi.fn() }));
const { showOpenDialog } = vi.hoisted(() => ({ showOpenDialog: vi.fn() }));
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/test-user-data' },
  dialog: { showOpenDialog },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: {},
  BrowserWindow: class {},
}));
vi.mock('./android_service', () => ({ AndroidHostService: class {} }));
import { CommandService, HostServiceRegistry } from './host_services';
import { showNotification } from '../windows';
import { PluginCommandRouter } from './command_router';

describe('CommandService', () => {
  it('passes the original payload to a host command handler', async () => {
    const router = new PluginCommandRouter();
    router.register('example.plugin', 'example.plugin.run', (payload) => payload);
    const payload = { token: 'needed-by-plugin', nested: { password: 'original' } };
    await expect(
      new CommandService(router).executeHost('example.plugin', 'example.plugin.run', payload)
    ).resolves.toMatchObject({ accepted: true, result: payload });
  });

  it('opens a native picker that accepts a plugin directory or manifest file', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['C:/plugins/demo'] });
    await expect(new HostServiceRegistry().system.pickLocalPluginPath()).resolves.toBe(
      'C:/plugins/demo'
    );
    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: ['openFile', 'openDirectory'],
        filters: [{ name: 'Plugin manifest', extensions: ['json'] }],
      })
    );
  });

  it('forwards plugin notification payloads to the application notification service', async () => {
    await new HostServiceRegistry().system.showNotification({
      type: 'richText',
      size: 'md',
      tone: 'error',
      title: 'AI 图像处理工具 · 运行环境',
      message: '依赖安装失败',
    });
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'error',
        message: '依赖安装失败',
      })
    );
  });
});
