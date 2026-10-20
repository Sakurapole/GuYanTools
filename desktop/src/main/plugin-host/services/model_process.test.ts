import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelProcessEnv, runModelCommand, redactModelOutput } from './model_process';

describe('model process environment', () => {
  it('redacts index credentials and terminal escape sequences in job output', () => {
    const text = redactModelOutput('\x1b[1Ahttps://user:password@host.test/simple?token=secret\b');
    expect(text).not.toContain('password');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('\x1b');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('keeps Windows vendor lookup paths while excluding Python/PIP injection', () => {
    vi.stubEnv('ProgramFiles', 'C:/Program Files');
    vi.stubEnv('ProgramW6432', 'C:/Program Files');
    vi.stubEnv('PYTHONPATH', 'untrusted-python');
    vi.stubEnv('PIP_INDEX_URL', 'https://user:secret@example.test');
    const env = modelProcessEnv();
    expect(env.ProgramFiles).toBe('C:/Program Files');
    expect(env.ProgramW6432).toBe('C:/Program Files');
    expect(env.PYTHONPATH).toBeUndefined();
    expect(env.PIP_INDEX_URL).toBeUndefined();
  });
  it('rejects a cancelled task before starting a subprocess', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      runModelCommand(process.execPath, ['-e', 'process.exit(0)'], { signal: abort.signal })
    ).rejects.toThrow('MODEL_JOB_CANCELLED');
  });
  it('passes structured inference input through stdin without a shell', async () => {
    const output = await runModelCommand(
      process.execPath,
      [
        '-e',
        'let data="";process.stdin.on("data",x=>data+=x);process.stdin.on("end",()=>console.log(JSON.parse(data).scale))',
      ],
      { input: JSON.stringify({ scale: 2 }) }
    );
    expect(output.trim()).toBe('2');
  });
  it('terminates a running long-lived subprocess on cancellation', async () => {
    const abort = new AbortController();
    const running = runModelCommand(
      process.execPath,
      ['-e', 'console.log("ready");setInterval(()=>{},1000)'],
      { signal: abort.signal, onOutput: () => abort.abort() }
    );
    await expect(running).rejects.toThrow('MODEL_JOB_CANCELLED');
  });
});
