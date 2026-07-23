import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import type { PluginDevSession } from '@/contracts/plugin_host';
import { validateDevSession } from './dev_session';

export interface PluginDevChannel {
  start(): Promise<{ address: string; token: string }>;
  accept(input: { token: string; session: PluginDevSession }): Promise<PluginDevSession>;
  stop(): Promise<void>;
}

export class LocalPluginDevChannel implements PluginDevChannel {
  private server: net.Server | http.Server | null = null;
  private token = crypto.randomBytes(32).toString('base64url');
  private address = '';

  async start() {
    if (this.server) return { address: this.address, token: this.token };
    if (process.platform === 'win32') {
      try { return await this.startNamedPipe(); } catch { /* loopback fallback below */ }
    }
    return this.startHttpFallback();
  }

  async accept(input: { token: string; session: PluginDevSession }) {
    validateDevSession(input.session);
    const expected = Buffer.from(this.token);
    const received = Buffer.from(input.token);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) throw new Error('PLUGIN_DEV_SESSION_UNAUTHORIZED');
    return { ...input.session };
  }

  async stop() {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  private startNamedPipe() {
    const pipePath = `\\\\.\\pipe\\guyantools-plugin-${crypto.randomBytes(8).toString('hex')}`;
    return new Promise<{ address: string; token: string }>((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(pipePath, () => {
        server.removeListener('error', reject);
        this.server = server;
        this.address = pipePath;
        resolve({ address: pipePath, token: this.token });
      });
    });
  }

  private startHttpFallback() {
    return new Promise<{ address: string; token: string }>((resolve, reject) => {
      const server = http.createServer((_request, response) => { response.writeHead(204); response.end(); });
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        const address = server.address();
        if (!address || typeof address === 'string') return reject(new Error('PLUGIN_DEV_CHANNEL_START_FAILED'));
        this.server = server;
        this.address = `http://127.0.0.1:${address.port}`;
        resolve({ address: this.address, token: this.token });
      });
    });
  }
}
