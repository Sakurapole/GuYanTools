import { waitForDevServer } from '@/main/windows/wait_for_dev_server';
import type { QuickNotePrefillPayload } from '@/contracts/knowledge';
import { app, BrowserWindow, clipboard, ipcMain, screen } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveWindowIconPath } from '../windows/window_icon';

const WINDOW_WIDTH = 396;
const WINDOW_HEIGHT = 476;
const MIN_NORMAL_WIDTH = 336;
const MIN_NORMAL_HEIGHT = 376;
const COLLAPSED_HEIGHT = 70;
const PREVIEW_HEIGHT = 236;
const WINDOW_CASCADE_OFFSET = 24;
const WINDOW_STATE_FILE = 'quick_note_window_bounds.json';

interface QuickNoteWindowState {
  id: number;
  window: BrowserWindow;
  pendingPrefill: QuickNotePrefillPayload | null;
  normalBounds: Electron.Rectangle;
  collapsed: boolean;
  previewing: boolean;
}

type PersistedQuickNoteWindowState = {
  windows?: Array<{ bounds?: Partial<Electron.Rectangle> }>;
  bounds?: Partial<Electron.Rectangle>;
} & Partial<Electron.Rectangle>;

const quickNoteWindows = new Map<number, QuickNoteWindowState>();
let persistedBoundsQueue: Electron.Rectangle[] | null = null;
let nextWindowId = 1;
let primaryWindowId: number | null = null;
let registered = false;

export async function showQuickNoteWindow(prefill?: QuickNotePrefillPayload) {
  const state = getPrimaryWindowState() ?? getMostRecentWindowState();
  if (!state) {
    await createQuickNoteWindow(prefill);
    return;
  }

  state.pendingPrefill = prefill ?? state.pendingPrefill;
  ensureQuickNoteWindowVisible(state.window);
  expandQuickNoteWindow(state);
  showAndFocusWindow(state);
  emitPrefillWhenReady(state);
}

export async function createQuickNoteWindow(prefill?: QuickNotePrefillPayload) {
  const id = nextWindowId++;
  const initialBounds = await resolveInitialQuickNoteWindowBounds();
  const win = new BrowserWindow({
    ...initialBounds,
    minWidth: MIN_NORMAL_WIDTH,
    minHeight: COLLAPSED_HEIGHT,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    title: '速记',
    icon: resolveWindowIconPath(),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const state: QuickNoteWindowState = {
    id,
    window: win,
    pendingPrefill: prefill ?? null,
    normalBounds: coerceBoundsToVisibleArea(initialBounds),
    collapsed: false,
    previewing: false,
  };
  quickNoteWindows.set(id, state);
  primaryWindowId ??= id;

  win.on('move', () => updateNormalBoundsFromWindow(state));
  win.on('resize', () => updateNormalBoundsFromWindow(state));
  win.on('hide', () => {
    void saveQuickNoteWindowState();
  });
  win.on('closed', () => {
    quickNoteWindows.delete(id);
    if (primaryWindowId === id) {
      primaryWindowId = getSortedWindowStates()[0]?.id ?? null;
    }
    void saveQuickNoteWindowState();
  });
  win.webContents.once('did-finish-load', () => {
    emitPrefillWhenReady(state);
    emitCollapsedState(state);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/quick_note.html`;
    await waitForDevServer(url);
    await win.loadURL(url);
  } else {
    await win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/quick_note.html`),
    );
  }

  showAndFocusWindow(state);
}

export function toggleQuickNoteWindow() {
  const states = getSortedWindowStates();
  if (!states.length) {
    void showQuickNoteWindow();
    return;
  }

  const hasVisibleWindow = states.some((state) => state.window.isVisible());
  if (hasVisibleWindow) {
    for (const state of states) {
      state.window.hide();
    }
    return;
  }

  for (const state of states) {
    ensureQuickNoteWindowVisible(state.window);
    state.window.show();
  }
  showAndFocusWindow(getPrimaryWindowState() ?? states[0]);
}

export function captureClipboardToQuickNoteWindow() {
  const text = clipboard.readText().trim();
  void showQuickNoteWindow({
    body: text,
    tags: ['剪贴板'],
    color: 'blue',
  });
}

export function registerQuickNoteWindowHandlers() {
  if (registered) return;

  ipcMain.handle('quick-note:show-window', async (_event, prefill?: QuickNotePrefillPayload) => {
    await showQuickNoteWindow(prefill);
  });

  ipcMain.handle('quick-note:create-window', async (_event, prefill?: QuickNotePrefillPayload) => {
    await createQuickNoteWindow(prefill);
  });

  ipcMain.handle('quick-note:close-window', async (event) => {
    const state = getQuickNoteStateFromSender(event.sender);
    if (state && !state.window.isDestroyed()) {
      state.window.close();
    }
  });

  ipcMain.handle('quick-note:dock-window', async (event) => {
    const state = getQuickNoteStateFromSender(event.sender);
    if (state) collapseQuickNoteWindow(state);
  });

  ipcMain.handle('quick-note:collapse-window', async (event) => {
    const state = getQuickNoteStateFromSender(event.sender);
    if (state) collapseQuickNoteWindow(state);
  });

  ipcMain.handle('quick-note:expand-window', async (event) => {
    const state = getQuickNoteStateFromSender(event.sender);
    if (state) expandQuickNoteWindow(state);
  });

  ipcMain.handle('quick-note:preview-window', async (event, expanded: boolean) => {
    const state = getQuickNoteStateFromSender(event.sender);
    if (state) previewQuickNoteWindow(state, expanded);
  });

  ipcMain.handle('quick-note:set-always-on-top', async (event, alwaysOnTop: boolean) => {
    const state = getQuickNoteStateFromSender(event.sender);
    if (state) {
      state.window.setAlwaysOnTop(alwaysOnTop);
    }
  });

  ipcMain.handle('quick-note:get-window-meta', async (event) => {
    const state = getQuickNoteStateFromSender(event.sender);
    return {
      isPrimary: Boolean(state && state.id === primaryWindowId),
    };
  });

  registered = true;
}

async function resolveInitialQuickNoteWindowBounds(): Promise<Electron.Rectangle> {
  if (!persistedBoundsQueue) {
    persistedBoundsQueue = await loadQuickNoteWindowBounds();
  }

  const savedBounds = persistedBoundsQueue.shift();
  if (savedBounds) {
    return coerceBoundsToVisibleArea(savedBounds);
  }

  return getCascadedQuickNoteBounds();
}

function getCenteredQuickNoteBounds(): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { workArea } = display;
  return {
    x: Math.round(workArea.x + (workArea.width - WINDOW_WIDTH) / 2),
    y: Math.round(workArea.y + (workArea.height - WINDOW_HEIGHT) / 2),
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  };
}

function getCascadedQuickNoteBounds(): Electron.Rectangle {
  const base = getPrimaryWindowState()?.normalBounds ?? getCenteredQuickNoteBounds();
  const offset = quickNoteWindows.size * WINDOW_CASCADE_OFFSET;
  return coerceBoundsToVisibleArea({
    ...base,
    x: base.x + offset,
    y: base.y + offset,
  });
}

function ensureQuickNoteWindowVisible(win: BrowserWindow) {
  const bounds = win.getBounds();
  const visibleBounds = coerceBoundsToVisibleArea(bounds);
  if (
    visibleBounds.x !== bounds.x ||
    visibleBounds.y !== bounds.y ||
    visibleBounds.width !== bounds.width ||
    visibleBounds.height !== bounds.height
  ) {
    win.setBounds(visibleBounds, false);
  }
}

function coerceBoundsToVisibleArea(bounds: Electron.Rectangle): Electron.Rectangle {
  const display = screen.getDisplayMatching(bounds);
  const { workArea } = display;
  const width = Math.min(Math.max(bounds.width, MIN_NORMAL_WIDTH), workArea.width);
  const height = Math.min(Math.max(bounds.height, MIN_NORMAL_HEIGHT), workArea.height);

  return {
    x: Math.round(Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width))),
    y: Math.round(Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height))),
    width: Math.round(width),
    height: Math.round(height),
  };
}

async function loadQuickNoteWindowBounds(): Promise<Electron.Rectangle[]> {
  try {
    const raw = await fs.readFile(getQuickNoteWindowStatePath(), 'utf8');
    const value = JSON.parse(raw) as PersistedQuickNoteWindowState;
    const candidates = Array.isArray(value.windows)
      ? value.windows.map((item) => item.bounds)
      : [isValidBounds(value.bounds) ? value.bounds : value];

    return candidates
      .filter((bounds): bounds is Electron.Rectangle => isValidBounds(bounds))
      .map((bounds) => ({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[quick-note] Failed to load window bounds:', error);
    }
    return [];
  }
}

async function saveQuickNoteWindowState() {
  const windows = getSortedWindowStates().map((state) => ({
    bounds: getPersistentQuickNoteBounds(state),
  }));
  if (!windows.length) {
    persistedBoundsQueue = [];
  }

  try {
    const statePath = getQuickNoteWindowStatePath();
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify({ windows }, null, 2), 'utf8');
  } catch (error) {
    console.warn('[quick-note] Failed to save window bounds:', error);
  }
}

function getPersistentQuickNoteBounds(state: QuickNoteWindowState): Electron.Rectangle {
  if (!state.window.isDestroyed() && !state.collapsed && !state.previewing) {
    state.normalBounds = coerceBoundsToVisibleArea(state.window.getBounds());
  }
  return state.normalBounds;
}

function updateNormalBoundsFromWindow(state: QuickNoteWindowState) {
  if (state.window.isDestroyed() || state.collapsed || state.previewing) {
    return;
  }
  state.normalBounds = coerceBoundsToVisibleArea(state.window.getBounds());
}

function collapseQuickNoteWindow(state: QuickNoteWindowState) {
  if (state.window.isDestroyed()) {
    return;
  }

  if (!state.collapsed) {
    state.normalBounds = coerceBoundsToVisibleArea(state.window.getBounds());
  }

  state.collapsed = true;
  state.previewing = false;
  state.window.setMinimumSize(MIN_NORMAL_WIDTH, COLLAPSED_HEIGHT);
  state.window.setBounds({
    x: state.normalBounds.x,
    y: state.normalBounds.y,
    width: state.normalBounds.width,
    height: COLLAPSED_HEIGHT,
  }, false);
  emitCollapsedState(state);
}

function expandQuickNoteWindow(state: QuickNoteWindowState) {
  if (state.window.isDestroyed()) {
    return;
  }

  state.normalBounds = coerceBoundsToVisibleArea(state.normalBounds ?? state.window.getBounds());
  state.collapsed = false;
  state.previewing = false;
  state.window.setMinimumSize(MIN_NORMAL_WIDTH, MIN_NORMAL_HEIGHT);
  state.window.setBounds(state.normalBounds, false);
  emitCollapsedState(state);
}

function previewQuickNoteWindow(state: QuickNoteWindowState, expanded: boolean) {
  if (state.window.isDestroyed() || !state.collapsed) {
    return;
  }

  const height = expanded ? Math.min(PREVIEW_HEIGHT, state.normalBounds.height) : COLLAPSED_HEIGHT;
  state.previewing = expanded;
  state.window.setBounds({
    x: state.normalBounds.x,
    y: state.normalBounds.y,
    width: state.normalBounds.width,
    height,
  }, false);
  emitCollapsedState(state);
}

function emitCollapsedState(state: QuickNoteWindowState) {
  if (state.window.isDestroyed()) {
    return;
  }

  state.window.webContents.send('quick-note:collapsed-state', state.collapsed, state.previewing);
}

function getQuickNoteWindowStatePath() {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function isValidBounds(value?: Partial<Electron.Rectangle>): value is Electron.Rectangle {
  return Boolean(value) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    Number(value.width) > 0 &&
    Number(value.height) > 0;
}

function getQuickNoteStateFromSender(sender: Electron.WebContents) {
  const win = BrowserWindow.fromWebContents(sender);
  return getSortedWindowStates().find((state) => state.window === win) ?? null;
}

function getPrimaryWindowState() {
  return primaryWindowId ? quickNoteWindows.get(primaryWindowId) ?? null : null;
}

function getMostRecentWindowState() {
  const states = getSortedWindowStates();
  return states[states.length - 1] ?? null;
}

function getSortedWindowStates() {
  return Array.from(quickNoteWindows.values())
    .filter((state) => !state.window.isDestroyed())
    .sort((first, second) => first.id - second.id);
}

function showAndFocusWindow(state: QuickNoteWindowState) {
  state.window.show();
  if (state.window.isMinimized()) {
    state.window.restore();
  }
  state.window.focus();
}

function emitPrefillWhenReady(state: QuickNoteWindowState) {
  if (!state.pendingPrefill || state.window.isDestroyed()) {
    return;
  }

  state.window.webContents.send('quick-note:prefill', state.pendingPrefill);
  state.pendingPrefill = null;
}
