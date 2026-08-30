import { dbManager } from '@/core/database';
import { syncService } from './sync_service';

type WorkerMessage = { id: number; method: string; args?: unknown[] };
type WorkerPort = {
  on: (event: string, listener: (message: { data?: WorkerMessage } | WorkerMessage) => void) => void;
  postMessage: (message: unknown) => void;
};

const port = (process as unknown as { parentPort?: WorkerPort }).parentPort;
if (!port) {
  throw new Error('同步 utility process 缺少 parentPort');
}

async function initialize() {
  const dbPath = process.env.GUYANTOOLS_DB_PATH;
  await dbManager.initialize(dbPath);
  await syncService.initialize();
  syncService.subscribe((event) => port.postMessage({ event }));
}

const ready = initialize();
port.on('message', async (rawMessage) => {
  const message = ('data' in rawMessage ? rawMessage.data : rawMessage) as WorkerMessage;
  if (!message) return;
  try {
    await ready;
    const method = (syncService as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[message.method];
    if (typeof method !== 'function') throw new Error(`未知同步操作: ${message.method}`);
    const result = await method.apply(syncService, message.args ?? []);
    port.postMessage({ id: message.id, result });
  } catch (error) {
    port.postMessage({
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
