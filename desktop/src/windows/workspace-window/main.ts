import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import 'katex/dist/katex.min.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import { createDefaultAppConfig } from '@/contracts/app_config';
import ripple from '@/windows/main/directives/ripple';
import tooltip from '@/windows/main/directives/tooltip';
import { installInAppErrorHandlers } from '@/windows/main/composables/useInAppNotification';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';
import { router } from '@/windows/main/routes/router';
import en from '@/windows/main/i18n/en';
import zh from '@/windows/main/i18n/zh';
import '@/windows/main/global.css';
import App from './WorkspaceWindowApp.vue';

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
    },
  });

  const pinia = createPinia();
  const app = createApp(App);

  app.directive('ripple', ripple);
  app.directive('tooltip', tooltip);
  app.use(router);
  app.use(pinia);
  app.use(i18n);
  installInAppErrorHandlers(app);

  const appConfigStore = useAppConfigStore(pinia);
  appConfigStore.setLanguageApplier((language) => {
    i18n.global.locale.value = language;
  });
  appConfigStore.hydrate(initialConfig);
  await appConfigStore.loadLocalFonts();

  await router.isReady();
  app.mount('#guyan-workspace-window');
}

void bootstrap();
