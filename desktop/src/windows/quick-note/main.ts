import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import '../main/global.css';
import '../main/assets/foundation.scss';
import '../main/assets/theme.scss';
import '../main/assets/patterns.scss';

createApp(App).use(createPinia()).mount('#quick-note-app');
