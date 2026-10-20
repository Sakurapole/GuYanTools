import {
  getPluginPageRoutePath,
  type InstalledPluginRecord,
  type PluginPageDescriptor,
} from '../../../../contracts/plugin_host';

export function getPluginPageDescriptors(
  plugin: InstalledPluginRecord,
  registeredPages: readonly PluginPageDescriptor[]
): PluginPageDescriptor[] {
  const registered = registeredPages.filter((page) => page.pluginId === plugin.manifest.id);
  const declaredPages = plugin.manifest.contributes.pages ?? [];
  if (declaredPages.length === 0) return registered;

  const registeredById = new Map(registered.map((page) => [page.pageId, page]));
  return declaredPages.map((page) => {
    const assembled = registeredById.get(page.id);
    if (assembled) return assembled;
    return {
      pluginId: plugin.manifest.id,
      pageId: page.id,
      title: page.title,
      routePath: page.routePath ?? getPluginPageRoutePath(plugin.manifest.id, page.id),
      icon: page.icon,
      description: page.description,
      trustLevel: plugin.manifest.trustLevel,
      showDevToolsButton: plugin.manifest.ui?.showDevToolsButton === true,
    };
  });
}
