import { useLocalStorage } from '@vueuse/core';
import type { BackgroundStyleConfig } from '@/windows/main/types/grid';

export interface AreaBackground {
  type: 'color' | 'image' | 'video';
  color: string;
  image: string;
  video: string;
  backgroundStyle: BackgroundStyleConfig;
}

const defaultAppColor = 'var(--todo-app-bg, var(--background-color))';
const defaultPanelColor = 'var(--todo-panel-bg, var(--ui-surface-glass))';
const legacyDefaultAppColor = 'var(--color-bg-primary, #f5f7fa)';
const legacyDefaultPanelColor = 'rgba(255, 255, 255, 0.65)';

const defaultGlassBackground: AreaBackground = {
  type: 'color',
  color: defaultPanelColor,
  image: '',
  video: '',
  backgroundStyle: { opacity: 1 },
};

const defaultAppBackground: AreaBackground = {
  type: 'color',
  color: defaultAppColor,
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

  migrateLegacyDefaultBackground(appBg, legacyDefaultAppColor, defaultAppColor);
  migrateLegacyDefaultBackground(sidebarBg, legacyDefaultPanelColor, defaultPanelColor);
  migrateLegacyDefaultBackground(contentBg, legacyDefaultPanelColor, defaultPanelColor);
  migrateLegacyDefaultBackground(detailBg, legacyDefaultPanelColor, defaultPanelColor);

  return {
    isSidebarCollapsed,
    appBg,
    sidebarBg,
    contentBg,
    detailBg,
  };
}
