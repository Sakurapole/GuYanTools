(async () => {
  const probe = {
    processType: typeof globalThis.process,
    requireType: typeof globalThis.require,
    moduleType: typeof globalThis.module,
    electronType: typeof globalThis.electron,
    apiType: typeof globalThis.pluginAPI,
    networkAttempted: false,
  };
  globalThis.__pluginSandboxProbe = probe;
  try {
    probe.context = await globalThis.pluginAPI.getContext();
    probe.networkAttempted = true;
    try {
      await fetch('https://example.invalid/plugin-sandbox-smoke');
      probe.networkResult = 'allowed';
    } catch {
      probe.networkResult = 'blocked';
    }
    await globalThis.pluginAPI.lifecycle.ready();
    probe.ready = true;
  } catch (error) {
    probe.error = String(error);
  }
})();
