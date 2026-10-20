import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import type { InstalledPluginRecord } from '@/contracts/plugin_host';
import type { JobService } from './job_service';
import {
  ModelRuntimeService,
  assertModelAccess,
  isLegacyBuiltinModelSource,
  resolveModelScript,
  validateModelOptions,
} from './model_runtime_service';

function record(source: InstalledPluginRecord['installSource']['type']): InstalledPluginRecord {
  return {
    manifest: {
      schemaVersion: '1.1',
      id: 'guyantools.image-enhancement',
      name: 'image-enhancement',
      displayName: '图像超分工具',
      version: '0.1.0',
      description: '',
      pluginApiVersion: '1.0.0',
      hostVersionRange: '>=1.1.0',
      trustLevel: 'sandboxed',
      runtime: 'ui',
      entry: { ui: 'index.html' },
      permissions: ['models.execute'],
      capabilities: [],
      contributes: {},
      modelRuntime: {
        pythonVersion: '3.10',
        entry: 'python/runner.py',
        dependencies: { common: [], cpu: ['torch==2.5.1'], cuda: ['torch==2.5.1'] },
      },
    },
    enabled: true,
    status: 'enabled',
    installSource: { type: source },
    resolvedEntryPaths: { ui: path.join('plugin', 'index.html') },
    approvedPermissions: ['models.execute'],
    installedAt: '',
    updatedAt: '',
  };
}

describe('model runtime boundary', () => {
  it('accepts only an enabled built-in plugin with approved model permission', () => {
    expect(() => assertModelAccess(record('builtin'))).not.toThrow();
    expect(() => assertModelAccess(record('local'))).toThrow('MODEL_PLUGIN_NOT_TRUSTED');
    expect(() => assertModelAccess({ ...record('builtin'), approvedPermissions: [] })).toThrow(
      'MODEL_PERMISSION_DENIED'
    );
  });

  it('recognizes only a legacy record pointing at the bundled model root', () => {
    const bundledRoot = path.resolve('resources/model-plugins/image-enhancement');
    const legacy = record('local');
    legacy.installSource.value = bundledRoot;
    expect(isLegacyBuiltinModelSource(legacy, bundledRoot)).toBe(true);
    expect(
      isLegacyBuiltinModelSource(
        { ...legacy, installSource: { type: 'local', value: path.resolve('user-plugin') } },
        bundledRoot
      )
    ).toBe(false);
    expect(isLegacyBuiltinModelSource(record('builtin'), bundledRoot)).toBe(false);
  });

  it('keeps the executable script inside the installed plugin root', () => {
    const root = path.resolve('plugin');
    expect(resolveModelScript(root, 'python/runner.py')).toBe(
      path.join(root, 'python', 'runner.py')
    );
    expect(() => resolveModelScript(root, '../other.py')).toThrow('MODEL_SCRIPT_INVALID');
  });

  it('accepts only JSON-safe bounded options', () => {
    expect(validateModelOptions({ scale: 2, tile: 1, half: false })).toEqual({
      scale: 2,
      tile: 1,
      half: false,
    });
    expect(() => validateModelOptions({ path: '../outside' })).toThrow('MODEL_OPTION_INVALID');
    expect(() => validateModelOptions({ values: new Array(5000).fill(1) })).toThrow(
      'MODEL_OPTION_INVALID'
    );
  });

  it('returns opaque file handles and rejects another plugin owner', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-model-file-'));
    const input = path.join(temp, 'input.png');
    await fs.writeFile(input, 'image');
    const first = record('builtin');
    const second = {
      ...record('builtin'),
      manifest: { ...first.manifest, id: 'guyantools.other' },
    };
    const service = new ModelRuntimeService(
      temp,
      (id) => (id === first.manifest.id ? first : second),
      () => {
        throw new Error('unused');
      },
      async () => input
    );
    const handle = await service.pickFile(first.manifest.id, 'input');
    expect(handle).toMatchObject({ name: 'input.png', kind: 'input' });
    expect(handle).not.toHaveProperty('path');
    await expect(
      service.startInference(second.manifest.id, {
        inputId: handle!.id,
        weightsId: 'unknown',
        outputId: 'unknown',
        options: {},
      })
    ).rejects.toThrow('MODEL_FILE_HANDLE_INVALID');
  });

  it('cancels a dependency job before its subprocess starts', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-model-cancel-'));
    const executable = path.join(
      temp,
      'environments',
      'guyantools.image-enhancement',
      process.platform === 'win32' ? 'python.exe' : path.join('bin', 'python')
    );
    await fs.mkdir(path.dirname(executable), { recursive: true });
    await fs.writeFile(executable, 'not an executable');
    const job = { id: 'queued-job', pluginId: 'guyantools.image-enhancement', status: 'queued' };
    let releaseUpdate: (() => void) | undefined;
    const updateStarted = new Promise<void>((resolve) => {
      releaseUpdate = resolve;
    });
    let finishUpdate: (() => void) | undefined;
    const updateGate = new Promise<void>((resolve) => {
      finishUpdate = resolve;
    });
    const jobs = {
      create: async () => job,
      get: async () => job,
      update: async (_pluginId: string, _jobId: string, patch: Record<string, unknown>) => {
        if (patch.status === 'running') {
          releaseUpdate?.();
          await updateGate;
        }
        Object.assign(job, patch);
        return job;
      },
      cancel: async () => {
        job.status = 'cancelled';
        return job;
      },
    } as unknown as JobService;
    const service = new ModelRuntimeService(
      temp,
      () => record('builtin'),
      () => jobs,
      async () => null
    );
    try {
      await service.installDependencies('guyantools.image-enhancement', 'cpu');
      await updateStarted;
      await expect(service.cancel('guyantools.image-enhancement', job.id)).resolves.toMatchObject({
        status: 'cancelled',
      });
      finishUpdate?.();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(job.status).toBe('cancelled');
    } finally {
      finishUpdate?.();
      await fs.rm(temp, { recursive: true, force: true });
    }
  });

  it('terminates the running subprocess when its job is cancelled', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-model-process-'));
    const marker = path.join(temp, 'started');
    const job = { id: 'running-job', pluginId: 'guyantools.image-enhancement', status: 'running' };
    const jobs = {
      get: async () => job,
      cancel: async () => {
        job.status = 'cancelled';
        return job;
      },
    } as unknown as JobService;
    const service = new ModelRuntimeService(
      temp,
      () => record('builtin'),
      () => jobs,
      async () => null
    );
    const processService = service as unknown as {
      runTracked: (
        pluginId: string,
        jobId: string,
        command: string,
        args: string[]
      ) => Promise<void>;
    };
    const script = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started'); setInterval(() => {}, 1000)`;
    const running = processService.runTracked(job.pluginId, job.id, process.execPath, [
      '-e',
      script,
    ]);
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (
          await fs.stat(marker).then(
            () => true,
            () => false
          )
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await expect(fs.stat(marker)).resolves.toMatchObject({});
      await expect(service.cancel(job.pluginId, job.id)).resolves.toMatchObject({
        status: 'cancelled',
      });
      await expect(running).rejects.toThrow();
      expect(job.status).toBe('cancelled');
    } finally {
      await service.disposePlugin(job.pluginId);
      await running.catch((): void => undefined);
      await fs.rm(temp, { recursive: true, force: true });
    }
  });
});
