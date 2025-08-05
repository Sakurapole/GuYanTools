import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './global.css'
import { router } from './routes/router'
import ripple from './directives/ripple'

createApp(App)
  .directive('ripple', ripple)
  .use(router)
  .use(createPinia())
  .mount('#guyan-tools')
