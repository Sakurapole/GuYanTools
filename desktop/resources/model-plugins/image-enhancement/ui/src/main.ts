import '@plugin-ui/tokens.css';
import { registerGuYanElements } from '@plugin-ui';
import { registerGuYanPluginExtras } from '@plugin-ui/elements/register-extras';
import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { createPluginNotifier, pluginNotifierKey, type NotificationSystem } from './notifications';

registerGuYanElements();
registerGuYanPluginExtras();
const api = (window as Window & { pluginAPI?: { system?: NotificationSystem } }).pluginAPI;
const notifier = createPluginNotifier(api?.system);
const app = createApp(App);
app.provide(pluginNotifierKey, notifier);
app.config.errorHandler = (error) => {
  console.error('[AI 图像处理工具] 页面组件异常', error);
  void notifier.notify('error', error, '页面组件异常');
};
app.onUnmount(notifier.listen(window));
app.mount('#app');
