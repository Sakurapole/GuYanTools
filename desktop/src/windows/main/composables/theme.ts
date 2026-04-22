import type { AppTheme } from '@/contracts/app_config';
import { computed } from "vue";
import { useAppConfigStore } from "../stores/app_config_store";

type Theme = AppTheme;

export const useTheme = () => {
  const appConfigStore = useAppConfigStore();
  const theme = computed(() => appConfigStore.config.appearance.theme);

  const setTheme = async (value: Theme) => {
    await appConfigStore.updateConfig({
      appearance: {
        theme: value,
      },
    });
  };

  const toggleTheme = async (event?: MouseEvent) => {
    const newTheme = theme.value === "light" ? "dark" : "light";
    const willDark = newTheme === "dark";
    const applyThemeChange = async () => {
      await setTheme(newTheme);
    };

    if (typeof document.startViewTransition !== 'function') {
      await applyThemeChange();
      return;
    }

    const transition = document.startViewTransition(() => {
      void applyThemeChange();
    });

    const x = event?.clientX ?? window.innerWidth
    const y = event?.clientY ?? 0

    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    void transition.ready.then(() => {
      const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
      document.documentElement.animate(
        {
          clipPath: willDark ? clipPath : [...clipPath].reverse(),
        },
        {
          duration: 500,
          easing: 'ease-in',
          pseudoElement: willDark ? '::view-transition-new(root)' : '::view-transition-old(root)',
        },
      )
    });

  };

  return { theme, setTheme, toggleTheme };
}
