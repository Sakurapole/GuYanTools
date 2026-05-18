import type { TerminalLayoutMode } from '@/contracts/terminal';

export type ConnectionLayoutSurface = 'terminal' | 'ftp';

export type TerminalConnectionLayoutTarget =
  | {
    surface: 'terminal';
    kind: 'local';
    profileId?: string;
    cwd?: string;
    label?: string;
  }
  | {
    surface: 'terminal';
    kind: 'ssh';
    profileId: string;
    cwd?: string;
    label?: string;
  };

export type FtpConnectionLayoutTarget =
  | {
    surface: 'ftp';
    kind: 'local';
    path: string;
    label?: string;
  }
  | {
    surface: 'ftp';
    kind: 'remote';
    profileId: string;
    remotePath?: string;
    localPath?: string;
    label?: string;
  };

export type ConnectionLayoutTarget = TerminalConnectionLayoutTarget | FtpConnectionLayoutTarget;

export interface ConnectionLayoutViewState {
  layoutMode: TerminalLayoutMode;
  order: string[];
  layoutSizeState?: Record<string, number[]>;
  masterMainRatio?: number;
  dwindleSplitRatios?: number[];
  sidebarDockSide?: 'left' | 'right';
  auxiliaryDockSide?: 'bottom' | 'right';
  auxiliaryDockSize?: string;
  auxiliaryDockCollapsed?: boolean;
  showSidebar?: boolean;
}

export interface ConnectionLayoutConfig {
  id: string;
  name: string;
  surface: ConnectionLayoutSurface;
  targets: ConnectionLayoutTarget[];
  viewState: ConnectionLayoutViewState;
  createdAt: number;
  updatedAt: number;
}

export type SaveConnectionLayoutInput = Omit<ConnectionLayoutConfig, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export const CONNECTION_LAYOUT_STORAGE_KEY = 'guyantools.connection-layouts';
export const CONNECTION_LAYOUTS_CHANGED_EVENT = 'guyantools:connection-layouts-changed';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLayoutMode(value: unknown): TerminalLayoutMode {
  if (
    value === 'tabbed'
    || value === 'split-horizontal'
    || value === 'split-vertical'
    || value === 'master-stack'
    || value === 'dwindle'
    || value === 'grid'
  ) {
    return value;
  }
  return 'tabbed';
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function normalizeLayoutSizeState(value: unknown) {
  if (!isRecord(value)) return undefined;
  const next: Record<string, number[]> = {};
  for (const [key, sizes] of Object.entries(value)) {
    const normalized = normalizeNumberArray(sizes);
    if (normalized.length) {
      next[key] = normalized;
    }
  }
  return Object.keys(next).length ? next : undefined;
}

function normalizeTarget(value: unknown): ConnectionLayoutTarget | null {
  if (!isRecord(value)) return null;
  if (value.surface === 'terminal') {
    if (value.kind === 'local') {
      return {
        surface: 'terminal',
        kind: 'local',
        profileId: typeof value.profileId === 'string' ? value.profileId : undefined,
        cwd: typeof value.cwd === 'string' ? value.cwd : undefined,
        label: typeof value.label === 'string' ? value.label : undefined,
      };
    }
    if (value.kind === 'ssh' && typeof value.profileId === 'string' && value.profileId) {
      return {
        surface: 'terminal',
        kind: 'ssh',
        profileId: value.profileId,
        cwd: typeof value.cwd === 'string' ? value.cwd : undefined,
        label: typeof value.label === 'string' ? value.label : undefined,
      };
    }
  }

  if (value.surface === 'ftp') {
    if (value.kind === 'local' && typeof value.path === 'string' && value.path) {
      return {
        surface: 'ftp',
        kind: 'local',
        path: value.path,
        label: typeof value.label === 'string' ? value.label : undefined,
      };
    }
    if (value.kind === 'remote' && typeof value.profileId === 'string' && value.profileId) {
      return {
        surface: 'ftp',
        kind: 'remote',
        profileId: value.profileId,
        remotePath: typeof value.remotePath === 'string' ? value.remotePath : undefined,
        localPath: typeof value.localPath === 'string' ? value.localPath : undefined,
        label: typeof value.label === 'string' ? value.label : undefined,
      };
    }
  }

  return null;
}

function normalizeConfig(value: unknown): ConnectionLayoutConfig | null {
  if (!isRecord(value)) return null;
  const surface = value.surface === 'ftp' ? 'ftp' : value.surface === 'terminal' ? 'terminal' : null;
  if (!surface || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string') {
    return null;
  }

  const viewState = isRecord(value.viewState) ? value.viewState : {};
  const targets = Array.isArray(value.targets)
    ? value.targets.map(normalizeTarget).filter((item): item is ConnectionLayoutTarget => Boolean(item))
    : [];

  return {
    id: value.id,
    name: value.name.trim() || '未命名配置',
    surface,
    targets: targets.filter((target) => target.surface === surface),
    viewState: {
      layoutMode: normalizeLayoutMode(viewState.layoutMode),
      order: Array.isArray(viewState.order) ? viewState.order.map(String).filter(Boolean) : [],
      layoutSizeState: normalizeLayoutSizeState(viewState.layoutSizeState),
      masterMainRatio: typeof viewState.masterMainRatio === 'number' ? viewState.masterMainRatio : undefined,
      dwindleSplitRatios: normalizeNumberArray(viewState.dwindleSplitRatios),
      sidebarDockSide: viewState.sidebarDockSide === 'right' ? 'right' : viewState.sidebarDockSide === 'left' ? 'left' : undefined,
      auxiliaryDockSide: viewState.auxiliaryDockSide === 'right' ? 'right' : viewState.auxiliaryDockSide === 'bottom' ? 'bottom' : undefined,
      auxiliaryDockSize: typeof viewState.auxiliaryDockSize === 'string' ? viewState.auxiliaryDockSize : undefined,
      auxiliaryDockCollapsed: typeof viewState.auxiliaryDockCollapsed === 'boolean' ? viewState.auxiliaryDockCollapsed : undefined,
      showSidebar: typeof viewState.showSidebar === 'boolean' ? viewState.showSidebar : undefined,
    },
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
  };
}

export function listConnectionLayoutConfigs(surface?: ConnectionLayoutSurface) {
  try {
    const raw = window.localStorage.getItem(CONNECTION_LAYOUT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeConfig)
      .filter((item): item is ConnectionLayoutConfig => Boolean(item))
      .filter((item) => !surface || item.surface === surface)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export function getConnectionLayoutConfig(id: string) {
  return listConnectionLayoutConfigs().find((item) => item.id === id) ?? null;
}

export function saveConnectionLayoutConfig(input: SaveConnectionLayoutInput) {
  const now = Date.now();
  const configs = listConnectionLayoutConfigs();
  const existing = input.id ? configs.find((item) => item.id === input.id) ?? null : null;
  const next: ConnectionLayoutConfig = {
    ...input,
    id: input.id || crypto.randomUUID(),
    name: input.name.trim() || '未命名配置',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const merged = [
    next,
    ...configs.filter((item) => item.id !== next.id),
  ];
  window.localStorage.setItem(CONNECTION_LAYOUT_STORAGE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent(CONNECTION_LAYOUTS_CHANGED_EVENT));
  return next;
}

export function deleteConnectionLayoutConfig(id: string) {
  const configs = listConnectionLayoutConfigs();
  const next = configs.filter((item) => item.id !== id);
  window.localStorage.setItem(CONNECTION_LAYOUT_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CONNECTION_LAYOUTS_CHANGED_EVENT));
}

export function describeConnectionLayoutConfig(config: ConnectionLayoutConfig) {
  const surface = config.surface === 'terminal' ? '终端' : '传输';
  return `${surface} · ${config.targets.length} 个连接 · ${layoutModeLabel(config.viewState.layoutMode)}`;
}

export function layoutModeLabel(mode: TerminalLayoutMode) {
  if (mode === 'tabbed') return '标签布局';
  if (mode === 'split-horizontal') return '水平分屏';
  if (mode === 'split-vertical') return '垂直分屏';
  if (mode === 'master-stack') return '主从布局';
  if (mode === 'dwindle') return '递减布局';
  return '网格布局';
}
