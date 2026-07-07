import type { PluginPageDescriptor } from '@/contracts/plugin_host';
import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router"

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/__workspace-prewarm', component: () => import('@/windows/workspace-window/WorkspaceWindowSkeleton.vue'), meta: { title: '独立窗口预热' } },
  { path: '/home', name: 'Home', component: () => import('../pages/Home/Home.vue'), meta: { title: '首页', keepAlive: true } },
  { path: '/settings', component: () => import('../pages/Settings.vue'), meta: { title: '设置' } },
  { path: '/plugins', component: () => import('../pages/Plugins/Plugins.vue'), meta: { title: '插件平台' } },
  { path: '/terminal', name: 'Terminal', component: () => import('../pages/Terminal/TerminalPage.vue'), meta: { title: '终端', keepAlive: true } },
  { path: '/ftp', name: 'FileTransfer', component: () => import('../pages/Ftp/FtpPage.vue'), meta: { title: '文件传输', keepAlive: true } },
  { path: '/todo', name: 'Todo', component: () => import('../pages/Todo/TodoApp.vue'), meta: { title: 'Todo', keepAlive: true } },
  { path: '/knowledge', name: 'Knowledge', component: () => import('../pages/Knowledge/KnowledgePage.vue'), meta: { title: '知识库', keepAlive: true } },
  { path: '/ai', name: 'AI', component: () => import('../pages/AI/AiChatPage.vue'), meta: { title: 'AI', keepAlive: true } },
  { path: '/webview', name: 'WebView', component: () => import('../pages/WebViewPage.vue'), meta: { title: '网页' } },
  { path: '/script-editor', name: 'ScriptEditor', component: () => import('../pages/ScriptEditor.vue'), meta: { title: '脚本编辑器' } },
];

// 开发模式加载调试工具页面
if (import.meta.env.DEV) {
  routes.push({
    path: '/devtools',
    component: () => import('../pages/DevTools.vue'),
    meta: { title: '调试工具' },
  });
}


const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export function registerPluginRoutes(pluginPages: PluginPageDescriptor[]) {
  for (const page of pluginPages) {
    const routeName = `plugin:${page.pluginId}:${page.pageId}`;
    if (router.hasRoute(routeName)) {
      continue;
    }

    router.addRoute({
      name: routeName,
      path: page.routePath,
      component: () => import('../pages/Plugins/PluginRuntimePage.vue'),
      props: true,
      meta: {
        title: page.title,
        pluginId: page.pluginId,
        pageId: page.pageId,
      },
    });
  }
}

export {
  router
}

