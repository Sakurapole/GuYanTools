import { useLocalStorage } from '@vueuse/core';
import type { BackgroundStyleConfig } from '@/windows/main/types/grid';

export interface AreaBackground {
  type: 'color' | 'image' | 'video';
  color: string;
  image: string;
  video: string;
  backgroundStyle: BackgroundStyleConfig;
}

const defaultGlassBackground: AreaBackground = {
  type: 'color',
  color: 'rgba(255, 255, 255, 0.65)',
  image: '',
  video: '',
  backgroundStyle: { opacity: 1 },
};

const defaultAppBackground: AreaBackground = {
  type: 'color',
  color: 'var(--color-bg-primary, #f5f7fa)',
  image: '',
  video: '',
  backgroundStyle: { opacity: 1 },
};

export function useTodoSettings() {
  const isSidebarCollapsed = useLocalStorage('todo_sidebar_collapsed', false);

  const appBg = useLocalStorage<AreaBackground>('todo_bg_app', defaultAppBackground);
  const sidebarBg = useLocalStorage<AreaBackground>('todo_bg_sidebar', defaultGlassBackground);
  const contentBg = useLocalStorage<AreaBackground>('todo_bg_content', defaultGlassBackground);
  const detailBg = useLocalStorage<AreaBackground>('todo_bg_detail', defaultGlassBackground);

  return {
    isSidebarCollapsed,
    appBg,
    sidebarBg,
    contentBg,
    detailBg,
  };
}
