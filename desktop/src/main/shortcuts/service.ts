import { BrowserWindow, globalShortcut } from 'electron';
import type { AppConfig } from '@/contracts/app_config';
import { normalizeAccelerator } from '@/shared/shortcuts';
import { appConfigManager } from '@/main/app-config/manager';

type WindowGetter = () => BrowserWindow | null;
type ClipboardWindowToggle = () => void;
type QuickNoteWindowToggle = () => void;
type QuickNoteClipboardCapture = () => void;

class ShortcutService {
  private toggleVisibilityShortcut = '';
  private toggleClipboardShortcut = '';
  private toggleQuickNoteShortcut = '';
  private captureClipboardToQuickNoteShortcut = '';
  private unsubscribeConfig?: () => void;
  private initialized = false;

  async initialize(
    getMainWindow: WindowGetter,
    toggleClipboardWindow?: ClipboardWindowToggle,
    toggleQuickNoteWindow?: QuickNoteWindowToggle,
    captureClipboardToQuickNote?: QuickNoteClipboardCapture,
  ) {
    if (this.initialized) {
      return;
    }

    await this.refresh(
      await appConfigManager.getConfig(),
      getMainWindow,
      toggleClipboardWindow,
      toggleQuickNoteWindow,
      captureClipboardToQuickNote,
    );
    this.unsubscribeConfig = appConfigManager.subscribe((config, patch) => {
      if (!patch?.shortcuts) {
        return;
      }

      void this.refresh(
        config,
        getMainWindow,
        toggleClipboardWindow,
        toggleQuickNoteWindow,
        captureClipboardToQuickNote,
      );
    });
    this.initialized = true;
  }

  dispose() {
    this.unsubscribeConfig?.();
    this.unsubscribeConfig = undefined;

    if (this.toggleVisibilityShortcut) {
      globalShortcut.unregister(this.toggleVisibilityShortcut);
      this.toggleVisibilityShortcut = '';
    }

    if (this.toggleClipboardShortcut) {
      globalShortcut.unregister(this.toggleClipboardShortcut);
      this.toggleClipboardShortcut = '';
    }

    if (this.toggleQuickNoteShortcut) {
      globalShortcut.unregister(this.toggleQuickNoteShortcut);
      this.toggleQuickNoteShortcut = '';
    }

    if (this.captureClipboardToQuickNoteShortcut) {
      globalShortcut.unregister(this.captureClipboardToQuickNoteShortcut);
      this.captureClipboardToQuickNoteShortcut = '';
    }
  }

  private async refresh(
    config: AppConfig,
    getMainWindow: WindowGetter,
    toggleClipboardWindow?: ClipboardWindowToggle,
    toggleQuickNoteWindow?: QuickNoteWindowToggle,
    captureClipboardToQuickNote?: QuickNoteClipboardCapture,
  ) {
    const accelerator = normalizeAccelerator(config.shortcuts.system.toggleAppVisibility);
    await this.registerToggleVisibilityShortcut(accelerator, getMainWindow);
    const clipboardAccelerator = normalizeAccelerator(config.shortcuts.system.toggleMultiDeviceClipboard);
    await this.registerToggleClipboardShortcut(clipboardAccelerator, toggleClipboardWindow);
    const quickNoteAccelerator = normalizeAccelerator(config.shortcuts.system.toggleQuickNote);
    await this.registerSimpleShortcut(
      'toggleQuickNoteShortcut',
      quickNoteAccelerator,
      toggleQuickNoteWindow,
      'quick note toggle',
    );
    const captureAccelerator = normalizeAccelerator(config.shortcuts.system.captureClipboardToQuickNote);
    await this.registerSimpleShortcut(
      'captureClipboardToQuickNoteShortcut',
      captureAccelerator,
      captureClipboardToQuickNote,
      'quick note clipboard capture',
    );
  }

  private async registerToggleVisibilityShortcut(accelerator: string, getMainWindow: WindowGetter) {
    if (this.toggleVisibilityShortcut) {
      globalShortcut.unregister(this.toggleVisibilityShortcut);
      this.toggleVisibilityShortcut = '';
    }

    if (!accelerator) {
      return;
    }

    const registered = globalShortcut.register(accelerator, () => {
      const window = getMainWindow();
      if (!window || window.isDestroyed()) {
        return;
      }

      if (window.isVisible() && !window.isMinimized() && window.isFocused()) {
        window.hide();
        return;
      }

      if (window.isMinimized()) {
        window.restore();
      }

      if (!window.isVisible()) {
        window.show();
      }

      window.focus();
    });

    if (!registered) {
      console.warn(`[ShortcutService] Failed to register global shortcut: ${accelerator}`);
      return;
    }

    this.toggleVisibilityShortcut = accelerator;
  }

  private async registerToggleClipboardShortcut(accelerator: string, toggleClipboardWindow?: ClipboardWindowToggle) {
    if (this.toggleClipboardShortcut) {
      globalShortcut.unregister(this.toggleClipboardShortcut);
      this.toggleClipboardShortcut = '';
    }

    if (!accelerator || !toggleClipboardWindow) {
      return;
    }

    const registered = globalShortcut.register(accelerator, () => {
      toggleClipboardWindow();
    });

    if (!registered) {
      console.warn(`[ShortcutService] Failed to register multi-device clipboard shortcut: ${accelerator}`);
      return;
    }

    this.toggleClipboardShortcut = accelerator;
  }

  private async registerSimpleShortcut(
    field: 'toggleQuickNoteShortcut' | 'captureClipboardToQuickNoteShortcut',
    accelerator: string,
    action: (() => void) | undefined,
    label: string,
  ) {
    if (this[field]) {
      globalShortcut.unregister(this[field]);
      this[field] = '';
    }

    if (!accelerator || !action) {
      return;
    }

    const registered = globalShortcut.register(accelerator, action);

    if (!registered) {
      console.warn(`[ShortcutService] Failed to register ${label} shortcut: ${accelerator}`);
      return;
    }

    this[field] = accelerator;
  }
}

export const shortcutService = new ShortcutService();
