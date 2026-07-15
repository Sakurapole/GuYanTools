export type WorkspaceWindowKey = 'terminal' | 'ftp' | 'todo' | 'ai' | 'knowledge' | 'webview';

export interface WorkspaceWindowDefinition {
  key: WorkspaceWindowKey;
  route: string;
  title: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

export const WORKSPACE_WINDOW_DEFINITIONS: Record<WorkspaceWindowKey, WorkspaceWindowDefinition> = {
  terminal: {
    key: 'terminal',
    route: '/terminal',
    title: '终端',
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 560,
  },
  ftp: {
    key: 'ftp',
    route: '/ftp',
    title: '传输',
    width: 1220,
    height: 780,
    minWidth: 900,
    minHeight: 580,
  },
  todo: {
    key: 'todo',
    route: '/todo',
    title: '待办',
    width: 1120,
    height: 760,
    minWidth: 820,
    minHeight: 560,
  },
  ai: {
    key: 'ai',
    route: '/ai',
    title: 'AI',
    width: 1220,
    height: 780,
    minWidth: 900,
    minHeight: 580,
  },
  knowledge: {
    key: 'knowledge',
    route: '/knowledge',
    title: '知识库',
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
  },
  webview: {
    key: 'webview',
    route: '/webview',
    title: '网页',
    width: 1220,
    height: 780,
    minWidth: 860,
    minHeight: 560,
  },
};

export interface WorkspaceDetachedWindowState {
  detached: Partial<Record<WorkspaceWindowKey, boolean>>;
}

export interface WorkspaceDetachedOpenOptions {
  routeOverride?: string;
}

export interface WorkspaceWindowContext {
  role: 'main' | 'detached';
  detachedKey?: WorkspaceWindowKey;
}

export type WorkspaceWindowPageState = Record<string, unknown>;

export interface WorkspaceWindowApi {
  openDetached: (key: WorkspaceWindowKey, options?: WorkspaceDetachedOpenOptions) => Promise<WorkspaceDetachedWindowState>;
  returnToMain: (key: WorkspaceWindowKey) => Promise<WorkspaceDetachedWindowState>;
  getState: () => Promise<WorkspaceDetachedWindowState>;
  getContext: () => Promise<WorkspaceWindowContext>;
  getPageState: (key: WorkspaceWindowKey) => Promise<WorkspaceWindowPageState | null>;
  setPageState: (key: WorkspaceWindowKey, state: WorkspaceWindowPageState) => Promise<void>;
  onStateChanged: (listener: (state: WorkspaceDetachedWindowState) => void) => () => void;
}

export function isWorkspaceWindowKey(value: unknown): value is WorkspaceWindowKey {
  return typeof value === 'string' && value in WORKSPACE_WINDOW_DEFINITIONS;
}
