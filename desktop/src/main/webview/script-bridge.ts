import { ipcMain, net } from 'electron';

let registered = false;

/**
 * GM API Bridge: 为 webview 内的用户脚本提供跨域网络请求和数据存储能力
 *
 * 机制：
 * - 用户脚本通过 window.postMessage 发送请求
 * - webview 的 preload 脚本（通过 webview.executeJavaScript 注入）监听并转发到 main process
 * - main process 通过 node:net 执行实际请求，返回结果
 */
export function registerWebScriptBridge() {
  if (registered) return;

  // GM_xmlhttpRequest 代理：绕过 CORS 限制
  ipcMain.handle('web-script:gm-xhr', async (_event, requestData: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    data?: string;
    responseType?: string;
  }) => {
    try {
      const { url, method = 'GET', headers = {}, data } = requestData;

      const request = net.request({
        url,
        method: method as any,
      });

      // 设置自定义 headers
      for (const [key, value] of Object.entries(headers)) {
        request.setHeader(key, value);
      }

      return await new Promise<{
        status: number;
        statusText: string;
        responseHeaders: Record<string, string>;
        responseText: string;
      }>((resolve, reject) => {
        const chunks: Buffer[] = [];

        request.on('response', (response) => {
          response.on('data', (chunk) => {
            chunks.push(chunk);
          });

          response.on('end', () => {
            const body = Buffer.concat(chunks);
            const responseHeaders: Record<string, string> = {};
            for (const key of Object.keys(response.headers)) {
              const val = response.headers[key];
              responseHeaders[key] = Array.isArray(val) ? val.join(', ') : (val ?? '');
            }

            resolve({
              status: response.statusCode,
              statusText: response.statusMessage || '',
              responseHeaders,
              responseText: body.toString('utf-8'),
            });
          });

          response.on('error', (err) => {
            reject(err);
          });
        });

        request.on('error', (err) => {
          reject(err);
        });

        if (data) {
          request.write(data);
        }

        request.end();
      });
    } catch (err: any) {
      return { error: err.message || 'Unknown error' };
    }
  });

  // GM_setValue / GM_getValue：基于 session 的简单键值存储
  const scriptStorage = new Map<string, string>();

  ipcMain.handle('web-script:gm-set-value', async (_event, key: string, value: string) => {
    scriptStorage.set(key, value);
    return true;
  });

  ipcMain.handle('web-script:gm-get-value', async (_event, key: string, defaultValue?: string) => {
    return scriptStorage.get(key) ?? defaultValue ?? null;
  });

  ipcMain.handle('web-script:gm-delete-value', async (_event, key: string) => {
    scriptStorage.delete(key);
    return true;
  });

  registered = true;
  console.log('[WebScript] GM API Bridge registered');
}

/**
 * 生成注入到 webview 内的 GM API polyfill 代码
 * 此代码在 webview 的页面上下文中运行，通过 IPC 与 main process 通讯
 */
export function generateGMPolyfill(permissions: string[]): string {
  const parts: string[] = [];

  parts.push(`
(function() {
  'use strict';
  // GM API Polyfill – injected by GuYanTools
  const __gm_ipc = window.__gm_ipc_bridge;
`);

  if (permissions.includes('network')) {
    parts.push(`
  window.GM_xmlhttpRequest = function(details) {
    const { url, method, headers, data, onload, onerror, responseType } = details;
    if (__gm_ipc) {
      __gm_ipc.invoke('web-script:gm-xhr', { url, method, headers, data, responseType })
        .then(result => {
          if (result.error) {
            onerror?.({ error: result.error });
          } else {
            onload?.({
              status: result.status,
              statusText: result.statusText,
              responseHeaders: Object.entries(result.responseHeaders || {}).map(([k,v]) => k + ': ' + v).join('\\r\\n'),
              responseText: result.responseText,
              response: result.responseText,
            });
          }
        })
        .catch(err => onerror?.({ error: String(err) }));
    } else {
      // Fallback to fetch (same origin restrictions apply)
      fetch(url, { method: method || 'GET', headers, body: data })
        .then(async res => {
          const text = await res.text();
          onload?.({ status: res.status, statusText: res.statusText, responseText: text, response: text, responseHeaders: '' });
        })
        .catch(err => onerror?.({ error: String(err) }));
    }
  };
`);
  }

  if (permissions.includes('storage')) {
    parts.push(`
  window.GM_setValue = function(key, value) {
    try { localStorage.setItem('__gm_' + key, JSON.stringify(value)); } catch {}
  };
  window.GM_getValue = function(key, defaultValue) {
    try {
      const v = localStorage.getItem('__gm_' + key);
      return v !== null ? JSON.parse(v) : defaultValue;
    } catch { return defaultValue; }
  };
  window.GM_deleteValue = function(key) {
    try { localStorage.removeItem('__gm_' + key); } catch {}
  };
`);
  }

  if (permissions.includes('clipboard')) {
    parts.push(`
  window.GM_setClipboard = function(text) {
    navigator.clipboard.writeText(text).catch(() => {});
  };
`);
  }

  parts.push(`
})();
`);

  return parts.join('');
}
