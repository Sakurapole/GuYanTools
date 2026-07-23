export type PluginDevSessionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export function transitionPluginDevSession(current: PluginDevSessionStatus, event: 'connect' | 'connected' | 'retry' | 'disconnect'): PluginDevSessionStatus {
  if (event === 'disconnect') return 'disconnected';
  if (event === 'connect' && current === 'disconnected') return 'connecting';
  if (event === 'connected') return 'connected';
  if (event === 'retry' && (current === 'connecting' || current === 'connected' || current === 'reconnecting')) return 'reconnecting';
  return current;
}
