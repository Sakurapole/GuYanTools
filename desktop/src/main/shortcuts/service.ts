import { BrowserWindow, globalShortcut } from 'electron';
import type { AppConfig } from '@/contracts/app_config';
import { normalizeAccelerator } from '@/shared/shortcuts';
import { appConfigManager } from '@/main/app-config/manager';

type WindowGetter = () => BrowserWindow | null;

class ShortcutService {
  private toggleVisibilityShortcut = '';
  private unsubscribeConfig?: () => void;
  private initialized = false;

  async initialize(getMainWindow: WindowGetter) {
    if (this.initialized) {
      return;
    }

    await this.refresh(await appConfigManager.getConfig(), getMainWindow);
    this.unsubscribeConfig = appConfigManager.subscribe((config) => {
      void this.refresh(config, getMainWindow);
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
  }

  private async refresh(config: AppConfig, getMainWindow: WindowGetter) {
    const accelerator = normalizeAccelerator(config.shortcuts.system.toggleAppVisibility);
    await this.registerToggleVisibilityShortcut(accelerator, getMainWindow);
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
}

export const shortcutService = new ShortcutService();
