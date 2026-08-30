import { app, crashReporter, ipcMain } from 'electron';
import { appendFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let initialized = false;

function formatReason(reason: unknown) {
  if (reason instanceof Error) {
    return reason.stack || reason.message;
  }

  if (typeof reason === 'string') {
    return reason;
  }

  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function resolveLogPath() {
  try {
    return path.join(app.getPath('userData'), 'logs', 'main-process.log');
  } catch {
    const localDataRoot = process.env.LOCALAPPDATA || os.tmpdir();
    return path.join(localDataRoot, 'GuYanTools', 'logs', 'main-process.log');
  }
}

function record(kind: string, detail: unknown) {
  const line = `[${new Date().toISOString()}] ${kind}: ${formatReason(detail)}\n`;
  console.error(line.trimEnd());

  const logPath = resolveLogPath();
  void mkdir(path.dirname(logPath), { recursive: true })
    .then(() => appendFile(logPath, line, 'utf8'))
    .catch(() => {
      // Diagnostics must never become another unhandled rejection.
    });
}

/** Keep background promise failures observable without allowing Node to terminate the app silently. */
export function initializeProcessDiagnostics() {
  if (initialized) {
    return;
  }

  initialized = true;

  try {
    crashReporter.start({
      submitURL: '',
      uploadToServer: false,
      compress: false,
    });
  } catch (error) {
    record('crash-reporter-init-failed', error);
  }

  process.on('unhandledRejection', (reason) => {
    record('unhandled-rejection', reason);
  });
  process.on('uncaughtExceptionMonitor', (error) => {
    record('uncaught-exception', error);
  });

  app.on('render-process-gone', (_event, webContents, details) => {
    record('render-process-gone', {
      webContentsId: webContents.id,
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
  app.on('child-process-gone', (_event, details) => {
    record('child-process-gone', details);
  });
  app.on('before-quit', () => {
    record('app-before-quit', { reason: 'application requested quit' });
  });
  app.on('will-quit', () => {
    record('app-will-quit', { reason: 'application is quitting' });
  });
  app.on('quit', (_event, exitCode) => {
    record('app-quit', { exitCode });
  });

  ipcMain.on('diagnostics:renderer-timing', (_event, detail: unknown) => {
    if (!detail || typeof detail !== 'object') {
      return;
    }
    const payload = detail as Record<string, unknown>;
    const label = typeof payload.label === 'string' ? payload.label.slice(0, 80) : 'unknown';
    const elapsed = typeof payload.elapsedMs === 'number' ? payload.elapsedMs : undefined;
    record('renderer-timing', { label, elapsedMs: elapsed });
  });
}
