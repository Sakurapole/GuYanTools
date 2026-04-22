import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import '../main/global.css';
import { useAppConfigStore } from '../main/stores/app_config_store';
import { createDefaultAppConfig } from '@/contracts/app_config';

console.log('[TerminalWindow] main.ts loaded. href:', window.location.href);

/**
 * Bootstrap the detached terminal window.
 *
 * This is a lightweight setup compared to the main window:
 * - No router (single-view)
 * - No globalStore / sshStore / ftpStore
 * - Only loads appConfigStore (for terminal settings) and detachedTerminalStore
 */
async function bootstrap() {
  const initialConfig = window.appConfigApi
    ? await window.appConfigApi.getConfig()
    : createDefaultAppConfig();

  const pinia = createPinia();
  const app = createApp(App);

  app.use(pinia);

  // Hydrate app config so theme variables and terminal settings are available
  const appConfigStore = useAppConfigStore(pinia);
  appConfigStore.hydrate(initialConfig);
  await appConfigStore.loadLocalFonts();

  app.mount('#guyan-tools-terminal-window');
  console.log('[TerminalWindow] mounted successfully.');
}

void bootstrap();
