import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export interface ModelCommandOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onOutput?: (text: string) => void;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  input?: string;
  onStart?: (child: ChildProcessWithoutNullStreams) => void;
}
export type ModelCommandExecutor = (
  command: string,
  args: string[],
  options?: ModelCommandOptions
) => Promise<string>;

export function redactModelOutput(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- CLI progress output intentionally contains ANSI controls.
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      .replaceAll('\b', '')
      .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
      .replace(/([?&](?:token|api_key|access_token)=)[^&\s]+/gi, '$1[redacted]')
  );
}

export function modelProcessEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    PIP_CONFIG_FILE: process.platform === 'win32' ? 'NUL' : '/dev/null',
  };
  for (const key of [
    'PATH',
    'Path',
    'SYSTEMROOT',
    'WINDIR',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'TMP',
    'TEMP',
    'LANG',
    'ProgramFiles',
    'ProgramW6432',
    'ProgramFiles(x86)',
  ])
    if (process.env[key]) env[key] = process.env[key];
  return { ...env, ...extra };
}

export const runModelCommand: ModelCommandExecutor = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('MODEL_JOB_CANCELLED'));
      return;
    }
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: modelProcessEnv(options.env),
      cwd: options.cwd,
    });
    options.onStart?.(child);
    child.stdin.end(options.input ?? '');
    let stdout = '',
      stderr = '',
      stopped = false;
    const stop = () => {
      stopped = true;
      if (!child.pid) return;
      if (process.platform === 'win32') {
        // Only a PID issued by this executor is accepted. Kill the installer tree.
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          shell: false,
          windowsHide: true,
        });
        killer.on('error', () => child.kill());
        killer.on('close', () => child.kill());
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    };
    const timer = setTimeout(stop, options.timeoutMs ?? 30_000);
    options.signal?.addEventListener('abort', stop, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', stop);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-2_000_000);
      options.onOutput?.(redactModelOutput(chunk.toString()));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-16_000);
      options.onOutput?.(redactModelOutput(chunk.toString()));
    });
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code) => {
      cleanup();
      if (stopped)
        reject(
          new Error(options.signal?.aborted ? 'MODEL_JOB_CANCELLED' : 'MODEL_PROCESS_TIMEOUT')
        );
      else if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            redactModelOutput((stderr || stdout || `MODEL_PROCESS_EXIT_${code}`).slice(-4000))
          )
        );
    });
  });
