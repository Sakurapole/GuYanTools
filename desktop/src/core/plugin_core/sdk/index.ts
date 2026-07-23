import type { PluginRuntimeApi } from '@/contracts/plugin_host';

export type PluginRuntimeInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

export function createPluginApi(invoke: PluginRuntimeInvoke): PluginRuntimeApi {
  return {
    getContext: () => invoke('plugin-runtime:get-context') as ReturnType<PluginRuntimeApi['getContext']>,
    workspace: { getCurrent: () => invoke('plugin-runtime:workspace:get-current') as ReturnType<PluginRuntimeApi['workspace']['getCurrent']> },
    data: { getCapabilities: () => invoke('plugin-runtime:data:get-capabilities') as ReturnType<PluginRuntimeApi['data']['getCapabilities']> },
    storage: {
      get: key => invoke('plugin-runtime:storage:get', key) as ReturnType<PluginRuntimeApi['storage']['get']>,
      set: (key, value) => invoke('plugin-runtime:storage:set', key, value) as ReturnType<PluginRuntimeApi['storage']['set']>,
    },
    navigation: { openRoute: route => invoke('plugin-runtime:navigation:open-route', route) as ReturnType<PluginRuntimeApi['navigation']['openRoute']> },
    commands: { execute: (commandId, payload) => invoke('plugin-runtime:commands:execute', commandId, payload) as ReturnType<PluginRuntimeApi['commands']['execute']> },
    ui: { getPages: () => invoke('plugin-runtime:ui:get-pages') as ReturnType<PluginRuntimeApi['ui']['getPages']> },
    system: {
      getCapabilities: () => invoke('plugin-runtime:system:get-capabilities') as ReturnType<PluginRuntimeApi['system']['getCapabilities']>,
      showNotification: payload => invoke('plugin-runtime:system:show-notification', payload) as ReturnType<PluginRuntimeApi['system']['showNotification']>,
    },
    logger: {
      info: (message, meta) => invoke('plugin-runtime:logger:info', message, meta) as ReturnType<PluginRuntimeApi['logger']['info']>,
      error: (message, meta) => invoke('plugin-runtime:logger:error', message, meta) as ReturnType<PluginRuntimeApi['logger']['error']>,
    },
    network: { fetch: input => invoke('plugin-runtime:network:fetch', input) as ReturnType<PluginRuntimeApi['network']['fetch']> },
    files: {
      createDataGrant: accessMode => invoke('plugin-runtime:files:create-data-grant', accessMode) as ReturnType<PluginRuntimeApi['files']['createDataGrant']>,
      revoke: grantId => invoke('plugin-runtime:files:revoke', grantId) as ReturnType<PluginRuntimeApi['files']['revoke']>,
      read: (grantId, targetPath) => invoke('plugin-runtime:files:read', grantId, targetPath) as ReturnType<PluginRuntimeApi['files']['read']>,
      write: (grantId, targetPath, bytesBase64) => invoke('plugin-runtime:files:write', grantId, targetPath, bytesBase64) as ReturnType<PluginRuntimeApi['files']['write']>,
    },
    downloads: { direct: input => invoke('plugin-runtime:downloads:direct', input) as ReturnType<PluginRuntimeApi['downloads']['direct']> },
    jobs: {
      create: (kind, input, parentJobId) => invoke('plugin-runtime:jobs:create', kind, input, parentJobId) as ReturnType<PluginRuntimeApi['jobs']['create']>,
      list: () => invoke('plugin-runtime:jobs:list') as ReturnType<PluginRuntimeApi['jobs']['list']>,
      get: id => invoke('plugin-runtime:jobs:get', id) as ReturnType<PluginRuntimeApi['jobs']['get']>,
      update: (id, input) => invoke('plugin-runtime:jobs:update', id, input) as ReturnType<PluginRuntimeApi['jobs']['update']>,
      cancel: id => invoke('plugin-runtime:jobs:cancel', id) as ReturnType<PluginRuntimeApi['jobs']['cancel']>,
      retry: sourceId => invoke('plugin-runtime:jobs:retry', sourceId) as ReturnType<PluginRuntimeApi['jobs']['retry']>,
    },
    media: {
      probe: (grantId, targetPath) => invoke('plugin-runtime:media:probe', grantId, targetPath) as ReturnType<PluginRuntimeApi['media']['probe']>,
      transcode: input => invoke('plugin-runtime:media:transcode', input) as ReturnType<PluginRuntimeApi['media']['transcode']>,
      preview: (url, mimeType) => invoke('plugin-runtime:media:preview', url, mimeType) as ReturnType<PluginRuntimeApi['media']['preview']>,
      writeTags: (grantId, targetPath, tags) => invoke('plugin-runtime:media:write-tags', grantId, targetPath, tags) as ReturnType<PluginRuntimeApi['media']['writeTags']>,
    },
    secrets: {
      get: key => invoke('plugin-runtime:secrets:get', key) as ReturnType<PluginRuntimeApi['secrets']['get']>,
      set: (key, value) => invoke('plugin-runtime:secrets:set', key, value) as ReturnType<PluginRuntimeApi['secrets']['set']>,
      delete: key => invoke('plugin-runtime:secrets:delete', key) as ReturnType<PluginRuntimeApi['secrets']['delete']>,
    },
  };
}
