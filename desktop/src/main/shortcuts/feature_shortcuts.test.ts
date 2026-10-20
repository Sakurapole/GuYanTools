import { beforeEach, describe, expect, it, vi } from 'vitest';
const { registered, configState } = vi.hoisted(() => ({
  registered: new Map<string, () => void>(),
  configState: { shortcuts: { system: { toggleQuickLaunch: 'Alt+Space' } } },
}));
vi.mock('electron', () => ({ BrowserWindow: class {}, globalShortcut: {
  register: (key: string, callback: () => void) => { if (registered.has(key)) return false; registered.set(key, callback); return true; },
  unregister: (key: string) => registered.delete(key), isRegistered: (key: string) => registered.has(key),
} }));
vi.mock('@/main/app-config/manager', () => ({ appConfigManager: { getConfig: async () => configState } }));
vi.mock('@/main/plugin-host', () => ({ pluginHost: {} }));
import { ShortcutService } from './service';

describe('owned feature shortcuts', () => {
  beforeEach(() => registered.clear());
  it('registers commands and releases only the feature registrations when hidden', async () => {
    const service = new ShortcutService();
    const action = vi.fn();
    registered.set('Alt+X', () => undefined);
    expect((await service.syncFeatureShortcuts('cheat-sheet', [{ id: 'next', accelerator: 'Ctrl+Alt+Right', action }]))[0].status).toBe('registered');
    registered.get('CommandOrControl+Alt+Right')?.();
    expect(action).toHaveBeenCalledOnce();
    service.clearFeatureShortcuts('cheat-sheet');
    expect([...registered.keys()]).toEqual(['Alt+X']);
  });
  it('reports configured and occupied conflicts without overriding their callbacks', async () => {
    const service = new ShortcutService();
    const existing = vi.fn();
    registered.set('CommandOrControl+Alt+Right', existing);
    const results = await service.syncFeatureShortcuts('cheat-sheet', [
      { id: 'one', accelerator: 'Alt+Space', action: vi.fn() },
      { id: 'two', accelerator: 'Ctrl+Alt+Right', action: vi.fn() },
    ]);
    expect(results.map((r) => r.status)).toEqual(['conflict', 'conflict']);
    expect(registered.get('CommandOrControl+Alt+Right')).toBe(existing);
  });
  it('invalidates pending registration on hide and dispose', async () => {
    const service = new ShortcutService();
    const pending = service.syncFeatureShortcuts('cheat-sheet', [{ id: 'next', accelerator: 'Ctrl+Alt+Right', action: vi.fn() }]);
    service.clearFeatureShortcuts('cheat-sheet');
    await pending;
    expect(registered.size).toBe(0);
    await service.syncFeatureShortcuts('cheat-sheet', [{ id: 'next', accelerator: 'Ctrl+Alt+Right', action: vi.fn() }]);
    service.dispose();
    expect(registered.size).toBe(0);
  });
});
