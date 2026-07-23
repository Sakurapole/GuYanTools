export interface PluginRuntimeRouteLocation {
  meta: Record<string, unknown>;
  params: Record<string, unknown>;
}

function readRouteValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function resolvePluginPageIdentity(location: PluginRuntimeRouteLocation) {
  return {
    pluginId: readRouteValue(location.meta.pluginId) ?? readRouteValue(location.params.pluginId) ?? '',
    pageId: readRouteValue(location.meta.pageId) ?? readRouteValue(location.params.pageId) ?? '',
  };
}
