import { ref, type Ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import type { BackgroundConfirmPayload, BackgroundStyleConfig, BackgroundTheme } from '@/contracts/background';
import { resolveThemeBackground, withThemeBackground } from '@/contracts/background';
import type { TodoApi, TodoBackgroundState, TodoBackgroundTarget } from '@/contracts/todo';

export interface AreaBackground {
  type: 'color' | 'image' | 'video';
  color: string;
  image: string;
  video: string;
  backgroundStyle: BackgroundStyleConfig;
}

const TODO_BACKGROUND_TARGETS: TodoBackgroundTarget[] = [
  'app',
  'sidebar',
  'content',
  'detail',
  'item',
  'sidebar-item',
];

const legacyStorageKeys: Record<TodoBackgroundTarget, string> = {
  app: 'todo_bg_app',
  sidebar: 'todo_bg_sidebar',
  content: 'todo_bg_content',
  detail: 'todo_bg_detail',
  item: 'todo_bg_item',
  'sidebar-item': 'todo_bg_sidebar_item',
};

export function resolveTodoAreaBackground(background: AreaBackground, theme: BackgroundTheme): AreaBackground {
  return resolveThemeBackground(background, theme) as AreaBackground;
}

export function updateTodoAreaBackground(
  background: AreaBackground,
  theme: BackgroundTheme,
  payload: BackgroundConfirmPayload,
): AreaBackground {
  return withThemeBackground(background, theme, {
    type: payload.type,
    color: payload.color ?? '',
    image: payload.image ?? '',
    video: payload.video ?? '',
    backgroundStyle: payload.backgroundStyle ?? { opacity: 1 },
  }) as AreaBackground;
}

export const defaultTodoAppColor = 'var(--todo-app-bg, var(--background-color))';
export const defaultTodoPanelColor = 'var(--todo-panel-bg, var(--ui-surface-glass))';
export const defaultTodoItemColor = 'var(--ui-surface-glass)';
export const defaultTodoSidebarItemColor = 'transparent';
const legacyDefaultAppColor = 'var(--color-bg-primary, #f5f7fa)';
const legacyDefaultPanelColor = 'rgba(255, 255, 255, 0.65)';

export function cloneTodoAreaBackground(background: AreaBackground): AreaBackground {
  return {
    ...background,
    backgroundStyle: { ...background.backgroundStyle },
  };
}

export const defaultTodoGlassBackground: AreaBackground = {
  type: 'color',
  color: defaultTodoPanelColor,
  image: '',
  video: '',
  backgroundStyle: { opacity: 1 },
};

export const defaultTodoAppBackground: AreaBackground = {
  type: 'color',
  color: defaultTodoAppColor,
  image: '',
  video: '',
  backgroundStyle: { opacity: 1 },
};

export const defaultTodoItemBackground: AreaBackground = {
  type: 'color',
  color: defaultTodoItemColor,
  image: '',
  video: '',
  backgroundStyle: { opacity: 1, blur: 10 },
};

export const defaultTodoSidebarItemBackground: AreaBackground = {
  type: 'color',
  color: defaultTodoSidebarItemColor,
  image: '',
  video: '',
  backgroundStyle: { opacity: 1, blur: 0 },
};

const defaultBackgrounds: Record<TodoBackgroundTarget, AreaBackground> = {
  app: defaultTodoAppBackground,
  sidebar: defaultTodoGlassBackground,
  content: defaultTodoGlassBackground,
  detail: defaultTodoGlassBackground,
  item: defaultTodoItemBackground,
  'sidebar-item': defaultTodoSidebarItemBackground,
};

const appBg = ref(cloneTodoAreaBackground(defaultTodoAppBackground));
const sidebarBg = ref(cloneTodoAreaBackground(defaultTodoGlassBackground));
const contentBg = ref(cloneTodoAreaBackground(defaultTodoGlassBackground));
const detailBg = ref(cloneTodoAreaBackground(defaultTodoGlassBackground));
const itemBg = ref(cloneTodoAreaBackground(defaultTodoItemBackground));
const sidebarItemBg = ref(cloneTodoAreaBackground(defaultTodoSidebarItemBackground));

const backgroundRefs: Record<TodoBackgroundTarget, Ref<AreaBackground>> = {
  app: appBg,
  sidebar: sidebarBg,
  content: contentBg,
  detail: detailBg,
  item: itemBg,
  'sidebar-item': sidebarItemBg,
};

let backgroundsLoaded = false;
let backgroundLoadPromise: Promise<void> | null = null;

function getTodoApi(): TodoApi | null {
  const candidate = (globalThis as { todoApi?: TodoApi }).todoApi;
  if (!candidate || typeof candidate.getBackgrounds !== 'function' || typeof candidate.updateBackgrounds !== 'function') {
    return null;
  }
  return candidate;
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBackgroundType(value: unknown, input: Record<string, unknown>): AreaBackground['type'] {
  if (value === 'color' || value === 'image' || value === 'video') return value;
  if (typeof input.video === 'string' && input.video) return 'video';
  if (typeof input.image === 'string' && input.image) return 'image';
  return 'color';
}

function normalizeAreaBackground(input: unknown, fallback: AreaBackground): AreaBackground {
  if (!isRecord(input)) return cloneTodoAreaBackground(fallback);

  const style = isRecord(input.backgroundStyle)
    ? input.backgroundStyle as BackgroundStyleConfig
    : {};

  return {
    type: normalizeBackgroundType(input.type, input),
    color: typeof input.color === 'string' ? input.color : fallback.color,
    image: typeof input.image === 'string' ? input.image : '',
    video: typeof input.video === 'string' ? input.video : '',
    backgroundStyle: {
      ...fallback.backgroundStyle,
      ...style,
    },
  };
}

function migrateLegacyDefaultBackground(
  background: AreaBackground,
  legacyColor: string,
  nextColor: string,
): AreaBackground {
  const isLegacyDefault =
    background.type === 'color' &&
    background.color === legacyColor &&
    !background.image &&
    !background.video &&
    (background.backgroundStyle?.opacity ?? 1) === 1 &&
    !background.backgroundStyle?.textColor;

  return isLegacyDefault ? { ...background, color: nextColor } : background;
}

function normalizeLegacyBackground(target: TodoBackgroundTarget, input: unknown): AreaBackground {
  const normalized = normalizeAreaBackground(input, defaultBackgrounds[target]);
  if (target === 'app') {
    return migrateLegacyDefaultBackground(normalized, legacyDefaultAppColor, defaultTodoAppColor);
  }
  if (target === 'sidebar' || target === 'content' || target === 'detail') {
    return migrateLegacyDefaultBackground(normalized, legacyDefaultPanelColor, defaultTodoPanelColor);
  }
  return normalized;
}

function applyTodoBackgroundState(state: TodoBackgroundState) {
  for (const target of TODO_BACKGROUND_TARGETS) {
    backgroundRefs[target].value = normalizeAreaBackground(state[target], defaultBackgrounds[target]);
  }
}

function readLegacyBackgroundState(current: TodoBackgroundState): {
  migrated: TodoBackgroundState;
  keysToRemove: string[];
} {
  const storage = getStorage();
  const migrated: TodoBackgroundState = {};
  const keysToRemove: string[] = [];
  if (!storage) return { migrated, keysToRemove };

  for (const target of TODO_BACKGROUND_TARGETS) {
    const key = legacyStorageKeys[target];
    const raw = storage.getItem(key);
    if (raw === null) continue;

    keysToRemove.push(key);
    if (current[target]) continue;

    try {
      migrated[target] = normalizeLegacyBackground(target, JSON.parse(raw));
    } catch {
      // 旧数据损坏时只清理，不迁移。
    }
  }

  return { migrated, keysToRemove };
}

function removeLegacyBackgroundKeys(keys: string[]) {
  const storage = getStorage();
  if (!storage) return;

  for (const key of keys) {
    storage.removeItem(key);
  }
}

function persistLocalFallback(target: TodoBackgroundTarget, background: AreaBackground) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(legacyStorageKeys[target], JSON.stringify(background));
}

export async function loadTodoBackgrounds(): Promise<void> {
  if (backgroundsLoaded) return;
  if (backgroundLoadPromise) return backgroundLoadPromise;

  backgroundLoadPromise = (async () => {
    const api = getTodoApi();
    if (!api) {
      const { migrated } = readLegacyBackgroundState({});
      applyTodoBackgroundState(migrated);
      backgroundsLoaded = true;
      return;
    }

    try {
      const savedState = await api.getBackgrounds() ?? {};
      const { migrated, keysToRemove } = readLegacyBackgroundState(savedState);
      const hasMigratedState = Object.keys(migrated).length > 0;
      const nextState = hasMigratedState ? await api.updateBackgrounds(migrated) : savedState;

      applyTodoBackgroundState(nextState ?? {});
      removeLegacyBackgroundKeys(keysToRemove);
      backgroundsLoaded = true;
    } catch (error) {
      console.warn('加载 Todo 背景配置失败', error);
      const { migrated } = readLegacyBackgroundState({});
      applyTodoBackgroundState(migrated);
      backgroundsLoaded = true;
    }
  })().finally(() => {
    backgroundLoadPromise = null;
  });

  return backgroundLoadPromise;
}

export async function saveTodoAreaBackground(
  target: TodoBackgroundTarget,
  background: AreaBackground,
): Promise<AreaBackground> {
  const normalized = normalizeAreaBackground(background, defaultBackgrounds[target]);
  backgroundRefs[target].value = normalized;

  const api = getTodoApi();
  if (!api) {
    persistLocalFallback(target, normalized);
    return normalized;
  }

  const nextState = await api.updateBackgrounds({ [target]: normalized });
  applyTodoBackgroundState(nextState ?? { [target]: normalized });
  return backgroundRefs[target].value;
}

export function getDefaultTodoAreaBackground(target: TodoBackgroundTarget): AreaBackground {
  return cloneTodoAreaBackground(defaultBackgrounds[target]);
}

export async function resetTodoAreaBackground(target: TodoBackgroundTarget): Promise<AreaBackground> {
  return saveTodoAreaBackground(target, getDefaultTodoAreaBackground(target));
}

export function useTodoSettings() {
  const isSidebarCollapsed = useLocalStorage('todo_sidebar_collapsed', false);

  return {
    isSidebarCollapsed,
    appBg,
    sidebarBg,
    contentBg,
    detailBg,
    itemBg,
    sidebarItemBg,
    loadTodoBackgrounds,
    saveTodoAreaBackground,
    resetTodoAreaBackground,
  };
}
