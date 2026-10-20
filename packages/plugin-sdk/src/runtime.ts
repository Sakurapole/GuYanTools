import type { PluginCommandHandler, PluginRuntimeApi, PluginThemeDescriptor } from './contracts';

export type PluginRuntimeInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;
export type PluginRuntimeSubscribe = (
  channel: string,
  listener: (payload: unknown) => void
) => () => void;

export function createPluginApi(
  invoke: PluginRuntimeInvoke,
  subscribe?: PluginRuntimeSubscribe
): PluginRuntimeApi {
  const call = <T>(channel: string, ...args: unknown[]) => invoke(channel, ...args) as Promise<T>;
  const commandHandlers = new Map<string, PluginCommandHandler>();
  const capabilityHandlers = new Map<
    string,
    (operation: string, payload?: unknown) => unknown | Promise<unknown>
  >();
  subscribe?.('plugin-runtime:command:invoke', (payload) => {
    const input = payload as { requestId?: string; commandId?: string; payload?: unknown };
    if (!input?.requestId || !input.commandId) return;
    const handler = commandHandlers.get(input.commandId);
    if (!handler) return;
    Promise.resolve()
      .then(() => handler(input.payload))
      .then((result) =>
        call('plugin-runtime:commands:respond', input.requestId, { ok: true, result })
      )
      .catch((error: unknown) =>
        call('plugin-runtime:commands:respond', input.requestId, {
          ok: false,
          error: {
            code: 'INTERNAL',
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          },
        })
      );
  });
  subscribe?.('plugin-runtime:capability:invoke', (payload) => {
    const input = payload as {
      requestId?: string;
      capabilityId?: string;
      operation?: string;
      payload?: unknown;
    };
    if (!input?.requestId || !input.capabilityId || !input.operation) return;
    const handler = capabilityHandlers.get(input.capabilityId);
    if (!handler) return;
    Promise.resolve()
      .then(() => handler(input.operation!, input.payload))
      .then((result) =>
        call('plugin-runtime:capabilities:respond', input.requestId, { ok: true, result })
      )
      .catch((error: unknown) =>
        call('plugin-runtime:capabilities:respond', input.requestId, {
          ok: false,
          error: {
            code: 'INTERNAL',
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          },
        })
      );
  });
  return {
    getContext: () => call('plugin-runtime:get-context'),
    lifecycle: { ready: () => call('plugin-runtime:worker:ready') },
    models: {
      listPython: () => call('plugin-runtime:models:list-python'),
      installMiniforge: () => call('plugin-runtime:models:install-miniforge'),
      createEnvironment: (baseId) => call('plugin-runtime:models:create-environment', baseId),
      checkDependencies: (device) => call('plugin-runtime:models:check-dependencies', device),
      installDependencies: (device, profileId) =>
        profileId === undefined
          ? call('plugin-runtime:models:install-dependencies', device)
          : call('plugin-runtime:models:install-dependencies', device, profileId),
      getEnvironmentSnapshot: () => call('plugin-runtime:models:environments:list'),
      importEnvironment: () => call('plugin-runtime:models:environments:import'),
      createManagedEnvironment: (input) => call('plugin-runtime:models:environments:create', input),
      selectEnvironment: (id) => call('plugin-runtime:models:environments:select', id),
      clearActiveEnvironment: () => call('plugin-runtime:models:environments:clear-active'),
      removeEnvironment: (id) => call('plugin-runtime:models:environments:remove', id),
      listPackages: (id, manager) => call('plugin-runtime:models:packages:list', id, manager),
      changePackages: (input) => call('plugin-runtime:models:packages:change', input),
      checkPackages: (id, manager) => call('plugin-runtime:models:packages:check', id, manager),
      exportPackages: (id, manager) => call('plugin-runtime:models:packages:export', id, manager),
      inspectRuntime: (id) => call('plugin-runtime:models:inspect', id),
      getDependencyProfiles: () => call('plugin-runtime:models:profiles'),
      pickFile: (kind) => call('plugin-runtime:models:pick-file', kind),
      startInference: (input) => call('plugin-runtime:models:start-inference', input),
      cancel: (jobId) => call('plugin-runtime:models:cancel', jobId),
    },
    workspace: { getCurrent: () => call('plugin-runtime:workspace:get-current') },
    data: { getCapabilities: () => call('plugin-runtime:data:get-capabilities') },
    storage: {
      get: (key) => call('plugin-runtime:storage:get', key),
      set: (key, value) => call('plugin-runtime:storage:set', key, value),
    },
    navigation: { openRoute: (route) => call('plugin-runtime:navigation:open-route', route) },
    commands: {
      execute: (commandId, payload) => call('plugin-runtime:commands:execute', commandId, payload),
      register: async (commandId, handler) => {
        if (handler) commandHandlers.set(commandId, handler);
        await call('plugin-runtime:commands:register', commandId);
      },
    },
    ui: {
      getPages: () => call('plugin-runtime:ui:get-pages'),
      getTheme: () => call<PluginThemeDescriptor>('plugin-runtime:ui:get-theme'),
      onThemeChanged: (listener) =>
        subscribe?.('plugin-runtime:ui:theme-changed', (payload) =>
          listener(payload as PluginThemeDescriptor)
        ) ?? (() => undefined),
    },
    system: {
      getCapabilities: () => call('plugin-runtime:system:get-capabilities'),
      showNotification: (payload) => call('plugin-runtime:system:show-notification', payload),
      openExternal: (url) => call('plugin-runtime:system:open-external', url),
    },
    logger: {
      info: (message, meta) => call('plugin-runtime:logger:info', message, meta),
      error: (message, meta) => call('plugin-runtime:logger:error', message, meta),
    },
    network: { fetch: (input) => call('plugin-runtime:network:fetch', input) },
    files: {
      createDataGrant: (accessMode) => call('plugin-runtime:files:create-data-grant', accessMode),
      pickDirectoryGrant: () => call('plugin-runtime:files:pick-directory-grant'),
      revoke: (grantId) => call('plugin-runtime:files:revoke', grantId),
      read: (grantId, targetPath) => call('plugin-runtime:files:read', grantId, targetPath),
      write: (grantId, targetPath, bytesBase64) =>
        call('plugin-runtime:files:write', grantId, targetPath, bytesBase64),
    },
    downloads: { direct: (input) => call('plugin-runtime:downloads:direct', input) },
    jobs: {
      create: (kind, input, parentJobId) =>
        call('plugin-runtime:jobs:create', kind, input, parentJobId),
      list: () => call('plugin-runtime:jobs:list'),
      get: (id) => call('plugin-runtime:jobs:get', id),
      update: (id, input) => call('plugin-runtime:jobs:update', id, input),
      cancel: (id) => call('plugin-runtime:jobs:cancel', id),
      retry: (sourceId) => call('plugin-runtime:jobs:retry', sourceId),
      onEvent: (listener) =>
        subscribe?.('plugin-runtime:jobs:event', (payload) =>
          listener(payload as import('./contracts').JobRecord)
        ) ?? (() => undefined),
    },
    capabilities: {
      register: async (capabilityId, handler) => {
        capabilityHandlers.set(capabilityId, handler);
        try {
          await call('plugin-runtime:capabilities:register', capabilityId);
        } catch (error) {
          capabilityHandlers.delete(capabilityId);
          throw error;
        }
      },
      list: () => call('plugin-runtime:capabilities:list'),
      resolveByUrl: (url) => call('plugin-runtime:capabilities:resolve-by-url', url),
      invoke: (input) => call('plugin-runtime:capabilities:invoke', input),
    },
    media: {
      probe: (grantId, targetPath) => call('plugin-runtime:media:probe', grantId, targetPath),
      transcode: (input) => call('plugin-runtime:media:transcode', input),
      preview: (url, mimeType, headers, credential) =>
        call('plugin-runtime:media:preview', url, mimeType, headers, credential),
      writeTags: (grantId, targetPath, tags) =>
        call('plugin-runtime:media:write-tags', grantId, targetPath, tags),
    },
    android: {
      devices: {
        list: () => call('plugin-runtime:android:devices:list'),
        onChanged: (listener) =>
          subscribe?.('plugin-runtime:android:devices:changed', (payload) =>
            listener(payload as import('./contracts').AndroidDeviceEvent)
          ) ?? (() => undefined),
      },
      sessions: {
        list: () => call('plugin-runtime:android:sessions:list'),
        startMirror: (input) => call('plugin-runtime:android:sessions:start-mirror', input),
        startAudio: (input) => call('plugin-runtime:android:sessions:start-audio', input),
        startOtg: (input) => call('plugin-runtime:android:sessions:start-otg', input),
        stop: (sessionId) => call('plugin-runtime:android:sessions:stop', sessionId),
        onEvent: (listener) =>
          subscribe?.('plugin-runtime:android:sessions:event', (payload) =>
            listener(payload as import('./contracts').AndroidSessionEvent)
          ) ?? (() => undefined),
      },
      fastboot: {
        list: () => call('plugin-runtime:android:fastboot:list'),
        getVars: (deviceSerial, names) =>
          call('plugin-runtime:android:fastboot:get-vars', deviceSerial, names),
        reboot: (deviceSerial, target) =>
          call('plugin-runtime:android:fastboot:reboot', deviceSerial, target),
      },
    },
    secrets: {
      get: (key) => call('plugin-runtime:secrets:get', key),
      set: (key, value) => call('plugin-runtime:secrets:set', key, value),
      delete: (key) => call('plugin-runtime:secrets:delete', key),
    },
  };
}
