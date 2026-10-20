import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
void window.pluginAPI?.logger.info('Vue plugin loaded');
