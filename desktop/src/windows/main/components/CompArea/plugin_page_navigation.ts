import { getPluginPageRoutePath, type PluginPageDescriptor } from '../../../../contracts/plugin_host';

export function resolvePluginPageRoute(
  pages: readonly PluginPageDescriptor[] | undefined,
  pluginId: string,
  pageId: string,
): string {
  return pages?.find(page => page.pluginId === pluginId && page.pageId === pageId)?.routePath
    ?? getPluginPageRoutePath(pluginId, pageId);
}
