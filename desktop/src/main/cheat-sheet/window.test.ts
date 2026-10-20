import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createDefaultCheatSheetSettings } from '@/contracts/cheat_sheet';
const { order, instances, protection, shortcuts } = vi.hoisted(() => ({
  order: [] as string[], instances: [] as any[], protection: { enabled: true },
  shortcuts: { syncFeatureShortcuts: vi.fn(async () => []), clearFeatureShortcuts: vi.fn() },
}));
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }), getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
  BrowserWindow: class extends EventEmitter {
    destroyed = false; visible = false; bounds = { x: 0, y: 0, width: 520, height: 640 };
    protectionRequested = false; hasShown = false;
  webContents = Object.assign(new EventEmitter(), { send: vi.fn(), setWindowOpenHandler: vi.fn(), isDestroyed: (): boolean => this.destroyed });
    constructor(options: Record<string, unknown>) { super(); Object.assign(this, { options }); instances.push(this); }
    setContentProtection(): void { order.push('protect'); this.protectionRequested = true; }
    isContentProtected() { return this.protectionRequested && this.hasShown && protection.enabled; }
    async loadURL(): Promise<void> { order.push('load'); }
    async loadFile(): Promise<void> { order.push('load'); }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    isMinimized() { return false; }
    show() { order.push('show'); this.visible = true; this.hasShown = true; this.emit('show'); }
    showInactive() { order.push('prime'); this.visible = true; this.hasShown = true; this.emit('show'); }
    hide() { this.visible = false; this.emit('hide'); }
    focus() {}
    restore() {}
    setOpacity(value: number) { order.push(`opacity:${value}`); }
    setAlwaysOnTop() {}
    getBounds() { return this.bounds; }
    setBounds(bounds: typeof this.bounds) { this.bounds = bounds; }
    destroy() { this.destroyed = true; this.emit('closed'); }
    close() { const e = { preventDefault: vi.fn() }; this.emit('close', e); if (!e.preventDefault.mock.calls.length) this.destroy(); }
  },
}));
vi.mock('@/main/shortcuts/service', () => ({ shortcutService: shortcuts }));
vi.mock('@/main/windows/window_icon', () => ({ resolveWindowIconPath: (): undefined => undefined }));
vi.mock('@/main/windows/wait_for_dev_server', () => ({ waitForDevServer: async (): Promise<void> => undefined }));
vi.mock('@/main/windows/persisted_window_bounds', () => ({ resolvePersistedWindowBounds: () => ({ x: 0, y: 0, width: 520, height: 640 }), persistWindowBounds: vi.fn() }));
import { CheatSheetWindow, assertSupportedWindows } from './window';

function bankFixture() {
  const document = { schemaVersion: 1 as const, questions: [] as any[], settings: createDefaultCheatSheetSettings() };
  return { load: vi.fn(async (): Promise<typeof document> => structuredClone(document)), updateSettings: vi.fn(async (patch: Record<string, unknown>): Promise<typeof document.settings> => { Object.assign(document.settings, patch); return document.settings; }), flush: async (): Promise<void> => undefined };
}
describe('protected cheat sheet window', () => {
  beforeEach(() => { order.length = 0; instances.length = 0; protection.enabled = true; vi.clearAllMocks(); });
  it('can construct without an app.getSystemVersion Electron API', () => {
    expect(() => new CheatSheetWindow(bankFixture() as any, () => undefined, 'win32')).not.toThrow();
  });
  it('creates the window without a taskbar button while keeping it focusable', async () => {
    const controller = new CheatSheetWindow(bankFixture() as any, () => undefined, 'win32', '10.0.19041');
    await controller.open();
    expect(instances[0].options).toMatchObject({ skipTaskbar: true, focusable: true });
  });
  it('uses a landscape default window so width is greater than height', async () => {
    const controller = new CheatSheetWindow(bankFixture() as any, () => undefined, 'win32', '10.0.19041');
    await controller.open();
    expect(instances[0].options.width).toBeGreaterThan(instances[0].options.height);
  });
  it('rejects unsupported Windows builds and other platforms', () => {
    expect(() => assertSupportedWindows('linux', '6.1')).toThrow();
    expect(() => assertSupportedWindows('win32', '10.0.18363')).toThrow();
    expect(() => assertSupportedWindows('win32', '10.0.19041')).not.toThrow();
  });
  it('protects before loading/showing and coalesces concurrent opens', async () => {
    const controller = new CheatSheetWindow(bankFixture() as any, () => undefined, 'win32', '10.0.19041');
    await Promise.all([controller.open(), controller.open()]);
    expect(instances).toHaveLength(1);
    expect(order.indexOf('protect')).toBeLessThan(order.indexOf('load'));
    expect(order.indexOf('load')).toBeLessThan(order.indexOf('show'));
  });
  it('primes capture exclusion on an invisible empty window before loading any question content', async () => {
    const controller = new CheatSheetWindow(bankFixture() as any, () => undefined, 'win32', '10.0.19041');
    await controller.open();
    expect(order.indexOf('opacity:0')).toBeLessThan(order.indexOf('prime'));
    expect(order.indexOf('protect')).toBeLessThan(order.indexOf('prime'));
    expect(order.indexOf('prime')).toBeLessThan(order.indexOf('load'));
    expect(order).not.toContain('opacity:0.9');
    expect(instances[0].isContentProtected()).toBe(true);
  });
  it('destroys an unprotected window without showing it', async () => {
    protection.enabled = false;
    const controller = new CheatSheetWindow(bankFixture() as any, () => undefined, 'win32', '10.0.19041');
    await expect(controller.open()).rejects.toThrow(/保护/);
    expect(order).not.toContain('show');
    expect(instances[0].destroyed).toBe(true);
  });
  it('releases reading shortcuts on hide and recreates after close', async () => {
    const controller = new CheatSheetWindow(bankFixture() as any, () => undefined, 'win32', '10.0.19041');
    await controller.open();
    await controller.execute('hide');
    expect(shortcuts.clearFeatureShortcuts).toHaveBeenCalledWith('cheat-sheet');
    await controller.open();
    await controller.execute('close');
    await controller.open();
    expect(instances).toHaveLength(2);
  });
  it('asks the protected renderer before closing a dirty draft', async () => {
    const controller = new CheatSheetWindow(bankFixture() as any, () => undefined, 'win32', '10.0.19041');
    await controller.open();
    controller.ready();
    controller.setDirty(true);
    await controller.execute('close');
    expect(instances[0].destroyed).toBe(false);
    expect(instances[0].webContents.send).toHaveBeenCalledWith('cheat-sheet:command', 'close');
  });
  it('changes the background setting without fading native window text', async () => {
    const bank = bankFixture();
    const controller = new CheatSheetWindow(bank as any, () => undefined, 'win32', '10.0.19041');
    await controller.open();
    order.length = 0;
    await controller.execute('opacity-down');
    expect(bank.updateSettings).toHaveBeenCalledWith({ opacity: 0.85 });
    expect(order).not.toContain('opacity:0.85');
    expect(instances[0].webContents.send).toHaveBeenCalledWith('cheat-sheet:state-changed');
  });
  it('moves vertically through registered global commands and forwards scroll commands without focusing', async () => {
    const controller = new CheatSheetWindow(bankFixture() as any, () => undefined, 'win32', '10.0.19041');
    await controller.open();
    controller.ready();
    const bindings = (shortcuts.syncFeatureShortcuts.mock.calls as unknown as Array<unknown[]>).at(-1)?.[1] as any[];
    const initialY = instances[0].bounds.y;
    await bindings.find((item) => item.id === 'move-down').action();
    expect(instances[0].bounds.y).toBe(initialY + 20);
    await bindings.find((item) => item.id === 'move-up').action();
    expect(instances[0].bounds.y).toBe(initialY);
    await bindings.find((item) => item.id === 'scroll-down').action();
    expect(instances[0].webContents.send).toHaveBeenCalledWith('cheat-sheet:command', 'scroll-down');
  });
  it('resizes the window through the registered shrink and grow commands', async () => {
    const controller = new CheatSheetWindow(bankFixture() as any, () => undefined, 'win32', '10.0.19041');
    await controller.open();
    const bindings = (shortcuts.syncFeatureShortcuts.mock.calls as unknown as Array<unknown[]>).at(-1)?.[1] as any[];
    const initial = { ...instances[0].bounds };
    await bindings.find((item) => item.id === 'grow').action();
    expect(instances[0].bounds.width).toBe(initial.width + 80);
    expect(instances[0].bounds.height).toBe(initial.height + 80);
    await bindings.find((item) => item.id === 'shrink').action();
    expect(instances[0].bounds).toEqual(initial);
  });
});
