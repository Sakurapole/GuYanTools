import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import os from 'node:os';
import type { CheatSheetBank } from './bank';
import { createDefaultCheatSheetSettings, type CheatSheetCommand, type CheatSheetSettings } from '@/contracts/cheat_sheet';
import { shortcutService, type FeatureShortcutBinding } from '@/main/shortcuts/service';
import { resolveWindowIconPath } from '@/main/windows/window_icon';
import { waitForDevServer } from '@/main/windows/wait_for_dev_server';
import { persistWindowBounds, resolvePersistedWindowBounds } from '@/main/windows/persisted_window_bounds';

const OWNER = 'cheat-sheet';
const MIN_WIDTH = 360;
const MIN_HEIGHT = 280;
const DEFAULT_BOUNDS = { width: 760, height: 520 };
const LEGACY_DEFAULT_BOUNDS = { width: 520, height: 640 };
const electronSystemVersion = () => {
  const electronProcess = process as NodeJS.Process & { getSystemVersion?: () => string };
  return electronProcess.getSystemVersion?.() ?? os.release();
};
export function assertSupportedWindows(platform = process.platform, release = electronSystemVersion()) {
  if (platform !== 'win32') throw new Error('Windows 小抄只支持 Windows。');
  const build = Number(release.split('.').at(-1));
  if (!Number.isFinite(build) || build < 19041) throw new Error('需要 Windows 10 2004（build 19041）或更高版本。');
}

export class CheatSheetWindow {
  private window: BrowserWindow | null = null;
  private opening: Promise<void> | null = null;
  private dirty = false;
  private rendererReady = false;
  private settings: CheatSheetSettings = createDefaultCheatSheetSettings();
  constructor(private readonly bank: Pick<CheatSheetBank, 'load' | 'updateSettings' | 'flush'>, private readonly devUrl = () => typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'undefined' ? undefined : MAIN_WINDOW_VITE_DEV_SERVER_URL, private readonly platform = process.platform, private readonly release = electronSystemVersion()) {}

  async open() {
    assertSupportedWindows(this.platform, this.release);
    if (this.opening) return this.opening;
    if (this.window && !this.window.isDestroyed()) { this.window.show(); this.window.focus(); await this.registerReadingShortcuts(); return; }
    this.opening = this.create();
    try { await this.opening; } finally { this.opening = null; }
  }
  private async create() {
    const document = await this.bank.load();
    this.settings = document.settings;
    const persistedBounds = resolvePersistedWindowBounds({ stateFileName: 'cheat_sheet_window.json', key: 'main', ...DEFAULT_BOUNDS, minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT });
    const bounds = migrateLegacyDefaultBounds(persistedBounds);
    const win = new BrowserWindow({ ...bounds, minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT, frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: this.settings.alwaysOnTop, skipTaskbar: true, focusable: true, show: false, title: 'Windows 小抄', icon: resolveWindowIconPath(), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
    this.window = win;
    try {
      // Electron 37 applies Windows display affinity on the first native show.
      // Prime an empty, fully transparent window before loading question content.
      win.setOpacity(0);
      win.setContentProtection(true);
      win.showInactive();
      if (!win.isContentProtected()) throw new Error('系统未启用窗口捕获保护。');
      win.hide();
    } catch (error) {
      win.destroy(); this.window = null;
      throw new Error('无法启用 Windows 屏幕捕获保护，窗口已保持隐藏。', { cause: error });
    }
    persistWindowBounds(win, { stateFileName: 'cheat_sheet_window.json', key: 'main', minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.on('did-finish-load', () => { this.rendererReady = true; win.webContents.send('cheat-sheet:state-changed'); });
    win.on('hide', () => { shortcutService.clearFeatureShortcuts(OWNER); });
    win.on('closed', () => { shortcutService.clearFeatureShortcuts(OWNER); this.window = null; this.rendererReady = false; });
    const url = this.devUrl();
    if (url) { await waitForDevServer(`${url}/cheat_sheet.html`); await win.loadURL(`${url}/cheat_sheet.html`); }
    else await win.loadFile(path.join(__dirname, `../renderer/${(globalThis as any).MAIN_WINDOW_VITE_NAME ?? 'main_window'}/cheat_sheet.html`));
    win.setOpacity(1);
    win.show();
    await this.registerReadingShortcuts();
  }
  private async registerReadingShortcuts() {
    const bindings: FeatureShortcutBinding[] = [...Object.entries(this.settings.shortcuts), ...Object.entries(this.settings.internalShortcuts)].map(([id, accelerator]) => ({ id, accelerator, action: () => this.execute(id as CheatSheetCommand) }));
    await shortcutService.syncFeatureShortcuts(OWNER, bindings);
  }
  async execute(command: CheatSheetCommand) {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    if (command === 'hide' || command === 'close') { if (this.dirty && this.rendererReady) { win.webContents.send('cheat-sheet:command', command); return; } if (command === 'hide') win.hide(); else win.destroy(); return; }
    if (command === 'toggle') { if (win.isVisible()) win.hide(); else { win.show(); await this.registerReadingShortcuts(); } return; }
    if (command === 'pin') { this.settings.alwaysOnTop = !this.settings.alwaysOnTop; win.setAlwaysOnTop(this.settings.alwaysOnTop); await this.bank.updateSettings({ alwaysOnTop: this.settings.alwaysOnTop }); return; }
    if (command === 'opacity-down' || command === 'opacity-up') { const delta = command === 'opacity-up' ? 0.05 : -0.05; this.settings.opacity = Math.min(1, Math.max(0.2, Number((this.settings.opacity + delta).toFixed(2)))); await this.bank.updateSettings({ opacity: this.settings.opacity }); win.webContents.send('cheat-sheet:state-changed'); return; }
    if (command === 'reset') { const area = screen.getPrimaryDisplay().workArea; win.setBounds({ x: Math.round(area.x + (area.width - DEFAULT_BOUNDS.width) / 2), y: Math.round(area.y + (area.height - DEFAULT_BOUNDS.height) / 2), ...DEFAULT_BOUNDS }); this.settings.opacity = 0.9; await this.bank.updateSettings({ opacity: 0.9 }); win.webContents.send('cheat-sheet:state-changed'); return; }
    const bounds = win.getBounds();
    const movement: Record<string, [number, number]> = { 'move-left': [-20, 0], 'move-right': [20, 0], 'move-up': [0, -20], 'move-down': [0, 20] };
    if (command in movement) { const [dx, dy] = movement[command]; const area = screen.getDisplayMatching(bounds).workArea; win.setBounds({ ...bounds, x: Math.min(area.x + area.width - 80, Math.max(area.x - bounds.width + 80, bounds.x + dx)), y: Math.min(area.y + area.height - 40, Math.max(area.y, bounds.y + dy)) }); return; }
    if (command === 'shrink' || command === 'grow') { const delta = command === 'grow' ? 80 : -80; win.setBounds({ ...bounds, width: Math.max(MIN_WIDTH, Math.min(1600, bounds.width + delta)), height: Math.max(MIN_HEIGHT, Math.min(1200, bounds.height + delta)) }); return; }
    if (this.rendererReady) win.webContents.send('cheat-sheet:command', command);
  }
  setDirty(dirty: boolean) { this.dirty = dirty; }
  ready() { this.rendererReady = true; }
  async close() { await this.bank.flush(); if (this.window && !this.window.isDestroyed()) this.window.destroy(); }
  getWindow() { return this.window; }
}

function migrateLegacyDefaultBounds(bounds: Electron.Rectangle): Electron.Rectangle {
  if (bounds.width !== LEGACY_DEFAULT_BOUNDS.width || bounds.height !== LEGACY_DEFAULT_BOUNDS.height) {
    return bounds;
  }

  return {
    ...bounds,
    x: Math.round(bounds.x - (DEFAULT_BOUNDS.width - LEGACY_DEFAULT_BOUNDS.width) / 2),
    y: Math.round(bounds.y + (LEGACY_DEFAULT_BOUNDS.height - DEFAULT_BOUNDS.height) / 2),
    ...DEFAULT_BOUNDS,
  };
}
