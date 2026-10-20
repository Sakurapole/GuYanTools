import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ModelEnvironmentService,
  validatePackageSpecs,
  parseGpuCsv,
  parseCudaVersion,
  profileIsCompatible,
} from './model_environment_service';
import { FRAMEWORK_METADATA_PROBE, FRAMEWORK_PROBE } from './model_framework_probe';

describe('model environment controls', () => {
  it('rejects shell, paths, URLs and requirements directives', () => {
    expect(validatePackageSpecs(['numpy==1.26.4', 'opencv-python-headless'])).toEqual([
      'numpy==1.26.4',
      'opencv-python-headless',
    ]);
    for (const spec of [
      '--index-url',
      '-r secret.txt',
      '../wheel.whl',
      'https://host/pkg.whl',
      'numpy;shutdown',
      'numpy\nrequests',
    ])
      expect(() => validatePackageSpecs([spec])).toThrow('MODEL_PACKAGE_SPEC_INVALID');
    expect(() => validatePackageSpecs(['pip'], 'remove')).toThrow('MODEL_PACKAGE_PROTECTED');
    expect(() => validatePackageSpecs(['python==3.13'])).toThrow('MODEL_PACKAGE_PROTECTED');
  });
  it('distinguishes driver CUDA capability from toolkit and framework runtime', () => {
    expect(parseGpuCsv('0, NVIDIA GeForce RTX 5070, 617.14, 12227\n')).toEqual([
      { index: 0, name: 'NVIDIA GeForce RTX 5070', driverVersion: '617.14', memoryMiB: 12227 },
    ]);
    expect(parseCudaVersion('Driver Version: 617.14 CUDA Version: 13.3')).toBe('13.3');
    expect(parseCudaVersion('KMD Version: 617.14 CUDA UMD Version: 13.4')).toBe('13.4');
    expect(profileIsCompatible({ device: 'cuda', cudaVersion: '12.8' }, '12.4', true)).toBe(false);
    expect(profileIsCompatible({ device: 'cuda', cudaVersion: '12.8' }, '13.3', true)).toBe(true);
    expect(profileIsCompatible({ device: 'cuda', cudaVersion: '12.8' }, '13.3', false)).toBe(false);
  });
});

describe('environment ownership and package operations', () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
  });
  async function setup(nativeConflict = false) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-env-test-'));
    roots.push(root);
    const external = path.join(root, 'external');
    await fs.mkdir(external);
    const python = path.join(external, process.platform === 'win32' ? 'python.exe' : 'bin/python');
    await fs.mkdir(path.dirname(python), { recursive: true });
    await fs.writeFile(python, 'fixture');
    const jobs = new Map<string, any>();
    const jobService = {
      create: async (pluginId: string, kind: string, input: unknown) => {
        const job = { id: String(jobs.size + 1), pluginId, kind, input, status: 'queued' };
        jobs.set(job.id, job);
        return job;
      },
      update: async (_plugin: string, id: string, patch: unknown) =>
        Object.assign(jobs.get(id), patch),
      get: async (_plugin: string, id: string) => jobs.get(id),
      cancel: async (_plugin: string, id: string) =>
        Object.assign(jobs.get(id), { status: 'cancelled' }),
    };
    const record = {
      manifest: { modelRuntime: { pythonVersion: '3.10' } },
      resolvedEntryPaths: {},
    };
    const service = new ModelEnvironmentService(
      path.join(root, 'runtime'),
      () => record as any,
      () => jobService as any,
      async () => [
        { id: 'base', label: 'External', pythonPath: python, version: '3.10.14', kind: 'system' },
      ],
      async () => external,
      () => false,
      async (command, args) => {
        if (nativeConflict && args.includes(FRAMEWORK_METADATA_PROBE))
          return JSON.stringify({
            python: '3.10.14',
            torch: '2.5.1',
            numpy: '1.26.4',
            cudaAvailable: false,
            kernelTest: false,
            devices: [],
            architectures: [],
          });
        if (nativeConflict && args.includes(FRAMEWORK_PROBE))
          throw new Error('OMP: Error #15: libiomp5md.dll already initialized');
        if (args.includes('-c'))
          return JSON.stringify({
            path: command,
            prefix: path.dirname(command),
            version: '3.10.14',
            virtual: true,
          });
        if (args.includes('list')) return JSON.stringify([{ name: 'numpy', version: '1.26.4' }]);
        if (args.includes('check')) return 'No broken requirements found.';
        return '';
      }
    );
    return { root, service, python };
  }
  it('lists imported packages but forbids package writes into system environments', async () => {
    const { service } = await setup();
    expect(await service.listPackages('guyantools.test', 'base', 'pip')).toEqual([
      { name: 'numpy', version: '1.26.4', source: 'pip' },
    ]);
    await expect(
      service.changePackages('guyantools.test', {
        environmentId: 'base',
        action: 'install',
        manager: 'pip',
        packages: ['numpy'],
      })
    ).rejects.toThrow('MODEL_ENVIRONMENT_READ_ONLY');
    await expect(service.selectEnvironment('guyantools.test', 'base')).rejects.toThrow(
      'MODEL_ENVIRONMENT_READ_ONLY'
    );
  });
  it('returns diagnostic data for an environment whose native OpenMP runtime aborts', async () => {
    const { service } = await setup(true);
    const report = await service.inspectRuntime('guyantools.test', 'base');
    expect(report.framework).toMatchObject({
      torch: '2.5.1',
      numpy: '1.26.4',
      probeStatus: 'failed',
      errorCode: 'OPENMP_RUNTIME_CONFLICT',
      cudaAvailable: false,
      kernelTest: false,
    });
    expect(report.warnings.join(' ')).not.toContain('OMP: Error #15');
  });
  it('does not let unknown IDs or another plugin select an interpreter', async () => {
    const { service } = await setup();
    await expect(service.selectEnvironment('guyantools.test', '../../outside')).rejects.toThrow(
      'MODEL_ENVIRONMENT_NOT_FOUND'
    );
  });
  it('rejects mismatched venv Python versions before creating a job', async () => {
    const { service } = await setup();
    await expect(
      service.createManagedEnvironment('guyantools.test', {
        name: 'wrong',
        manager: 'venv',
        pythonVersion: '3.13',
        baseId: 'base',
      })
    ).rejects.toThrow('MODEL_PYTHON_VERSION_MISMATCH');
  });
  it('keeps an external directory intact when its registration is removed', async () => {
    const { service, root } = await setup();
    const imported = await service.importEnvironment('guyantools.test');
    expect(imported?.managed).toBe(false);
    const job = await service.removeEnvironment('guyantools.test', imported!.id);
    await service.waitForIdle();
    expect(job.status).toBe('completed');
    await expect(fs.stat(path.join(root, 'external'))).resolves.toMatchObject({});
  });
});
