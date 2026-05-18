import type { AppConfigPatch, AppTheme } from '@/contracts/app_config';
import { computed } from 'vue';
import { useAppConfigStore } from '../stores/app_config_store';

type Theme = AppTheme;
const THEME_TRANSITION_CLASS = 'theme-transitioning';
const THEME_RENDER_STABILIZE_DELAY = 240;
const THEME_VIEW_TRANSITION_DURATION = 500;
const THEME_VIEW_TRANSITION_RELEASE_DELAY = THEME_VIEW_TRANSITION_DURATION + 120;
const THEME_SWITCH_COOLDOWN = 320;
let themePersistVersion = 0;
let themeTransitionActive = false;
let themeRenderGuardTimer: number | undefined;
let themeRenderReleaseFrame: number | undefined;
let lastThemeSwitchAt = 0;

function releaseThemeRenderGuard() {
  const root = document.documentElement;
  window.clearTimeout(themeRenderGuardTimer);
  if (themeRenderReleaseFrame !== undefined) {
    window.cancelAnimationFrame(themeRenderReleaseFrame);
    themeRenderReleaseFrame = undefined;
  }
  root.classList.remove(THEME_TRANSITION_CLASS);
  themeTransitionActive = false;
}

function guardThemeRender(stabilizeDelay = THEME_RENDER_STABILIZE_DELAY, releaseAfterPaint = true) {
  const root = document.documentElement;
  root.classList.add(THEME_TRANSITION_CLASS);

  if (themeRenderReleaseFrame !== undefined) {
    window.cancelAnimationFrame(themeRenderReleaseFrame);
    themeRenderReleaseFrame = undefined;
  }

  window.clearTimeout(themeRenderGuardTimer);
  if (releaseAfterPaint) {
    themeRenderReleaseFrame = window.requestAnimationFrame(() => {
      themeRenderReleaseFrame = window.requestAnimationFrame(releaseThemeRenderGuard);
    });
  }
  themeRenderGuardTimer = window.setTimeout(releaseThemeRenderGuard, stabilizeDelay);
}

function guardThemeSwitchUntil(promise: Promise<unknown>, fallbackDelay: number) {
  window.clearTimeout(themeRenderGuardTimer);
  themeRenderGuardTimer = window.setTimeout(() => {
    themeTransitionActive = false;
  }, fallbackDelay);

  void promise
    .finally(() => {
      window.clearTimeout(themeRenderGuardTimer);
      themeTransitionActive = false;
    })
    .catch(() => {
      themeTransitionActive = false;
    });
}

export const useTheme = () => {
  const appConfigStore = useAppConfigStore();
  const theme = computed(() => appConfigStore.config.appearance.theme);

  const persistTheme = (patch: AppConfigPatch) => {
    const persistVersion = ++themePersistVersion;

    void appConfigStore.persistConfigPatch(patch)
      .catch((error) => {
        console.error('[Theme] 持久化主题配置失败:', error);
        if (persistVersion === themePersistVersion) {
          void appConfigStore.refreshConfig().catch((refreshError) => {
            console.error('[Theme] 回滚主题配置失败:', refreshError);
          });
        }
      });
  };

  const setTheme = (value: Theme, shouldGuardRender = true) => {
    const patch: AppConfigPatch = {
      appearance: {
        theme: value,
      },
    };

    if (shouldGuardRender) {
      guardThemeRender();
    }
    appConfigStore.applyLocalAppearanceConfig({ theme: value });
    persistTheme(patch);
    return Promise.resolve(appConfigStore.config);
  };

  const toggleTheme = (event?: MouseEvent) => {
    const now = window.performance.now();
    if (themeTransitionActive || now - lastThemeSwitchAt < THEME_SWITCH_COOLDOWN) {
      return;
    }

    lastThemeSwitchAt = now;
    const newTheme = theme.value === 'light' ? 'dark' : 'light';
    const willDark = newTheme === 'dark';
    themeTransitionActive = true;

    if (typeof document.startViewTransition !== 'function') {
      guardThemeRender();
      void setTheme(newTheme, false);
      return;
    }

    const transition = document.startViewTransition(() => {
      void setTheme(newTheme, false);
    });
    guardThemeSwitchUntil(transition.finished, THEME_VIEW_TRANSITION_RELEASE_DELAY);

    const x = event?.clientX ?? window.innerWidth;
    const y = event?.clientY ?? 0;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    void transition.ready
      .then(() => {
        const clipPath = [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ];

        document.documentElement.animate(
          {
            clipPath: willDark ? clipPath : [...clipPath].reverse(),
          },
          {
            duration: THEME_VIEW_TRANSITION_DURATION,
            easing: 'ease-in',
            pseudoElement: willDark ? '::view-transition-new(root)' : '::view-transition-old(root)',
          },
        );
      })
      .catch((error) => {
        console.warn('[Theme] View transition animation failed:', error);
      });

  };

  return { theme, setTheme, toggleTheme };
};
