const SENSITIVE_KEY = /(token|secret|password|cookie|authorization|credential|sessdata)/i;

export function validatePluginCommand(pluginId: string, commandId: string) {
  if (!commandId.startsWith(`${pluginId}.`) || commandId.length > 200) throw new Error('PLUGIN_COMMAND_DENIED');
  return commandId;
}

export function redactPluginLogMeta(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => redactPluginLogMeta(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactPluginLogMeta(entry)]));
}
