import http from 'node:http';
import net from 'node:net';
import type { PluginDevSession } from '@guyantools/plugin-sdk';

export interface PluginDevChannelEndpoint { address: string; token: string; }

export async function attachToDevChannel(endpoint: PluginDevChannelEndpoint, session: PluginDevSession): Promise<void> {
  const payload = JSON.stringify({ token: endpoint.token, session });
  if (endpoint.address.startsWith('http://127.0.0.1:')) return postHttp(endpoint.address, payload);
  return postPipe(endpoint.address, payload);
}

function postHttp(address: string, body: string) {
  return new Promise<void>((resolve, reject) => {
    const url = new URL('/sessions', address);
    const request = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, response => {
      response.resume(); response.statusCode === 204 ? resolve() : reject(new Error(`PLUGIN_DEV_CHANNEL_REJECTED: ${response.statusCode}`));
    });
    request.once('error', reject); request.end(body);
  });
}

function postPipe(pipePath: string, body: string) {
  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection(pipePath);
    let response = '';
    socket.once('error', reject);
    socket.on('data', chunk => { response += chunk.toString(); });
    socket.once('close', () => response.trim() === 'ok' ? resolve() : reject(new Error(`PLUGIN_DEV_CHANNEL_REJECTED: ${response}`)));
    socket.once('connect', () => socket.end(`${body}\n`));
  });
}
