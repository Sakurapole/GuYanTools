import { BrowserWindow, globalShortcut } from 'electron';
import type { AppConfig } from '@/contracts/app_config';
import { normalizeAccelerator } from '@/shared/shortcuts';
import { appConfigManager } from '@/main/app-config/manager';

type WindowGetter = () => BrowserWindow | null;
type ClipboardWindowToggle = () => void;

class ShortcutService {
  private toggleVisibilityShortcut = '';
  private toggleClipboardShortcut = '';
  private unsubscribeConfig?: () => void;
  private initialized = false;

  async initialize(getMainWindow: WindowGetter, toggleClipboardWindow?: ClipboardWindowToggle) {
    if (this.initialized) {
      return;
    }

    await this.refresh(await appConfigManager.getConfig(), getMainWindow, toggleClipboardWindow);
    this.unsubscribeConfig = appConfigManager.subscribe((config, patch) => {
      if (!patch?.shortcuts) {
        return;
      }

      void this.refresh(config, getMainWindow, toggleClipboardWindow);
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
  }

  private async refresh(config: AppConfig, getMainWindow: WindowGetter, toggleClipboardWindow?: ClipboardWindowToggle) {
    const accelerator = normalizeAccelerator(config.shortcuts.system.toggleAppVisibility);
    await this.registerToggleVisibilityShortcut(accelerator, getMainWindow);
    const clipboardAccelerator = normalizeAccelerator(config.shortcuts.system.toggleMultiDeviceClipboard);
    await this.registerToggleClipboardShortcut(clipboardAccelerator, toggleClipboardWindow);
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
}

export const shortcutService = new ShortcutService();
