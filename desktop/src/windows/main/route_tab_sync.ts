export interface RouteTabLike {
  fullPath: string;
  meta: Record<string, unknown>;
}

export interface BottomBarTabSync {
  openTab: (url: string, name: string, icon?: string) => void;
  activateTabByUrl: (url: string) => void;
}

export function syncRouteToBottomBar(route: RouteTabLike, barStore: BottomBarTabSync): void {
  const pluginId = route.meta.pluginId;
  const pageId = route.meta.pageId;
  const isPluginRoute =
    (typeof pluginId === 'string' && typeof pageId === 'string') ||
    route.fullPath.split('?')[0].startsWith('/plugins/runtime/');
  if (isPluginRoute) {
    const title = typeof route.meta.title === 'string' ? route.meta.title : '插件页面';
    const icon = typeof route.meta.icon === 'string' ? route.meta.icon : 'plugins';
    barStore.openTab(route.fullPath, title, icon);
    return;
  }
  barStore.activateTabByUrl(route.fullPath);
}
