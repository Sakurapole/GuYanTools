import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref } from 'vue';
import type { AppAppearanceConfig, AppConfig, AppConfigPatch, AppLanguage, LocalFontOption } from '@/contracts/app_config';
import {
  createDefaultAppConfig,
  getSystemDefaultFontOption,
  SYSTEM_FONT_OPTION_VALUE,
  SYSTEM_FONT_STACK,
} from '@/contracts/app_config';

function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildFontFamilyValue(fontFamily: string) {
  if (fontFamily === SYSTEM_FONT_OPTION_VALUE) {
    return SYSTEM_FONT_STACK;
  }

  const escaped = fontFamily.replace(/"/g, '\\"');
  return `"${escaped}", ${SYSTEM_FONT_STACK}`;
}

export const useAppConfigStore = defineStore('app-config', () => {
  const config = ref<AppConfig>(createDefaultAppConfig());
  const fontOptions = ref<LocalFontOption[]>([getSystemDefaultFontOption()]);
  let applyLanguage: ((language: AppLanguage) => void) | null = null;

  function setLanguageApplier(handler: (language: AppLanguage) => void) {
    applyLanguage = handler;
  }

  function applyRuntimeConfig(nextConfig: AppConfig) {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(nextConfig.appearance.theme);
    root.style.fontSize = `${nextConfig.appearance.baseFontSize}px`;
    root.style.setProperty('--app-font-family', buildFontFamilyValue(nextConfig.appearance.fontFamily));
    applyLanguage?.(nextConfig.appearance.language);
  }

  function hydrate(nextConfig: AppConfig) {
    config.value = cloneConfig(nextConfig);
    applyRuntimeConfig(config.value);
  }

  function applyLocalAppearanceConfig(appearance: Partial<AppAppearanceConfig>) {
    const nextConfig = cloneConfig(config.value);
    nextConfig.appearance = {
      ...nextConfig.appearance,
      ...appearance,
    };
    hydrate(nextConfig);
    return config.value;
  }

  async function refreshConfig() {
    if (!window.appConfigApi) {
      hydrate(createDefaultAppConfig());
      return config.value;
    }

    const nextConfig = await window.appConfigApi.getConfig();
    hydrate(nextConfig);
    return config.value;
  }

  async function updateConfig(patch: AppConfigPatch) {
    if (!window.appConfigApi) {
      const merged = createDefaultAppConfig();
      hydrate(merged);
      return config.value;
    }

    // 用 cloneConfig 剥离 Vue 响应式代理，避免 IPC 结构化克隆失败
    const plainPatch = cloneConfig(patch);
    const nextConfig = await window.appConfigApi.updateConfig(plainPatch);
    hydrate(nextConfig);
    return config.value;
  }

  async function persistConfigPatch(patch: AppConfigPatch) {
    if (!window.appConfigApi) {
      return config.value;
    }

    const plainPatch = cloneConfig(patch);
    return window.appConfigApi.updateConfig(plainPatch);
  }

  async function loadLocalFonts() {
    if (!window.appConfigApi) {
      fontOptions.value = [getSystemDefaultFontOption()];
      return fontOptions.value;
    }

    const loadedFonts = await window.appConfigApi.listLocalFonts();
    fontOptions.value = loadedFonts.length > 0 ? loadedFonts : [getSystemDefaultFontOption()];
    return fontOptions.value;
  }

  return {
    config,
    fontOptions,
    hydrate,
    refreshConfig,
    updateConfig,
    persistConfigPatch,
    loadLocalFonts,
    setLanguageApplier,
    applyRuntimeConfig,
    applyLocalAppearanceConfig,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAppConfigStore, import.meta.hot));
}
