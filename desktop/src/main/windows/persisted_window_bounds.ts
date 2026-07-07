import { app, screen } from 'electron';
import type { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

type PersistedWindowBoundsState = {
  bounds?: Record<string, Partial<Electron.Rectangle>>;
};

type ResolveWindowBoundsOptions = {
  stateFileName: string;
  key: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  parentBounds?: Electron.Rectangle;
};

type PersistWindowBoundsOptions = {
  stateFileName: string;
  key: string;
  minWidth: number;
  minHeight: number;
};

const stateCache = new Map<string, Record<string, Electron.Rectangle>>();

export function resolvePersistedWindowBounds(options: ResolveWindowBoundsOptions): Electron.Rectangle {
  const state = readWindowBoundsState(options.stateFileName);
  const persistedBounds = state[options.key];
  if (persistedBounds) {
    return coerceBoundsToVisibleArea(persistedBounds, options.minWidth, options.minHeight);
  }

  const display = options.parentBounds
    ? screen.getDisplayMatching(options.parentBounds)
    : screen.getPrimaryDisplay();
  const { workArea } = display;
  const width = clampDimension(options.width, options.minWidth, workArea.width);
  const height = clampDimension(options.height, options.minHeight, workArea.height);
  const centerSource = options.parentBounds ?? workArea;

  return coerceBoundsToVisibleArea({
    x: Math.round(centerSource.x + (centerSource.width - width) / 2),
    y: Math.round(centerSource.y + (centerSource.height - height) / 2),
    width,
    height,
  }, options.minWidth, options.minHeight);
}

export function persistWindowBounds(win: BrowserWindow, options: PersistWindowBoundsOptions) {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const saveNow = () => {
    if (win.isDestroyed() || win.isMinimized()) {
      return;
    }

    const rawBounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    const bounds = coerceBoundsToVisibleArea(rawBounds, options.minWidth, options.minHeight);
    const state = readWindowBoundsState(options.stateFileName);
    state[options.key] = bounds;
    writeWindowBoundsState(options.stateFileName, state);
  };

  const scheduleSave = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveNow();
    }, 250);
  };

  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveNow();
  });
}

function readWindowBoundsState(stateFileName: string) {
  const statePath = getWindowBoundsStatePath(stateFileName);
  const cached = stateCache.get(statePath);
  if (cached) {
    return cached;
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw) as PersistedWindowBoundsState;
    const bounds = Object.fromEntries(
      Object.entries(parsed.bounds ?? {})
        .map(([key, value]) => [key, normalizeBounds(value)])
        .filter((entry): entry is [string, Electron.Rectangle] => Boolean(entry[1])),
    );
    stateCache.set(statePath, bounds);
    return bounds;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[window-bounds] Failed to read ${stateFileName}:`, error);
    }
    const emptyState: Record<string, Electron.Rectangle> = {};
    stateCache.set(statePath, emptyState);
    return emptyState;
  }
}

function writeWindowBoundsState(stateFileName: string, state: Record<string, Electron.Rectangle>) {
  const statePath = getWindowBoundsStatePath(stateFileName);
  stateCache.set(statePath, state);

  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ bounds: state }, null, 2), 'utf8');
  } catch (error) {
    console.warn(`[window-bounds] Failed to write ${stateFileName}:`, error);
  }
}

function getWindowBoundsStatePath(stateFileName: string) {
  return path.join(app.getPath('userData'), 'window-state', stateFileName);
}

function normalizeBounds(value: unknown): Electron.Rectangle | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<Electron.Rectangle>;
  if (![candidate.x, candidate.y, candidate.width, candidate.height].every(Number.isFinite)) {
    return null;
  }

  if (Number(candidate.width) <= 0 || Number(candidate.height) <= 0) {
    return null;
  }

  return {
    x: Math.round(Number(candidate.x)),
    y: Math.round(Number(candidate.y)),
    width: Math.round(Number(candidate.width)),
    height: Math.round(Number(candidate.height)),
  };
}

function coerceBoundsToVisibleArea(
  bounds: Electron.Rectangle,
  minWidth: number,
  minHeight: number,
): Electron.Rectangle {
  const display = screen.getDisplayMatching(bounds);
  const { workArea } = display;
  const width = clampDimension(bounds.width, minWidth, workArea.width);
  const height = clampDimension(bounds.height, minHeight, workArea.height);

  return {
    x: Math.round(Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width))),
    y: Math.round(Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height))),
    width,
    height,
  };
}

function clampDimension(value: number, min: number, max: number) {
  return Math.round(Math.max(min, Math.min(max, value)));
}
