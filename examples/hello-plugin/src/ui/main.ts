import { createApp } from 'vue';
import { ensureGuYanElements } from '@guyantools/ui-vue';
import '@guyantools/ui-core/tokens.css';
import App from './App.vue';

ensureGuYanElements();
createApp(App).mount('#app');
