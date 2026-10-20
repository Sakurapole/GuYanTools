import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ModelRuntimeApi,
  ModelEnvironmentSnapshot,
} from '../../../../../../src/contracts/plugin_model';
import {
  useRuntimeEnvironment,
  type RuntimeEnvironmentEmit,
  type RuntimeEnvironmentProps,
} from './useRuntimeEnvironment';
import { MANAGER_PREFERENCE_KEY } from './environment-manager';

const lifecycle = vi.hoisted(() => ({ mounts: [] as Array<() => unknown> }));
vi.mock('vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue')>()),
  onMounted: (callback: () => unknown) => lifecycle.mounts.push(callback),
  onBeforeUnmount: () => {},
}));
beforeEach(() => {
  lifecycle.mounts.length = 0;
});

function setup(saved?: string) {
  const snapshot: ModelEnvironmentSnapshot = {
    activeId: 'c',
    errors: [],
    tools: [
      { kind: 'conda', path: 'conda.exe', version: '25' },
      { kind: 'uv', path: 'uv.exe', version: '0.8' },
    ],
    environments: [
      { id: 'base', label: 'Python', pythonPath: 'python.exe', version: '3.10.14', kind: 'system' },
      {
        id: 'c',
        label: 'Conda',
        pythonPath: 'c/python.exe',
        version: '3.10.14',
        kind: 'conda',
        manager: 'conda',
        managed: true,
        active: true,
        condaPath: 'conda.exe',
      },
      {
        id: 'v',
        label: 'venv',
        pythonPath: 'v/python.exe',
        version: '3.10.14',
        kind: 'venv',
        manager: 'venv',
        managed: true,
      },
      {
        id: 'u',
        label: 'uv',
        pythonPath: 'u/python.exe',
        version: '3.10.14',
        kind: 'uv',
        manager: 'uv',
        managed: true,
      },
      {
        id: 'external',
        label: 'external',
        pythonPath: 'ext/python.exe',
        version: '3.10.14',
        kind: 'venv',
        manager: 'venv',
        managed: false,
      },
    ],
  };
  const models = {
    getEnvironmentSnapshot: vi.fn().mockResolvedValue(snapshot),
    getDependencyProfiles: vi.fn().mockResolvedValue([]),
    listPackages: vi
      .fn()
      .mockImplementation(async (id, manager) => [{ name: `${id}-${manager}`, version: '1' }]),
    inspectRuntime: vi.fn().mockResolvedValue({ gpus: [], warnings: [] }),
    selectEnvironment: vi.fn(),
    createManagedEnvironment: vi
      .fn()
      .mockResolvedValue({ id: 'new', kind: 'model-environment-create', status: 'completed' }),
    changePackages: vi
      .fn()
      .mockResolvedValue({ id: 'packages', kind: 'model-packages', status: 'completed' }),
  };
  const storage = {
    get: vi.fn().mockResolvedValue(saved),
    set: vi.fn().mockResolvedValue(undefined),
  };
  const props: RuntimeEnvironmentProps = {
    models: models as unknown as ModelRuntimeApi,
    jobRunning: false,
    storage,
  };
  const state = useRuntimeEnvironment(props, vi.fn() as RuntimeEnvironmentEmit);
  return { state, models, storage, props, snapshot };
}

describe('runtime manager workflow', () => {
  it('uses the active environment type on first entry and loads only that package tool', async () => {
    const { state, models } = setup();
    await lifecycle.mounts[0]();
    expect(state.environmentManager.value).toBe('conda');
    expect(state.envOptions.value.map((item) => item.value)).toEqual(['c']);
    expect(models.listPackages).toHaveBeenLastCalledWith('c', 'conda');
  });
  it('switches type, clears stale inputs, remembers views and preserves the inference environment', async () => {
    const { state, models, storage } = setup();
    await lifecycle.mounts[0]();
    state.packageSpecs.value = 'numpy==1';
    await state.switchManager('uv');
    expect(state.packageSpecs.value).toBe('');
    expect(state.envOptions.value.map((item) => item.value)).toEqual(['u']);
    expect(state.packages.value[0].name).toBe('u-uv');
    expect(models.selectEnvironment).not.toHaveBeenCalled();
    expect(storage.set).toHaveBeenLastCalledWith(MANAGER_PREFERENCE_KEY, 'uv');
    await state.switchManager('venv');
    await state.viewEnvironment('external');
    expect(state.writable.value).toBe(false);
    await state.switchManager('uv');
    await state.switchManager('venv');
    expect(state.environmentId.value).toBe('external');
    await state.viewEnvironment('c');
    expect(state.environmentId.value).toBe('external');
  });
  it('restores the chosen manager and routes package writes to its selected environment', async () => {
    const { state, models } = setup('uv');
    await lifecycle.mounts[0]();
    expect(state.environmentManager.value).toBe('uv');
    expect(state.activeEnvironment.value?.id).toBe('c');
    state.packageSpecs.value = 'packaging==25.0';
    await state.changePackages('install');
    expect(models.changePackages).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: 'u', manager: 'uv', packages: ['packaging==25.0'] })
    );
    await state.createEnvironment();
    expect(models.createManagedEnvironment).toHaveBeenCalledWith(
      expect.objectContaining({ manager: 'uv', baseId: undefined })
    );
  });
  it('prevents switching during a job and refuses unavailable cross-manager package tools', async () => {
    const { state, props, models } = setup('venv');
    await lifecycle.mounts[0]();
    props.jobRunning = true;
    await state.switchManager('uv');
    expect(state.environmentManager.value).toBe('venv');
    props.jobRunning = false;
    const count = models.listPackages.mock.calls.length;
    await state.changePackageManager('uv');
    expect(models.listPackages).toHaveBeenCalledTimes(count);
    expect(state.packageManager.value).toBe('pip');
  });
});
