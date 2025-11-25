import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router"

const routes: Readonly<RouteRecordRaw[]> = [
  { path: '/', redirect: '/home' },
  { path: '/home', component: () => import('../pages/Home/Home.vue') },
  { path: '/settings', component: () => import('../pages/Settings.vue') },
]


const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export {
  router
}

