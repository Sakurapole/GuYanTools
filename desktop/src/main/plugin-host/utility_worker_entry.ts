import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createPluginApi } from '@guyantools/plugin-sdk';

type RuntimePort = {
  on: (event: 'message', listener: (event: { data?: unknown; ports?: RuntimePort[] }) => void) => void;
  start?: () => void;
  postMessage: (message: unknown) => void;
};

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

const parentPort = (process as unknown as { parentPort?: RuntimePort }).parentPort;
if (!parentPort) throw new Error('插件 utility process 缺少 parentPort');

const pending = new Map<string, PendingCall>();
const listeners = new Map<string, Set<(payload: unknown) => void>>();

function subscribe(channel: string, listener: (payload: unknown) => void) {
  const channelListeners = listeners.get(channel) ?? new Set();
  channelListeners.add(listener);
  listeners.set(channel, channelListeners);
  return () => channelListeners.delete(listener);
}

function emit(channel: string, payload: unknown) {
  for (const listener of listeners.get(channel) ?? []) listener(payload);
}

function unwrapMessage(event: { data?: unknown }) {
  return 'data' in event ? event.data : event;
}

async function start(port: RuntimePort) {
  const invoke = (channel: string, ...args: unknown[]) => {
    if (channel === 'plugin-runtime:commands:respond') {
      port.postMessage({
        type: 'command:result',
        requestId: args[0],
        ...(args[1] as Record<string, unknown>),
      });
      return Promise.resolve(undefined);
    }
    const id = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      port.postMessage({ id, channel, args });
    });
  };

  port.on('message', (event) => {
    const message = unwrapMessage(event) as {
      id?: string;
      ok?: boolean;
      result?: unknown;
      error?: unknown;
      type?: string;
      channel?: string;
      payload?: unknown;
    } | null;
    if (!message) return;
    if (message.id) {
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      if (message.ok) call.resolve(message.result);
      else call.reject(message.error);
      return;
    }
    if (message.type === 'command:invoke') {
      emit('plugin-runtime:command:invoke', message);
      return;
    }
    if (message.type === 'event' && message.channel) emit(message.channel, message.payload);
  });
  port.start?.();

  const api = createPluginApi(invoke, subscribe);
  const globalScope = globalThis as typeof globalThis & { pluginAPI?: typeof api; window?: typeof globalThis };
  globalScope.pluginAPI = api;
  globalScope.window = globalThis as typeof globalScope.window;

  const entryPath = process.argv[2];
  if (!entryPath) throw new Error('插件 utility process 缺少 worker entry');
  await import(pathToFileURL(path.resolve(entryPath)).href);
}

parentPort.on('message', (event) => {
  const data = unwrapMessage(event);
  const port = event.ports?.[0];
  if (data !== 'guyantools:port' || !port) return;
  void start(port).catch((error) => {
    console.error('[plugin-worker]', error);
    process.exitCode = 1;
  });
});
