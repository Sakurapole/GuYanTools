import { BrowserWindow, globalShortcut } from 'electron';
import type { AppConfig, AppSystemShortcutsConfig } from '@/contracts/app_config';
import { createDefaultAppConfig } from '@/contracts/app_config';
import type {
  AppSystemShortcutKey,
  ShortcutInspectionResult,
  ShortcutProbeSource,
  RetrySystemShortcutInput,
  RetrySystemShortcutResult,
  SystemShortcutProbeResult,
  ValidateSystemShortcutInput,
  ValidateSystemShortcutResult,
} from '@/contracts/shortcuts';
import { normalizeAccelerator } from '@/shared/shortcuts';
import { appConfigManager } from '@/main/app-config/manager';
import type { WorkspaceWindowKey } from '@/contracts/workspace_window';

type WindowGetter = () => BrowserWindow | null;
type ClipboardWindowToggle = () => void;
type QuickNoteWindowToggle = () => void;
type QuickNoteClipboardCapture = () => void;
type QuickLaunchWindowToggle = () => void;
type ScreenshotCaptureOpener = () => void;
type WorkspaceDetachedWindowOpener = (key: WorkspaceWindowKey) => void;
type RegisteredShortcutField =
  | 'toggleVisibilityShortcut'
  | 'toggleClipboardShortcut'
  | 'toggleQuickNoteShortcut'
  | 'captureClipboardToQuickNoteShortcut'
  | 'captureScreenshotRegionShortcut'
  | 'captureScreenshotAnnotateShortcut'
  | 'toggleQuickLaunchShortcut'
  | 'openDetachedTerminalShortcut'
  | 'openDetachedFtpShortcut'
  | 'openDetachedTodoShortcut'
  | 'openDetachedAiShortcut'
  | 'openDetachedKnowledgeShortcut';

interface SystemShortcutActionDefinition {
  key: AppSystemShortcutKey;
  field: RegisteredShortcutField;
  label: string;
}

interface CommonShortcutCandidate {
  id: string;
  label: string;
  accelerator: string;
}

const SYSTEM_SHORTCUT_ACTIONS: SystemShortcutActionDefinition[] = [
  { key: 'toggleAppVisibility', field: 'toggleVisibilityShortcut', label: '显示/隐藏应用' },
  { key: 'toggleMultiDeviceClipboard', field: 'toggleClipboardShortcut', label: '多设备剪贴板' },
  { key: 'toggleQuickNote', field: 'toggleQuickNoteShortcut', label: '知识库速记' },
  { key: 'captureClipboardToQuickNote', field: 'captureClipboardToQuickNoteShortcut', label: '剪贴板转速记' },
  { key: 'captureScreenshotRegion', field: 'captureScreenshotRegionShortcut', label: '区域截图识别' },
  { key: 'captureScreenshotAnnotate', field: 'captureScreenshotAnnotateShortcut', label: '截图标注' },
  { key: 'toggleQuickLaunch', field: 'toggleQuickLaunchShortcut', label: '快速启动' },
  { key: 'openDetachedTerminal', field: 'openDetachedTerminalShortcut', label: '独立窗口：终端' },
  { key: 'openDetachedFtp', field: 'openDetachedFtpShortcut', label: '独立窗口：传输' },
  { key: 'openDetachedTodo', field: 'openDetachedTodoShortcut', label: '独立窗口：待办' },
  { key: 'openDetachedAi', field: 'openDetachedAiShortcut', label: '独立窗口：AI' },
  { key: 'openDetachedKnowledge', field: 'openDetachedKnowledgeShortcut', label: '独立窗口：知识库' },
];

const COMMON_SHORTCUT_CANDIDATES: Record<string, CommonShortcutCandidate[]> = {
  win32: [
    { id: 'task-manager', label: '系统：任务管理器', accelerator: 'CommandOrControl+Shift+Escape' },
    { id: 'run', label: '系统：运行', accelerator: 'Super+R' },
    { id: 'quick-settings', label: '系统：快速设置', accelerator: 'Super+A' },
    { id: 'notification-center', label: '系统：通知中心', accelerator: 'Super+N' },
    { id: 'clipboard-history', label: '系统：剪贴板历史', accelerator: 'Super+V' },
    { id: 'snipping', label: '系统：截图', accelerator: 'Super+Shift+S' },
    { id: 'lock-screen', label: '系统：锁定', accelerator: 'Super+L' },
    { id: 'desktop', label: '系统：显示桌面', accelerator: 'Super+D' },
    { id: 'settings', label: '系统：设置', accelerator: 'Super+I' },
    { id: 'explorer', label: '系统：资源管理器', accelerator: 'Super+E' },
    { id: 'search', label: '系统：搜索', accelerator: 'Super+S' },
    { id: 'x-menu', label: '系统：快捷菜单', accelerator: 'Super+X' },
    { id: 'alt-space', label: '系统：窗口菜单', accelerator: 'Alt+Space' },
  ],
  darwin: [
    { id: 'spotlight', label: '系统：Spotlight', accelerator: 'CommandOrControl+Space' },
    { id: 'force-quit', label: '系统：强制退出', accelerator: 'CommandOrControl+Alt+Escape' },
    { id: 'screenshot-area', label: '系统：区域截图', accelerator: 'CommandOrControl+Shift+4' },
    { id: 'screenshot-screen', label: '系统：全屏截图', accelerator: 'CommandOrControl+Shift+3' },
    { id: 'mission-control', label: '系统：调度中心', accelerator: 'Super+Up' },
    { id: 'app-windows', label: '系统：应用窗口', accelerator: 'Super+Down' },
    { id: 'hide-app', label: '系统：隐藏应用', accelerator: 'CommandOrControl+H' },
  ],
  linux: [
    { id: 'terminal', label: '系统：终端', accelerator: 'CommandOrControl+Alt+T' },
    { id: 'lock-screen', label: '系统：锁屏', accelerator: 'Super+L' },
    { id: 'launcher', label: '系统：启动器', accelerator: 'Super+A' },
    { id: 'screenshot', label: '系统：截图', accelerator: 'PrintScreen' },
    { id: 'show-desktop', label: '系统：显示桌面', accelerator: 'Super+D' },
    { id: 'run-command', label: '系统：运行命令', accelerator: 'Alt+F2' },
  ],
};

class ShortcutService {
  private toggleVisibilityShortcut = '';
  private toggleClipboardShortcut = '';
  private toggleQuickNoteShortcut = '';
  private captureClipboardToQuickNoteShortcut = '';
  private captureScreenshotRegionShortcut = '';
  private captureScreenshotAnnotateShortcut = '';
  private toggleQuickLaunchShortcut = '';
  private openDetachedTerminalShortcut = '';
  private openDetachedFtpShortcut = '';
  private openDetachedTodoShortcut = '';
  private openDetachedAiShortcut = '';
  private openDetachedKnowledgeShortcut = '';
  private unsubscribeConfig?: () => void;
  private initialized = false;
  private getMainWindow?: WindowGetter;
  private toggleClipboardWindow?: ClipboardWindowToggle;
  private toggleQuickNoteWindow?: QuickNoteWindowToggle;
  private captureClipboardToQuickNote?: QuickNoteClipboardCapture;
  private captureScreenshotRegion?: ScreenshotCaptureOpener;
  private captureScreenshotAnnotate?: ScreenshotCaptureOpener;
  private toggleQuickLaunchWindow?: QuickLaunchWindowToggle;
  private openWorkspaceDetachedWindow?: WorkspaceDetachedWindowOpener;

  async initialize(
    getMainWindow: WindowGetter,
    toggleClipboardWindow?: ClipboardWindowToggle,
    toggleQuickNoteWindow?: QuickNoteWindowToggle,
    captureClipboardToQuickNote?: QuickNoteClipboardCapture,
    toggleQuickLaunchWindow?: QuickLaunchWindowToggle,
    captureScreenshotRegion?: ScreenshotCaptureOpener,
    captureScreenshotAnnotate?: ScreenshotCaptureOpener,
    openWorkspaceDetachedWindow?: WorkspaceDetachedWindowOpener,
  ) {
    if (this.initialized) {
      return;
    }

    this.getMainWindow = getMainWindow;
    this.toggleClipboardWindow = toggleClipboardWindow;
    this.toggleQuickNoteWindow = toggleQuickNoteWindow;
    this.captureClipboardToQuickNote = captureClipboardToQuickNote;
    this.captureScreenshotRegion = captureScreenshotRegion;
    this.captureScreenshotAnnotate = captureScreenshotAnnotate;
    this.toggleQuickLaunchWindow = toggleQuickLaunchWindow;
    this.openWorkspaceDetachedWindow = openWorkspaceDetachedWindow;

    await this.refresh(
      await appConfigManager.getConfig(),
      getMainWindow,
      toggleClipboardWindow,
      toggleQuickNoteWindow,
      captureClipboardToQuickNote,
      toggleQuickLaunchWindow,
      captureScreenshotRegion,
      captureScreenshotAnnotate,
      openWorkspaceDetachedWindow,
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
        toggleQuickLaunchWindow,
        captureScreenshotRegion,
        captureScreenshotAnnotate,
        openWorkspaceDetachedWindow,
      );
    });
    this.initialized = true;
  }

  dispose() {
    this.unsubscribeConfig?.();
    this.unsubscribeConfig = undefined;
    this.getMainWindow = undefined;
    this.toggleClipboardWindow = undefined;
    this.toggleQuickNoteWindow = undefined;
    this.captureClipboardToQuickNote = undefined;
    this.captureScreenshotRegion = undefined;
    this.captureScreenshotAnnotate = undefined;
    this.toggleQuickLaunchWindow = undefined;
    this.openWorkspaceDetachedWindow = undefined;

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

    if (this.captureScreenshotRegionShortcut) {
      globalShortcut.unregister(this.captureScreenshotRegionShortcut);
      this.captureScreenshotRegionShortcut = '';
    }

    if (this.captureScreenshotAnnotateShortcut) {
      globalShortcut.unregister(this.captureScreenshotAnnotateShortcut);
      this.captureScreenshotAnnotateShortcut = '';
    }

    if (this.toggleQuickLaunchShortcut) {
      globalShortcut.unregister(this.toggleQuickLaunchShortcut);
      this.toggleQuickLaunchShortcut = '';
    }

    for (const field of [
      'openDetachedTerminalShortcut',
      'openDetachedFtpShortcut',
      'openDetachedTodoShortcut',
      'openDetachedAiShortcut',
      'openDetachedKnowledgeShortcut',
    ] as const) {
      if (this[field]) {
        globalShortcut.unregister(this[field]);
        this[field] = '';
      }
    }
  }

  async inspectSystemShortcuts(): Promise<ShortcutInspectionResult> {
    const config = await appConfigManager.getConfig();
    const defaults = createDefaultAppConfig().shortcuts.system;
    const configuredAccelerators = new Set<string>();

    const actions = SYSTEM_SHORTCUT_ACTIONS.map((action) => {
      configuredAccelerators.add(normalizeAccelerator(config.shortcuts.system[action.key]));
      return this.probeAccelerator({
        id: action.key,
        label: action.label,
        accelerator: config.shortcuts.system[action.key],
        source: 'configured',
        actionKey: action.key,
        config,
      });
    });

    for (const action of SYSTEM_SHORTCUT_ACTIONS) {
      configuredAccelerators.add(normalizeAccelerator(defaults[action.key]));
    }

    const common = this.getCommonShortcutCandidates()
      .filter((candidate) => {
        const normalized = normalizeAccelerator(candidate.accelerator);
        return normalized && !configuredAccelerators.has(normalized);
      })
      .map((candidate) => this.probeAccelerator({
        id: candidate.id,
        label: candidate.label,
        accelerator: candidate.accelerator,
        source: 'common',
        config,
      }));

    return {
      platform: process.platform,
      checkedAt: Date.now(),
      actions,
      common,
      summary: this.summarizeProbes([...actions, ...common]),
    };
  }

  async validateSystemShortcut(input: ValidateSystemShortcutInput): Promise<ValidateSystemShortcutResult> {
    const config = await appConfigManager.getConfig();
    const action = SYSTEM_SHORTCUT_ACTIONS.find((item) => item.key === input.actionKey);
    const probe = this.probeAccelerator({
      id: input.actionKey,
      label: action?.label ?? input.actionKey,
      accelerator: input.accelerator,
      source: 'configured',
      actionKey: input.actionKey,
      config,
    });

    return {
      ok: probe.status === 'available' || probe.status === 'registered' || probe.status === 'empty',
      probe,
    };
  }

  async retrySystemShortcut(input: RetrySystemShortcutInput): Promise<RetrySystemShortcutResult> {
    const config = await appConfigManager.getConfig();
    const action = SYSTEM_SHORTCUT_ACTIONS.find((item) => item.key === input.actionKey);
    if (!action) {
      return {
        ok: false,
        probe: {
          id: input.actionKey,
          label: input.actionKey,
          accelerator: '',
          normalizedAccelerator: '',
          source: 'configured',
          status: 'invalid',
          owner: 'invalid',
          actionKey: input.actionKey,
          message: '未知快捷键动作，无法重新注册。',
        },
      };
    }

    const beforeProbe = this.probeAccelerator({
      id: action.key,
      label: action.label,
      accelerator: config.shortcuts.system[action.key],
      source: 'configured',
      actionKey: action.key,
      config,
    });
    if (beforeProbe.status === 'empty' || beforeProbe.status === 'invalid' || beforeProbe.owner === 'app') {
      return {
        ok: beforeProbe.status === 'registered',
        probe: beforeProbe,
      };
    }

    const registered = await this.registerConfiguredShortcut(action, config);
    const probe = this.probeAccelerator({
      id: action.key,
      label: action.label,
      accelerator: config.shortcuts.system[action.key],
      source: 'configured',
      actionKey: action.key,
      config,
    });

    return {
      ok: registered,
      probe: {
        ...probe,
        status: registered ? 'registered' : probe.status,
        owner: registered ? 'app' : probe.owner,
        message: registered ? '注册成功。' : '注册失败，可能仍被系统或其他应用占用。',
      },
    };
  }

  private async refresh(
    config: AppConfig,
    getMainWindow: WindowGetter,
    toggleClipboardWindow?: ClipboardWindowToggle,
    toggleQuickNoteWindow?: QuickNoteWindowToggle,
    captureClipboardToQuickNote?: QuickNoteClipboardCapture,
    toggleQuickLaunchWindow?: QuickLaunchWindowToggle,
    captureScreenshotRegion?: ScreenshotCaptureOpener,
    captureScreenshotAnnotate?: ScreenshotCaptureOpener,
    openWorkspaceDetachedWindow?: WorkspaceDetachedWindowOpener,
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
    const screenshotAccelerator = normalizeAccelerator(config.shortcuts.system.captureScreenshotRegion);
    await this.registerSimpleShortcut(
      'captureScreenshotRegionShortcut',
      screenshotAccelerator,
      captureScreenshotRegion,
      'screenshot region capture',
    );
    const screenshotAnnotateAccelerator = normalizeAccelerator(config.shortcuts.system.captureScreenshotAnnotate);
    await this.registerSimpleShortcut(
      'captureScreenshotAnnotateShortcut',
      screenshotAnnotateAccelerator,
      captureScreenshotAnnotate,
      'screenshot annotate capture',
    );
    const quickLaunchAccelerator = normalizeAccelerator(config.shortcuts.system.toggleQuickLaunch);
    await this.registerSimpleShortcut(
      'toggleQuickLaunchShortcut',
      quickLaunchAccelerator,
      toggleQuickLaunchWindow,
      'quick launch toggle',
    );
    await this.registerDetachedWindowShortcut('openDetachedTerminalShortcut', config.shortcuts.system.openDetachedTerminal, 'terminal', openWorkspaceDetachedWindow);
    await this.registerDetachedWindowShortcut('openDetachedFtpShortcut', config.shortcuts.system.openDetachedFtp, 'ftp', openWorkspaceDetachedWindow);
    await this.registerDetachedWindowShortcut('openDetachedTodoShortcut', config.shortcuts.system.openDetachedTodo, 'todo', openWorkspaceDetachedWindow);
    await this.registerDetachedWindowShortcut('openDetachedAiShortcut', config.shortcuts.system.openDetachedAi, 'ai', openWorkspaceDetachedWindow);
    await this.registerDetachedWindowShortcut('openDetachedKnowledgeShortcut', config.shortcuts.system.openDetachedKnowledge, 'knowledge', openWorkspaceDetachedWindow);
  }

  private async registerConfiguredShortcut(action: SystemShortcutActionDefinition, config: AppConfig) {
    const accelerator = normalizeAccelerator(config.shortcuts.system[action.key]);
    switch (action.key) {
      case 'toggleAppVisibility':
        if (!this.getMainWindow) return false;
        return this.registerToggleVisibilityShortcut(accelerator, this.getMainWindow);
      case 'toggleMultiDeviceClipboard':
        return this.registerToggleClipboardShortcut(accelerator, this.toggleClipboardWindow);
      case 'toggleQuickNote':
        return this.registerSimpleShortcut(
          'toggleQuickNoteShortcut',
          accelerator,
          this.toggleQuickNoteWindow,
          'quick note toggle',
        );
      case 'captureClipboardToQuickNote':
        return this.registerSimpleShortcut(
          'captureClipboardToQuickNoteShortcut',
          accelerator,
          this.captureClipboardToQuickNote,
          'quick note clipboard capture',
        );
      case 'captureScreenshotRegion':
        return this.registerSimpleShortcut(
          'captureScreenshotRegionShortcut',
          accelerator,
          this.captureScreenshotRegion,
          'screenshot region capture',
        );
      case 'captureScreenshotAnnotate':
        return this.registerSimpleShortcut(
          'captureScreenshotAnnotateShortcut',
          accelerator,
          this.captureScreenshotAnnotate,
          'screenshot annotate capture',
        );
      case 'toggleQuickLaunch':
        return this.registerSimpleShortcut(
          'toggleQuickLaunchShortcut',
          accelerator,
          this.toggleQuickLaunchWindow,
          'quick launch toggle',
        );
      case 'openDetachedTerminal':
        return this.registerDetachedWindowShortcut('openDetachedTerminalShortcut', accelerator, 'terminal', this.openWorkspaceDetachedWindow, true);
      case 'openDetachedFtp':
        return this.registerDetachedWindowShortcut('openDetachedFtpShortcut', accelerator, 'ftp', this.openWorkspaceDetachedWindow, true);
      case 'openDetachedTodo':
        return this.registerDetachedWindowShortcut('openDetachedTodoShortcut', accelerator, 'todo', this.openWorkspaceDetachedWindow, true);
      case 'openDetachedAi':
        return this.registerDetachedWindowShortcut('openDetachedAiShortcut', accelerator, 'ai', this.openWorkspaceDetachedWindow, true);
      case 'openDetachedKnowledge':
        return this.registerDetachedWindowShortcut('openDetachedKnowledgeShortcut', accelerator, 'knowledge', this.openWorkspaceDetachedWindow, true);
      default:
        return false;
    }
  }

  private async registerToggleVisibilityShortcut(accelerator: string, getMainWindow: WindowGetter) {
    if (this.toggleVisibilityShortcut) {
      globalShortcut.unregister(this.toggleVisibilityShortcut);
      this.toggleVisibilityShortcut = '';
    }

    if (!accelerator) {
      return false;
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
      return false;
    }

    this.toggleVisibilityShortcut = accelerator;
    return true;
  }

  private async registerToggleClipboardShortcut(accelerator: string, toggleClipboardWindow?: ClipboardWindowToggle) {
    if (this.toggleClipboardShortcut) {
      globalShortcut.unregister(this.toggleClipboardShortcut);
      this.toggleClipboardShortcut = '';
    }

    if (!accelerator || !toggleClipboardWindow) {
      return false;
    }

    const registered = globalShortcut.register(accelerator, () => {
      toggleClipboardWindow();
    });

    if (!registered) {
      console.warn(`[ShortcutService] Failed to register multi-device clipboard shortcut: ${accelerator}`);
      return false;
    }

    this.toggleClipboardShortcut = accelerator;
    return true;
  }

  private async registerSimpleShortcut(
    field: RegisteredShortcutField,
    accelerator: string,
    action: (() => void) | undefined,
    label: string,
  ) {
    if (this[field]) {
      globalShortcut.unregister(this[field]);
      this[field] = '';
    }

    if (!accelerator || !action) {
      return false;
    }

    const registered = globalShortcut.register(accelerator, action);

    if (!registered) {
      console.warn(`[ShortcutService] Failed to register ${label} shortcut: ${accelerator}`);
      return false;
    }

    this[field] = accelerator;
    return true;
  }

  private async registerDetachedWindowShortcut(
    field: RegisteredShortcutField,
    acceleratorOrRaw: string,
    key: WorkspaceWindowKey,
    openWorkspaceDetachedWindow?: WorkspaceDetachedWindowOpener,
    alreadyNormalized = false,
  ) {
    const accelerator = alreadyNormalized ? acceleratorOrRaw : normalizeAccelerator(acceleratorOrRaw);
    return this.registerSimpleShortcut(
      field,
      accelerator,
      openWorkspaceDetachedWindow ? () => openWorkspaceDetachedWindow(key) : undefined,
      `detached ${key} window`,
    );
  }

  private probeAccelerator(input: {
    id: string;
    label: string;
    accelerator: string;
    source: ShortcutProbeSource;
    actionKey?: AppSystemShortcutKey;
    config: AppConfig;
  }): SystemShortcutProbeResult {
    const normalizedAccelerator = normalizeAccelerator(input.accelerator);
    const trimmedAccelerator = input.accelerator.trim();

    if (!normalizedAccelerator) {
      const isEmpty = !trimmedAccelerator;
      return {
        id: input.id,
        label: input.label,
        accelerator: input.accelerator,
        normalizedAccelerator,
        source: input.source,
        status: isEmpty ? 'empty' : 'invalid',
        owner: isEmpty ? 'available' : 'invalid',
        actionKey: input.actionKey,
        message: isEmpty ? '未设置快捷键，不会注册到系统。' : '快捷键格式无效，无法注册。',
      };
    }

    const configuredConflict = this.findConfiguredConflict(
      input.config.shortcuts.system,
      normalizedAccelerator,
      input.actionKey,
    );
    if (configuredConflict) {
      return {
        id: input.id,
        label: input.label,
        accelerator: input.accelerator,
        normalizedAccelerator,
        source: input.source,
        status: 'conflict',
        owner: 'app',
        actionKey: input.actionKey,
        conflictActionKey: configuredConflict.key,
        conflictLabel: configuredConflict.label,
        message: `与本应用「${configuredConflict.label}」快捷键重复。`,
      };
    }

    const registeredAction = this.findRegisteredAppAction(normalizedAccelerator);
    if (registeredAction) {
      const isCurrentAction = !input.actionKey || registeredAction.key === input.actionKey;
      return {
        id: input.id,
        label: input.label,
        accelerator: input.accelerator,
        normalizedAccelerator,
        source: input.source,
        status: isCurrentAction ? 'registered' : 'conflict',
        owner: 'app',
        actionKey: input.actionKey,
        conflictActionKey: isCurrentAction ? undefined : registeredAction.key,
        conflictLabel: isCurrentAction ? undefined : registeredAction.label,
        message: isCurrentAction
          ? '已由本应用成功注册。'
          : `已被本应用「${registeredAction.label}」注册。`,
      };
    }

    try {
      const registered = globalShortcut.register(normalizedAccelerator, () => undefined);
      if (registered) {
        globalShortcut.unregister(normalizedAccelerator);
        return {
          id: input.id,
          label: input.label,
          accelerator: input.accelerator,
          normalizedAccelerator,
          source: input.source,
          status: 'available',
          owner: 'available',
          actionKey: input.actionKey,
          message: '当前可注册。',
        };
      }
    } catch (error) {
      return {
        id: input.id,
        label: input.label,
        accelerator: input.accelerator,
        normalizedAccelerator,
        source: input.source,
        status: 'invalid',
        owner: 'invalid',
        actionKey: input.actionKey,
        message: error instanceof Error ? error.message : 'Electron 无法解析该快捷键。',
      };
    }

    return {
      id: input.id,
      label: input.label,
      accelerator: input.accelerator,
      normalizedAccelerator,
      source: input.source,
      status: 'conflict',
      owner: 'system-or-other-app',
      actionKey: input.actionKey,
      message: '注册探测失败，可能已被系统或其他应用占用。',
    };
  }

  private findConfiguredConflict(
    shortcuts: AppSystemShortcutsConfig,
    normalizedAccelerator: string,
    excludeActionKey?: AppSystemShortcutKey,
  ) {
    return SYSTEM_SHORTCUT_ACTIONS.find((action) => (
      action.key !== excludeActionKey
      && normalizeAccelerator(shortcuts[action.key]) === normalizedAccelerator
    ));
  }

  private findRegisteredAppAction(normalizedAccelerator: string) {
    return SYSTEM_SHORTCUT_ACTIONS.find((action) => (
      this[action.field] === normalizedAccelerator && globalShortcut.isRegistered(normalizedAccelerator)
    ));
  }

  private getCommonShortcutCandidates() {
    return COMMON_SHORTCUT_CANDIDATES[process.platform]
      ?? COMMON_SHORTCUT_CANDIDATES.linux
      ?? [];
  }

  private summarizeProbes(probes: SystemShortcutProbeResult[]): ShortcutInspectionResult['summary'] {
    return probes.reduce<ShortcutInspectionResult['summary']>((summary, probe) => {
      summary[probe.status] += 1;
      return summary;
    }, {
      registered: 0,
      available: 0,
      conflict: 0,
      invalid: 0,
      empty: 0,
    });
  }
}

export const shortcutService = new ShortcutService();
