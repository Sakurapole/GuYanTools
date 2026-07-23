import { createApp } from 'vue';
import '@guyantools/plugin-ui/tokens.css';
import { registerGuYanVueElements } from '@guyantools/plugin-ui/vue';
import App from './App.vue';

registerGuYanVueElements();
createApp(App).mount('#app');
void window.pluginAPI?.logger.info('Vue plugin loaded');
