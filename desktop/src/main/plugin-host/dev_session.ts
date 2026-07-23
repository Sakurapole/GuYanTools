import path from 'node:path';
import type { PluginDevSession } from '@/contracts/plugin_host';

export function validateDevSession(input: unknown): asserts input is PluginDevSession {
  if (!input || typeof input !== 'object') throw new Error('PLUGIN_DEV_SESSION_INVALID: session must be an object');
  const session = input as Partial<PluginDevSession>;
  if (typeof session.pluginId !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(session.pluginId)) throw new Error('PLUGIN_DEV_SESSION_INVALID: pluginId is invalid');
  if (typeof session.rootPath !== 'string' || !path.isAbsolute(session.rootPath)) throw new Error('PLUGIN_DEV_SESSION_INVALID: rootPath must be absolute');
  if (session.host !== '127.0.0.1') throw new Error('PLUGIN_DEV_SESSION_INVALID: host must be loopback');
  if (typeof session.port !== 'number' || !Number.isInteger(session.port) || session.port < 1 || session.port > 65535) throw new Error('PLUGIN_DEV_SESSION_INVALID: port is invalid');
  if (typeof session.sessionToken !== 'string' || session.sessionToken.length < 32 || !/^[A-Za-z0-9_-]+$/.test(session.sessionToken)) throw new Error('PLUGIN_DEV_SESSION_INVALID: token is invalid');
  if (typeof session.uiUrl !== 'string' || !isLoopbackUrl(session.uiUrl, session.port)) throw new Error('PLUGIN_DEV_SESSION_INVALID: uiUrl must be loopback');
  if (session.workerUrl !== undefined && (typeof session.workerUrl !== 'string' || !isLoopbackUrl(session.workerUrl, session.port))) throw new Error('PLUGIN_DEV_SESSION_INVALID: workerUrl must be loopback');
  if (typeof session.startedAt !== 'string' || Number.isNaN(Date.parse(session.startedAt))) throw new Error('PLUGIN_DEV_SESSION_INVALID: startedAt is invalid');
}

function isLoopbackUrl(value: string, port: number) {
  try { const url = new URL(value); return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === String(port); } catch { return false; }
}

export class PluginDevSessionManager {
  private readonly sessions = new Map<string, PluginDevSession>();

  connect(session: PluginDevSession) {
    validateDevSession(session);
    this.sessions.delete(session.pluginId);
    this.sessions.set(session.pluginId, { ...session });
    return { ...session };
  }
  get(pluginId: string) { const session = this.sessions.get(pluginId); return session ? { ...session } : null; }
  list() { return [...this.sessions.values()].map(session => ({ ...session })); }
  disconnect(pluginId: string) { this.sessions.delete(pluginId); }
  disconnectAll() { this.sessions.clear(); }
}
