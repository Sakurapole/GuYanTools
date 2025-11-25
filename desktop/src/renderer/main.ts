import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import ripple from './directives/ripple'
import './global.css'
import { router } from './routes/router'

import en from '../common/i18n/en'
import zh from '../common/i18n/zh'

import { createI18n } from "vue-i18n"

const i18n = createI18n({
  locale: 'zh',
  fallbackLocale: 'en',
  legacy: false,
  messages: {
    zh,
    en,
  }
})

createApp(App)
  .directive('ripple', ripple)
  .use(router)
  .use(createPinia())
  .use(i18n)
  .mount('#guyan-tools')
