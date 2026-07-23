import type { PluginRuntimeApi, PluginThemeDescriptor } from './contracts';

export type PluginRuntimeInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;
export type PluginRuntimeSubscribe = (channel: string, listener: (payload: unknown) => void) => () => void;

export function createPluginApi(invoke: PluginRuntimeInvoke, subscribe?: PluginRuntimeSubscribe): PluginRuntimeApi {
  const call = <T>(channel: string, ...args: unknown[]) => invoke(channel, ...args) as Promise<T>;
  return {
    getContext: () => call('plugin-runtime:get-context'),
    workspace: { getCurrent: () => call('plugin-runtime:workspace:get-current') },
    data: { getCapabilities: () => call('plugin-runtime:data:get-capabilities') },
    storage: { get: key => call('plugin-runtime:storage:get', key), set: (key, value) => call('plugin-runtime:storage:set', key, value) },
    navigation: { openRoute: route => call('plugin-runtime:navigation:open-route', route) },
    commands: { execute: (commandId, payload) => call('plugin-runtime:commands:execute', commandId, payload) },
    ui: {
      getPages: () => call('plugin-runtime:ui:get-pages'),
      getTheme: () => call<PluginThemeDescriptor>('plugin-runtime:ui:get-theme'),
      onThemeChanged: listener => subscribe?.('plugin-runtime:ui:theme-changed', payload => listener(payload as PluginThemeDescriptor)) ?? (() => undefined),
    },
    system: { getCapabilities: () => call('plugin-runtime:system:get-capabilities'), showNotification: payload => call('plugin-runtime:system:show-notification', payload) },
    logger: { info: (message, meta) => call('plugin-runtime:logger:info', message, meta), error: (message, meta) => call('plugin-runtime:logger:error', message, meta) },
    network: { fetch: input => call('plugin-runtime:network:fetch', input) },
    files: {
      createDataGrant: accessMode => call('plugin-runtime:files:create-data-grant', accessMode),
      pickDirectoryGrant: () => call('plugin-runtime:files:pick-directory-grant'),
      revoke: grantId => call('plugin-runtime:files:revoke', grantId),
      read: (grantId, targetPath) => call('plugin-runtime:files:read', grantId, targetPath),
      write: (grantId, targetPath, bytesBase64) => call('plugin-runtime:files:write', grantId, targetPath, bytesBase64),
    },
    downloads: { direct: input => call('plugin-runtime:downloads:direct', input) },
    jobs: {
      create: (kind, input, parentJobId) => call('plugin-runtime:jobs:create', kind, input, parentJobId),
      list: () => call('plugin-runtime:jobs:list'), get: id => call('plugin-runtime:jobs:get', id), update: (id, input) => call('plugin-runtime:jobs:update', id, input),
      cancel: id => call('plugin-runtime:jobs:cancel', id), retry: sourceId => call('plugin-runtime:jobs:retry', sourceId),
    },
    media: {
      probe: (grantId, targetPath) => call('plugin-runtime:media:probe', grantId, targetPath),
      transcode: input => call('plugin-runtime:media:transcode', input),
      preview: (url, mimeType) => call('plugin-runtime:media:preview', url, mimeType),
      writeTags: (grantId, targetPath, tags) => call('plugin-runtime:media:write-tags', grantId, targetPath, tags),
    },
    secrets: { get: key => call('plugin-runtime:secrets:get', key), set: (key, value) => call('plugin-runtime:secrets:set', key, value), delete: key => call('plugin-runtime:secrets:delete', key) },
  };
}
