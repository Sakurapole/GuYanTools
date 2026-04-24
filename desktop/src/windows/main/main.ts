import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import ripple from './directives/ripple'
import './global.css'
import { registerPluginRoutes, router } from './routes/router'
import { useAppConfigStore } from './stores/app_config_store'
import { useBarStore } from './stores/bar_store'
import { useGlobalStore } from './stores/global_store'
import { useUpdaterStore } from './stores/updater_store'

import en from './i18n/en'
import zh from './i18n/zh'
import { createDefaultAppConfig } from '@/contracts/app_config'
import { createI18n } from "vue-i18n"

async function bootstrap() {
  const initialConfig = window.appConfigApi
    ? await window.appConfigApi.getConfig()
    : createDefaultAppConfig();

  const i18n = createI18n({
    locale: initialConfig.appearance.language,
    fallbackLocale: 'en',
    legacy: false,
    messages: {
      zh,
      en,
    }
  });

  if (window.pluginHostApi) {
    const pluginPages = await window.pluginHostApi.listPages();
    registerPluginRoutes(pluginPages);
  }

  const pinia = createPinia();
  const app = createApp(App);
  app.directive('ripple', ripple);
  app.use(router);
  app.use(pinia);
  app.use(i18n);

  const appConfigStore = useAppConfigStore(pinia);
  appConfigStore.setLanguageApplier((language) => {
    i18n.global.locale.value = language;
  });
  appConfigStore.hydrate(initialConfig);
  await appConfigStore.loadLocalFonts();

  const barStore = useBarStore(pinia);
  barStore.ensureFixedTabs();

  const updaterStore = useUpdaterStore(pinia);
  await updaterStore.initialize();

  router.afterEach((to) => {
    const globalStore = useGlobalStore(pinia);
    const title = typeof to.meta.title === 'string' ? to.meta.title : 'GuYanTools';
    globalStore.setCurrentPage(title);
    barStore.activateTabByUrl(to.fullPath);
  });

  await router.isReady();
  barStore.activateTabByUrl(router.currentRoute.value.fullPath);
  app.mount('#guyan-tools');
}

void bootstrap();
