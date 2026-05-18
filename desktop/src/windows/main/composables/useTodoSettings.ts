import { useLocalStorage } from '@vueuse/core';
import type { BackgroundConfirmPayload, BackgroundStyleConfig, BackgroundTheme } from '@/contracts/background';
import { resolveThemeBackground, withThemeBackground } from '@/contracts/background';

export interface AreaBackground {
  type: 'color' | 'image' | 'video';
  color: string;
  image: string;
  video: string;
  backgroundStyle: BackgroundStyleConfig;
}

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
const legacyDefaultAppColor = 'var(--color-bg-primary, #f5f7fa)';
const legacyDefaultPanelColor = 'rgba(255, 255, 255, 0.65)';

const defaultGlassBackground: AreaBackground = {
  type: 'color',
  color: defaultTodoPanelColor,
  image: '',
  video: '',
  backgroundStyle: { opacity: 1 },
};

const defaultAppBackground: AreaBackground = {
  type: 'color',
  color: defaultTodoAppColor,
  image: '',
  video: '',
  backgroundStyle: { opacity: 1 },
};

function migrateLegacyDefaultBackground(
  storage: { value: AreaBackground },
  legacyColor: string,
  nextColor: string,
) {
  const bg = storage.value;
  const isLegacyDefault =
    bg.type === 'color' &&
    bg.color === legacyColor &&
    !bg.image &&
    !bg.video &&
    (bg.backgroundStyle?.opacity ?? 1) === 1 &&
    !bg.backgroundStyle?.textColor;

  if (isLegacyDefault) {
    storage.value = { ...bg, color: nextColor };
  }
}

export function useTodoSettings() {
  const isSidebarCollapsed = useLocalStorage('todo_sidebar_collapsed', false);

  const appBg = useLocalStorage<AreaBackground>('todo_bg_app', defaultAppBackground);
  const sidebarBg = useLocalStorage<AreaBackground>('todo_bg_sidebar', defaultGlassBackground);
  const contentBg = useLocalStorage<AreaBackground>('todo_bg_content', defaultGlassBackground);
  const detailBg = useLocalStorage<AreaBackground>('todo_bg_detail', defaultGlassBackground);

  migrateLegacyDefaultBackground(appBg, legacyDefaultAppColor, defaultTodoAppColor);
  migrateLegacyDefaultBackground(sidebarBg, legacyDefaultPanelColor, defaultTodoPanelColor);
  migrateLegacyDefaultBackground(contentBg, legacyDefaultPanelColor, defaultTodoPanelColor);
  migrateLegacyDefaultBackground(detailBg, legacyDefaultPanelColor, defaultTodoPanelColor);

  return {
    isSidebarCollapsed,
    appBg,
    sidebarBg,
    contentBg,
    detailBg,
  };
}
