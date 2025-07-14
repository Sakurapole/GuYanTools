import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './global.css'
import { router } from './routes/router'

createApp(App)
  .use(router)
  .use(createPinia())
  .mount('#guyan-tools')
