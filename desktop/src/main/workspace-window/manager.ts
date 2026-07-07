import { BrowserWindow } from 'electron';
import path from 'path';
import {
  isWorkspaceWindowKey,
  WORKSPACE_WINDOW_DEFINITIONS,
  type WorkspaceDetachedWindowState,
  type WorkspaceWindowPageState,
  type WorkspaceWindowContext,
  type WorkspaceWindowKey,
} from '@/contracts/workspace_window';
import { resolveWindowIconPath } from '../windows/window_icon';
import { persistWindowBounds, resolvePersistedWindowBounds } from '../windows/persisted_window_bounds';

const WORKSPACE_WINDOW_BOUNDS_STATE_FILE = 'workspace_window_bounds.json';

type MainWindowBridge = {
  getWindow: () => BrowserWindow | null;
  showWindow: () => void;
  navigateToHash: (hashPath: string) => Promise<void>;
};

class WorkspaceWindowManager {
  private mainWindow?: MainWindowBridge;
  private readonly detachedWindows = new Map<WorkspaceWindowKey, BrowserWindow>();
  private readonly prewarmedWindows = new Map<WorkspaceWindowKey, BrowserWindow>();
  private readonly pageStates = new Map<WorkspaceWindowKey, WorkspaceWindowPageState>();
  private prewarmStarted = false;

  bindMainWindow(bridge: MainWindowBridge) {
    this.mainWindow = bridge;
  }

  async openDetached(key: WorkspaceWindowKey, options?: { routeOverride?: string }): Promise<WorkspaceDetachedWindowState> {
    const definition = WORKSPACE_WINDOW_DEFINITIONS[key];
    if (!definition) {
      throw new Error(`未知独立窗口页面: ${key}`);
    }

    const existing = this.detachedWindows.get(key);
    if (existing && !existing.isDestroyed()) {
      this.showWindow(existing);
      this.navigateDetachedRouteInBackground(existing, key, options);
      return this.getState();
    }

    const prewarmed = this.takePrewarmedWindow(key);
    const win = prewarmed ?? this.createWorkspaceWindow(key, true);

    this.detachedWindows.set(key, win);
    this.configureDetachedWindow(key, win);
    this.showWindow(win);

    this.loadDetachedRouteInBackground(win, key, options);
    this.broadcastState();
    return this.getState();
  }

  prewarmDetachedWindows() {
    if (this.prewarmStarted) return;
    this.prewarmStarted = true;

    for (const key of Object.keys(WORKSPACE_WINDOW_DEFINITIONS) as WorkspaceWindowKey[]) {
      if (this.detachedWindows.has(key) || this.prewarmedWindows.has(key)) {
        continue;
      }

      const win = this.createWorkspaceWindow(key, false);
      this.prewarmedWindows.set(key, win);
      win.on('closed', () => {
        if (this.prewarmedWindows.get(key) === win) {
          this.prewarmedWindows.delete(key);
        }
      });
      this.loadDetachedRouteInBackground(win, key, { prewarm: true });
    }
  }

  async returnToMain(key: WorkspaceWindowKey): Promise<WorkspaceDetachedWindowState> {
    const definition = WORKSPACE_WINDOW_DEFINITIONS[key];
    if (!definition) {
      throw new Error(`未知独立窗口页面: ${key}`);
    }

    const detachedWindow = this.detachedWindows.get(key);
    if (detachedWindow && !detachedWindow.isDestroyed()) {
      this.detachedWindows.delete(key);
      detachedWindow.close();
    }

    this.mainWindow?.showWindow();
    await this.mainWindow?.navigateToHash(definition.route);
    this.broadcastState();
    return this.getState();
  }

  getState(): WorkspaceDetachedWindowState {
    const detached: WorkspaceDetachedWindowState['detached'] = {};
    for (const key of Object.keys(WORKSPACE_WINDOW_DEFINITIONS) as WorkspaceWindowKey[]) {
      const win = this.detachedWindows.get(key);
      detached[key] = Boolean(win && !win.isDestroyed());
    }
    return { detached };
  }

  getContext(senderWindow: BrowserWindow | null): WorkspaceWindowContext {
    if (!senderWindow || senderWindow.isDestroyed()) {
      return { role: 'main' };
    }

    for (const [key, win] of this.detachedWindows.entries()) {
      if (win.id === senderWindow.id) {
        return { role: 'detached', detachedKey: key };
      }
    }

    return { role: 'main' };
  }

  getPageState(key: WorkspaceWindowKey): WorkspaceWindowPageState | null {
    const state = this.pageStates.get(key);
    return state ? structuredClone(state) : null;
  }

  setPageState(key: WorkspaceWindowKey, state: WorkspaceWindowPageState) {
    this.pageStates.set(key, structuredClone(state));
  }

  isValidKey(value: unknown): value is WorkspaceWindowKey {
    return isWorkspaceWindowKey(value);
  }

  private async loadDetachedRoute(win: BrowserWindow, key: WorkspaceWindowKey, options?: { routeOverride?: string; prewarm?: boolean }) {
    const hashRoute = this.createDetachedHash(key, options);
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      await win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/workspace_window.html#${hashRoute}`);
      return;
    }

    await win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/workspace_window.html`),
      { hash: hashRoute.slice(1) },
    );
  }

  private loadDetachedRouteInBackground(win: BrowserWindow, key: WorkspaceWindowKey, options?: { routeOverride?: string; prewarm?: boolean }) {
    void this.loadDetachedRoute(win, key, options).catch((error) => {
      console.error(`[workspace-window] Failed to load detached ${key} window:`, error);
      if (!win.isDestroyed()) {
        win.close();
      }
    });
  }

  private navigateDetachedRouteInBackground(win: BrowserWindow, key: WorkspaceWindowKey, options?: { routeOverride?: string }) {
    const hashRoute = this.createDetachedHash(key, options);
    void win.webContents.executeJavaScript(
      `window.location.hash = ${JSON.stringify(hashRoute)};`,
      true,
    ).catch((error) => {
      console.error(`[workspace-window] Failed to navigate detached ${key} window:`, error);
      this.loadDetachedRouteInBackground(win, key, options);
    });
  }

  private createDetachedHash(key: WorkspaceWindowKey, options?: { routeOverride?: string; prewarm?: boolean }) {
    const definition = WORKSPACE_WINDOW_DEFINITIONS[key];
    const route = options?.prewarm ? '/__workspace-prewarm' : this.normalizeDetachedRouteOverride(definition.route, options?.routeOverride);
    const query = new URLSearchParams();
    query.set('detached', key);
    if (options?.prewarm) {
      query.set('prewarm', '1');
    }
    const [pathPart, queryPart = ''] = route.split('?');
    const mergedQuery = new URLSearchParams(queryPart);
    for (const [name, value] of query.entries()) {
      mergedQuery.set(name, value);
    }
    return `${pathPart}?${mergedQuery.toString()}`;
  }

  private normalizeDetachedRouteOverride(expectedRoute: string, routeOverride?: string) {
    if (!routeOverride) {
      return expectedRoute;
    }

    const trimmed = routeOverride.trim();
    const routePath = trimmed.split('?')[0];
    return routePath === expectedRoute ? trimmed : expectedRoute;
  }

  private createWorkspaceWindow(key: WorkspaceWindowKey, visible: boolean) {
    const definition = WORKSPACE_WINDOW_DEFINITIONS[key];
    const parent = this.mainWindow?.getWindow();
    const parentBounds = parent && !parent.isDestroyed() ? parent.getBounds() : undefined;
    const bounds = resolvePersistedWindowBounds({
      stateFileName: WORKSPACE_WINDOW_BOUNDS_STATE_FILE,
      key,
      width: definition.width,
      height: definition.height,
      minWidth: definition.minWidth,
      minHeight: definition.minHeight,
      parentBounds,
    });
    const win = new BrowserWindow({
      ...bounds,
      minWidth: definition.minWidth,
      minHeight: definition.minHeight,
      icon: resolveWindowIconPath(),
      frame: false,
      show: visible,
      backgroundColor: '#101216',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webviewTag: true,
      },
    });
    win.setTitle(`${definition.title} - GuYanTools`);
    return win;
  }

  private configureDetachedWindow(key: WorkspaceWindowKey, win: BrowserWindow) {
    const definition = WORKSPACE_WINDOW_DEFINITIONS[key];
    win.removeAllListeners('closed');
    persistWindowBounds(win, {
      stateFileName: WORKSPACE_WINDOW_BOUNDS_STATE_FILE,
      key,
      minWidth: definition.minWidth,
      minHeight: definition.minHeight,
    });
    win.on('closed', () => {
      if (this.detachedWindows.get(key) === win) {
        this.detachedWindows.delete(key);
        this.broadcastState();
        this.replenishPrewarmedWindow(key);
      }
    });
    win.webContents.on('page-title-updated', (event) => {
      event.preventDefault();
      if (!win.isDestroyed()) {
        win.setTitle(`${definition.title} - GuYanTools`);
      }
    });
  }

  private takePrewarmedWindow(key: WorkspaceWindowKey) {
    const win = this.prewarmedWindows.get(key);
    if (!win || win.isDestroyed()) {
      this.prewarmedWindows.delete(key);
      return null;
    }
    this.prewarmedWindows.delete(key);
    return win;
  }

  private replenishPrewarmedWindow(key: WorkspaceWindowKey) {
    if (!this.prewarmStarted || this.detachedWindows.has(key) || this.prewarmedWindows.has(key)) {
      return;
    }
    const win = this.createWorkspaceWindow(key, false);
    this.prewarmedWindows.set(key, win);
    win.on('closed', () => {
      if (this.prewarmedWindows.get(key) === win) {
        this.prewarmedWindows.delete(key);
      }
    });
    this.loadDetachedRouteInBackground(win, key, { prewarm: true });
  }

  private showWindow(win: BrowserWindow) {
    if (win.isMinimized()) {
      win.restore();
    }
    if (!win.isVisible()) {
      win.show();
    }
    win.focus();
  }

  private broadcastState() {
    const state = this.getState();
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('workspace-window:state-changed', state);
      }
    }
  }
}

export const workspaceWindowManager = new WorkspaceWindowManager();
