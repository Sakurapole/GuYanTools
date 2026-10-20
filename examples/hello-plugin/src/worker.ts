await window.pluginAPI.commands.register('guyantools.hello-plugin.greet', (payload) => {
  const count = Number((payload as { count?: number } | undefined)?.count ?? 1);
  return { message: `你好！这是来自沙箱 Worker 的第 ${count} 次问候。` };
});
