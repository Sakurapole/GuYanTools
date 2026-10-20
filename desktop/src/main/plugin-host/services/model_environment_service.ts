import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { InstalledPluginRecord } from '@/contracts/plugin_host';
import type {
  ModelDependencyProfile,
  ModelEnvironmentCreateInput,
  ModelEnvironmentSnapshot,
  ModelPackageChangeInput,
  ModelPackageManager,
  ModelPackageRecord,
  ModelPythonEnvironment,
  ModelRuntimeDiagnostics,
} from '@/contracts/plugin_model';
import type { JobRecord } from '@/contracts/plugin_media';
import type { JobService } from './job_service';
import { runModelCommand, redactModelOutput, type ModelCommandExecutor } from './model_process';
import { inspectModelFramework } from './model_framework_probe';

type EnvironmentState = { environments: ModelPythonEnvironment[]; activeId?: string };
const idFor = (file: string) =>
  crypto.createHash('sha256').update(path.resolve(file)).digest('hex').slice(0, 16);
const executableFor = (prefix: string) =>
  path.join(prefix, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const condaPython = (prefix: string) =>
  path.join(prefix, process.platform === 'win32' ? 'python.exe' : 'bin/python');
const exists = (file: string) =>
  fs.stat(file).then(
    () => true,
    () => false
  );
const within = (root: string, target: string) => {
  const rel = path.relative(root, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};

export function validatePackageSpecs(value: unknown, action = 'install'): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 80)
    throw new Error('MODEL_PACKAGE_SPEC_INVALID');
  return value.map((spec) => {
    if (
      typeof spec !== 'string' ||
      spec.length > 160 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*(?:==[a-zA-Z0-9_.+*-]+)?$/.test(spec)
    )
      throw new Error('MODEL_PACKAGE_SPEC_INVALID');
    const name = spec.split('==')[0].toLowerCase().replaceAll('_', '-');
    if (name === 'python' || (action === 'remove' && ['pip', 'setuptools', 'uv'].includes(name)))
      throw new Error('MODEL_PACKAGE_PROTECTED');
    return spec;
  });
}
export function parseGpuCsv(text: string): ModelRuntimeDiagnostics['gpus'] {
  return text
    .trim()
    .split(/\r?\n/)
    .flatMap((line) => {
      const parts = line.split(',').map((part) => part.trim());
      if (parts.length < 4 || !/^\d+$/.test(parts[0])) return [];
      return [
        {
          index: Number(parts[0]),
          name: parts[1],
          driverVersion: parts[2],
          memoryMiB: Number(parts[3]) || 0,
        },
      ];
    });
}
export function parseCudaVersion(text: string): string | undefined {
  return /CUDA(?:\s+UMD)?\s+Version:\s*([\d.]+)/i.exec(text)?.[1];
}
export function profileIsCompatible(
  profile: Pick<ModelDependencyProfile, 'device' | 'cudaVersion'>,
  driverMax: string | undefined,
  hasGpu: boolean
): boolean {
  if (profile.device === 'cpu') return true;
  if (!hasGpu || !driverMax || !profile.cudaVersion) return false;
  const [major, minor] = profile.cudaVersion.split('.').map(Number),
    [maxMajor, maxMinor] = driverMax.split('.').map(Number);
  return maxMajor > major || (maxMajor === major && maxMinor >= minor);
}

export class ModelEnvironmentService {
  private readonly snapshots = new Map<string, ModelEnvironmentSnapshot>();
  private readonly discovering = new Map<string, Promise<ModelEnvironmentSnapshot>>();
  private readonly busy = new Set<string>();
  private readonly operations = new Map<string, { pluginId: string; abort: AbortController }>();
  private readonly tasks = new Set<Promise<void>>();

  constructor(
    private readonly root: string,
    private readonly authorize: (pluginId: string) => InstalledPluginRecord,
    private readonly jobs: () => JobService,
    private readonly discoverBase: (pluginId: string) => Promise<ModelPythonEnvironment[]>,
    private readonly pickDirectory: () => Promise<string | null> = async () => null,
    private readonly externalBusy: (pluginId: string) => boolean = () => false,
    private readonly run: ModelCommandExecutor = runModelCommand
  ) {}

  private directory(pluginId: string) {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(pluginId)) throw new Error('MODEL_PLUGIN_ID_INVALID');
    return path.join(this.root, 'environment-profiles', pluginId);
  }
  private async readState(pluginId: string): Promise<EnvironmentState> {
    const state = await fs
      .readFile(path.join(this.directory(pluginId), 'environments.json'), 'utf8')
      .then(
        (text) => JSON.parse(text) as EnvironmentState,
        (): EnvironmentState => ({ environments: [] })
      );
    if (!Array.isArray(state.environments)) throw new Error('MODEL_ENVIRONMENT_REGISTRY_INVALID');
    return state;
  }
  private async writeState(pluginId: string, state: EnvironmentState) {
    const directory = this.directory(pluginId);
    await fs.mkdir(directory, { recursive: true });
    const temp = path.join(directory, `state-${crypto.randomUUID()}.tmp`);
    await fs.writeFile(temp, JSON.stringify(state));
    await fs.rename(temp, path.join(directory, 'environments.json'));
    this.snapshots.delete(pluginId);
  }
  private assertIdle(pluginId: string) {
    if (this.busy.has(pluginId) || this.externalBusy(pluginId))
      throw new Error('MODEL_ENVIRONMENT_BUSY');
  }
  isBusy(pluginId: string) {
    return this.busy.has(pluginId);
  }
  private async probe(
    python: string
  ): Promise<{ path: string; prefix: string; version: string; virtual: boolean }> {
    return JSON.parse(
      (
        await this.run(
          python,
          [
            '-I',
            '-c',
            'import sys,json; print(json.dumps(dict(path=sys.executable,prefix=sys.prefix,version="%d.%d.%d"%sys.version_info[:3],virtual=sys.prefix!=sys.base_prefix)))',
          ],
          { timeoutMs: 8000 }
        )
      ).trim()
    );
  }
  private async locate(name: string): Promise<string | undefined> {
    const located = await this.run(process.platform === 'win32' ? 'where.exe' : 'which', [name], {
      timeoutMs: 4000,
    }).catch(() => '');
    return located
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find(Boolean);
  }
  private async discover(pluginId: string): Promise<ModelEnvironmentSnapshot> {
    const errors: string[] = [],
      tools: ModelEnvironmentSnapshot['tools'] = [];
    const bases = await this.discoverBase(pluginId).catch((error): ModelPythonEnvironment[] => {
      errors.push(String(error));
      return [];
    });
    const state = await this.readState(pluginId);
    for (const legacy of bases.filter((item) => item.kind === 'managed')) {
      if (state.environments.some((item) => item.id === legacy.id)) continue;
      const migrated: ModelPythonEnvironment = {
        ...legacy,
        managed: true,
        prefix: legacy.prefix ?? path.join(this.root, 'environments', pluginId),
        manager: legacy.condaPath ? 'conda' : 'venv',
      };
      await this.assertOwned(pluginId, migrated);
      await fs.writeFile(
        path.join(migrated.prefix!, '.guyantools-owner.json'),
        JSON.stringify({ pluginId })
      );
      state.environments.push(migrated);
      await this.writeState(pluginId, state);
    }
    const environments = new Map<string, ModelPythonEnvironment>(
      bases.map((item) => [
        item.id,
        {
          ...item,
          managed: item.kind === 'managed',
          manager: item.condaPath
            ? ('conda' as const)
            : item.kind === 'managed'
              ? ('venv' as const)
              : undefined,
        },
      ])
    );
    for (const entry of state.environments) {
      try {
        const probe = await this.probe(entry.pythonPath);
        if (entry.managed) await this.assertOwned(pluginId, entry);
        environments.set(entry.id, { ...entry, version: probe.version });
      } catch (error) {
        errors.push(`${entry.label}：${String(error).slice(-250)}`);
      }
    }
    const record = this.authorize(pluginId);
    if (record.installSource?.type === 'builtin' && record.installSource.value) {
      const prefix = path.join(record.installSource.value, '.venv');
      if (await exists(executableFor(prefix))) {
        const probe = await this.probe(executableFor(prefix)).catch((): null => null);
        if (probe)
          environments.set(idFor(probe.path), {
            id: idFor(probe.path),
            label: '插件目录 .venv（只读）',
            pythonPath: probe.path,
            version: probe.version,
            kind: 'venv',
            managed: false,
            prefix,
          });
      }
    }
    const uv = await this.locate(process.platform === 'win32' ? 'uv.exe' : 'uv');
    if (uv)
      tools.push({
        kind: 'uv',
        path: uv,
        version: (await this.run(uv, ['--version']).catch(() => '版本读取失败')).trim(),
      });
    const managers = new Set(
      bases.map((item) => item.condaPath).filter((item): item is string => Boolean(item))
    );
    const conda = await this.locate(process.platform === 'win32' ? 'conda.exe' : 'conda');
    if (conda) managers.add(conda);
    for (const manager of managers)
      tools.push({
        kind: 'conda',
        path: manager,
        version: (await this.run(manager, ['--version']).catch(() => '版本读取失败')).trim(),
      });
    for (const env of bases.filter((item) => item.kind === 'system'))
      tools.push({ kind: 'python', path: env.pythonPath, version: env.version });
    const all = [...environments.values()].map((item) => ({
      ...item,
      active: item.id === state.activeId || (!state.activeId && item.kind === 'managed'),
    }));
    const snapshot = {
      environments: all,
      tools,
      activeId: all.find((item) => item.active)?.id,
      errors,
    };
    this.snapshots.set(pluginId, snapshot);
    return snapshot;
  }
  async getEnvironmentSnapshot(pluginId: string): Promise<ModelEnvironmentSnapshot> {
    this.authorize(pluginId);
    if (!this.discovering.has(pluginId))
      this.discovering.set(
        pluginId,
        this.discover(pluginId).finally(() => this.discovering.delete(pluginId))
      );
    return this.discovering.get(pluginId)!;
  }
  private async environment(pluginId: string, id: string) {
    this.authorize(pluginId);
    const snapshot = this.snapshots.get(pluginId) ?? (await this.getEnvironmentSnapshot(pluginId));
    const environment = snapshot.environments.find((item) => item.id === id);
    if (!environment) throw new Error('MODEL_ENVIRONMENT_NOT_FOUND');
    return environment;
  }
  private async assertOwned(pluginId: string, environment: ModelPythonEnvironment) {
    if (!environment.managed && environment.kind !== 'managed')
      throw new Error('MODEL_ENVIRONMENT_READ_ONLY');
    const prefix = environment.prefix ?? path.join(this.root, 'environments', pluginId);
    const real = await fs.realpath(prefix);
    const root = await fs.realpath(this.root);
    if (!within(root, real)) throw new Error('MODEL_ENVIRONMENT_PATH_DENIED');
    // venv Python is normally a symlink to its base interpreter on Unix.
    // Validate the containing directory without rejecting that legitimate link.
    if (!within(path.resolve(prefix), path.resolve(environment.pythonPath)))
      throw new Error('MODEL_ENVIRONMENT_PATH_DENIED');
    const parent = await fs.realpath(path.dirname(environment.pythonPath));
    if (parent !== real && !within(real, parent)) throw new Error('MODEL_ENVIRONMENT_PATH_DENIED');
  }
  async activePython(pluginId: string, fallback: string): Promise<string> {
    const state = await this.readState(pluginId);
    if (!state.activeId) return fallback;
    const environment = await this.environment(pluginId, state.activeId);
    await this.assertOwned(pluginId, environment);
    const probe = await this.probe(environment.pythonPath);
    if (
      !probe.version.startsWith(`${this.authorize(pluginId).manifest.modelRuntime!.pythonVersion}.`)
    )
      throw new Error('MODEL_PYTHON_VERSION_MISMATCH');
    return environment.pythonPath;
  }
  async importEnvironment(pluginId: string) {
    this.authorize(pluginId);
    this.assertIdle(pluginId);
    const prefix = await this.pickDirectory();
    if (!prefix) return null;
    const real = await fs.realpath(prefix);
    const python = (await exists(executableFor(real))) ? executableFor(real) : condaPython(real);
    const probe = await this.probe(python);
    const isConda = await exists(path.join(real, 'conda-meta'));
    const cfg = await fs.readFile(path.join(real, 'pyvenv.cfg'), 'utf8').catch(() => '');
    const manager = isConda ? 'conda' : /^uv\s*=/m.test(cfg) ? 'uv' : 'venv';
    const snapshot = this.snapshots.get(pluginId) ?? (await this.getEnvironmentSnapshot(pluginId));
    const environment: ModelPythonEnvironment = {
      id: idFor(probe.path),
      label: `${path.basename(real)}（导入，只读）`,
      kind: manager,
      manager,
      ...(isConda ? { condaPath: snapshot.tools.find((tool) => tool.kind === 'conda')?.path } : {}),
      pythonPath: probe.path,
      prefix: real,
      version: probe.version,
      managed: false,
    };
    const state = await this.readState(pluginId);
    if (!state.environments.some((item) => item.id === environment.id)) {
      state.environments.push(environment);
      await this.writeState(pluginId, state);
    }
    return environment;
  }
  async selectEnvironment(pluginId: string, id: string) {
    this.authorize(pluginId);
    this.assertIdle(pluginId);
    const environment = await this.environment(pluginId, id);
    await this.assertOwned(pluginId, environment);
    const requiredVersion = this.authorize(pluginId).manifest.modelRuntime!.pythonVersion;
    const probe = await this.probe(environment.pythonPath);
    if (!probe.version.startsWith(`${requiredVersion}.`))
      throw new Error(`MODEL_PYTHON_VERSION_MISMATCH: 插件要求 Python ${requiredVersion}`);
    const state = await this.readState(pluginId);
    state.activeId = id;
    await this.writeState(pluginId, state);
    return { ...environment, active: true };
  }
  async createManagedEnvironment(pluginId: string, input: ModelEnvironmentCreateInput) {
    this.authorize(pluginId);
    this.assertIdle(pluginId);
    if (
      !input ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 80 ||
      Array.from(input.name).some((character) => character.charCodeAt(0) < 32) ||
      !/^3\.(9|10|11|12|13|14)$/.test(input.pythonVersion) ||
      !['venv', 'conda', 'uv'].includes(input.manager)
    )
      throw new Error('MODEL_ENVIRONMENT_INPUT_INVALID');
    const snapshot = await this.getEnvironmentSnapshot(pluginId);
    const base = snapshot.environments.find((item) => item.id === input.baseId);
    if (input.manager === 'venv' && (!base || !base.version.startsWith(`${input.pythonVersion}.`)))
      throw new Error('MODEL_PYTHON_VERSION_MISMATCH');
    const manager =
      input.manager === 'venv'
        ? base!.pythonPath
        : input.manager === 'conda'
          ? (base?.condaPath ?? snapshot.tools.find((item) => item.kind === 'conda')?.path)
          : snapshot.tools.find((item) => item.kind === 'uv')?.path;
    if (!manager) throw new Error('MODEL_ENVIRONMENT_MANAGER_MISSING');
    const prefix = path.join(this.directory(pluginId), crypto.randomUUID());
    return this.submit(pluginId, 'model-environment-create', input, async (signal, output) => {
      try {
        await fs.mkdir(path.dirname(prefix), { recursive: true });
        const args =
          input.manager === 'venv'
            ? ['-I', '-m', 'venv', prefix]
            : input.manager === 'conda'
              ? ['create', '-y', '-p', prefix, `python=${input.pythonVersion}`, 'pip']
              : [
                  'venv',
                  '--seed',
                  '--python',
                  base?.version.startsWith(`${input.pythonVersion}.`)
                    ? base.pythonPath
                    : input.pythonVersion,
                  prefix,
                ];
        await this.run(manager, args, this.commandOptions(signal, output));
        if (signal.aborted) throw new Error('MODEL_JOB_CANCELLED');
        const python = input.manager === 'conda' ? condaPython(prefix) : executableFor(prefix);
        const probe = await this.probe(python);
        if (!probe.version.startsWith(`${input.pythonVersion}.`))
          throw new Error('MODEL_ENVIRONMENT_INVALID');
        await fs.writeFile(
          path.join(prefix, '.guyantools-owner.json'),
          JSON.stringify({ pluginId })
        );
        const environment: ModelPythonEnvironment = {
          id: idFor(probe.path),
          label: input.name.trim(),
          pythonPath: probe.path,
          version: probe.version,
          kind: input.manager === 'conda' ? 'conda' : input.manager === 'uv' ? 'uv' : 'venv',
          manager: input.manager,
          managed: true,
          prefix,
          ...(input.manager === 'conda' ? { condaPath: manager } : {}),
        };
        const state = await this.readState(pluginId);
        state.environments.push(environment);
        await this.writeState(pluginId, state);
        return { environment };
      } catch (error) {
        // Generated prefix only; never clean the user's base/imported environment.
        if (within(this.directory(pluginId), prefix))
          await fs.rm(prefix, { recursive: true, force: true }).catch((): void => undefined);
        throw error;
      }
    });
  }
  async clearActiveEnvironment(pluginId: string) {
    this.authorize(pluginId);
    this.assertIdle(pluginId);
    const state = await this.readState(pluginId);
    state.activeId = undefined;
    await this.writeState(pluginId, state);
  }
  async removeEnvironment(pluginId: string, id: string) {
    this.authorize(pluginId);
    this.assertIdle(pluginId);
    const environment = await this.environment(pluginId, id),
      state = await this.readState(pluginId);
    if (!state.environments.some((item) => item.id === id))
      throw new Error('MODEL_ENVIRONMENT_READ_ONLY');
    if (state.activeId === id) throw new Error('MODEL_ENVIRONMENT_ACTIVE');
    if (environment.managed) {
      await this.assertOwned(pluginId, environment);
      const owner = JSON.parse(
        await fs.readFile(path.join(environment.prefix!, '.guyantools-owner.json'), 'utf8')
      );
      if (owner.pluginId !== pluginId) throw new Error('MODEL_ENVIRONMENT_PATH_DENIED');
    }
    return this.submit(pluginId, 'model-environment-remove', { id }, async (signal, output) => {
      if (environment.managed && environment.manager === 'conda' && environment.condaPath)
        await this.run(
          environment.condaPath,
          ['env', 'remove', '-y', '-p', environment.prefix!],
          this.commandOptions(signal, output)
        );
      if (environment.managed) await fs.rm(environment.prefix!, { recursive: true, force: true });
      state.environments = state.environments.filter((item) => item.id !== id);
      await this.writeState(pluginId, state);
      return { removed: id, filesDeleted: Boolean(environment.managed) };
    });
  }
  private async packageCommand(
    pluginId: string,
    environment: ModelPythonEnvironment,
    manager: ModelPackageManager
  ) {
    if (!['pip', 'uv', 'conda'].includes(manager)) throw new Error('MODEL_PACKAGE_MANAGER_INVALID');
    if (manager === 'pip') return { command: environment.pythonPath, prefix: ['-I', '-m', 'pip'] };
    if (manager === 'conda') {
      if (!environment.condaPath || !environment.prefix)
        throw new Error('MODEL_ENVIRONMENT_MANAGER_MISSING');
      return { command: environment.condaPath, prefix: [] };
    }
    const tool = (
      this.snapshots.get(pluginId) ?? (await this.getEnvironmentSnapshot(pluginId))
    ).tools.find((item) => item.kind === 'uv');
    if (!tool) throw new Error('MODEL_ENVIRONMENT_MANAGER_MISSING');
    return { command: tool.path, prefix: ['pip'] };
  }
  async listPackages(
    pluginId: string,
    id: string,
    manager: ModelPackageManager
  ): Promise<ModelPackageRecord[]> {
    const environment = await this.environment(pluginId, id),
      tool = await this.packageCommand(pluginId, environment, manager);
    const args =
      manager === 'conda'
        ? ['list', '-p', environment.prefix!, '--json']
        : [
            ...tool.prefix,
            'list',
            ...(manager === 'uv' ? ['--python', environment.pythonPath] : []),
            '--format=json',
          ];
    const result = JSON.parse(await this.run(tool.command, args, { timeoutMs: 30_000 }));
    if (!Array.isArray(result)) throw new Error('MODEL_PACKAGE_LIST_INVALID');
    return result.map((item) => ({
      name: String(item.name),
      version: String(item.version),
      source: redactModelOutput(String(item.channel ?? manager)),
    }));
  }
  async changePackages(pluginId: string, input: ModelPackageChangeInput) {
    this.authorize(pluginId);
    this.assertIdle(pluginId);
    if (!input || !['install', 'upgrade', 'remove'].includes(input.action))
      throw new Error('MODEL_PACKAGE_ACTION_INVALID');
    const packages = validatePackageSpecs(input.packages, input.action);
    const environment = await this.environment(pluginId, input.environmentId);
    await this.assertOwned(pluginId, environment);
    const tool = await this.packageCommand(pluginId, environment, input.manager);
    const action =
      input.action === 'remove'
        ? input.manager === 'conda'
          ? 'remove'
          : 'uninstall'
        : input.manager === 'conda' && input.action === 'upgrade'
          ? 'update'
          : 'install';
    const args =
      input.manager === 'conda'
        ? [
            action,
            '-y',
            '-p',
            environment.prefix!,
            ...(input.action === 'remove'
              ? []
              : [`python=${environment.version.split('.').slice(0, 2).join('.')}`]),
            ...packages,
          ]
        : [
            ...tool.prefix,
            action,
            ...(input.manager === 'uv' ? ['--python', environment.pythonPath] : []),
            ...(input.action === 'upgrade' ? ['--upgrade'] : []),
            ...(input.manager === 'pip'
              ? input.action === 'remove'
                ? ['-y']
                : ['--disable-pip-version-check', '--no-input']
              : []),
            ...packages,
          ];
    return this.submit(pluginId, 'model-packages', input, async (signal, output) => {
      await this.run(tool.command, args, this.commandOptions(signal, output));
      return { packages };
    });
  }
  async checkPackages(pluginId: string, id: string, manager: ModelPackageManager) {
    if (manager === 'conda') manager = 'pip';
    const environment = await this.environment(pluginId, id),
      tool = await this.packageCommand(pluginId, environment, manager);
    try {
      return {
        ok: true,
        details:
          (
            await this.run(
              tool.command,
              [
                ...tool.prefix,
                'check',
                ...(manager === 'uv' ? ['--python', environment.pythonPath] : []),
              ],
              { timeoutMs: 30_000 }
            )
          ).trim() || '依赖检查通过',
      };
    } catch (error) {
      return { ok: false, details: String(error) };
    }
  }
  async exportPackages(pluginId: string, id: string, manager: ModelPackageManager) {
    if (manager === 'conda')
      return (await this.listPackages(pluginId, id, manager))
        .map((item) => `${item.name}==${item.version}`)
        .join('\n');
    const environment = await this.environment(pluginId, id),
      tool = await this.packageCommand(pluginId, environment, manager);
    return this.run(
      tool.command,
      [...tool.prefix, 'freeze', ...(manager === 'uv' ? ['--python', environment.pythonPath] : [])],
      { timeoutMs: 30_000 }
    );
  }
  private commandOptions(signal: AbortSignal, onOutput: (text: string) => void) {
    return {
      signal,
      onOutput,
      timeoutMs: 1_200_000,
      env: {
        UV_CACHE_DIR: path.join(this.root, 'cache', 'uv'),
        UV_PYTHON_INSTALL_DIR: path.join(this.root, 'cache', 'python'),
        CONDA_PKGS_DIRS: path.join(this.root, 'cache', 'conda'),
      },
    };
  }
  private async submit(
    pluginId: string,
    kind: string,
    input: unknown,
    task: (
      signal: AbortSignal,
      onOutput: (text: string) => void
    ) => Promise<Record<string, unknown>>
  ) {
    this.assertIdle(pluginId);
    this.busy.add(pluginId);
    let job: JobRecord;
    try {
      job = await this.jobs().create(pluginId, kind, input);
    } catch (error) {
      this.busy.delete(pluginId);
      throw error;
    }
    const abort = new AbortController();
    this.operations.set(job.id, { pluginId, abort });
    const running = (async () => {
      let log = '',
        updatedAt = 0;
      let logUpdates = Promise.resolve();
      const output = (text: string) => {
        log = (log + text).slice(-8000);
        if (Date.now() - updatedAt > 750 && !abort.signal.aborted) {
          updatedAt = Date.now();
          const snapshot = log;
          logUpdates = logUpdates
            .then(async () => {
              if (!abort.signal.aborted)
                await this.jobs().update(pluginId, job.id, { currentStep: snapshot.slice(-350) });
            })
            .catch((): void => undefined);
        }
      };
      try {
        await this.jobs().update(pluginId, job.id, {
          status: 'running',
          currentStep: '准备运行环境操作',
        });
        if (abort.signal.aborted) throw new Error('MODEL_JOB_CANCELLED');
        const result = await task(abort.signal, output);
        await logUpdates;
        if (!abort.signal.aborted)
          await this.jobs().update(pluginId, job.id, {
            status: 'completed',
            progress: 1,
            currentStep: '运行环境操作完成',
            output: { ...result, log },
          });
      } catch (error) {
        await logUpdates;
        if (!abort.signal.aborted)
          await this.jobs().update(pluginId, job.id, {
            status: 'failed',
            error: String(error).slice(-4000),
            currentStep: '运行环境操作失败',
            output: { log },
          });
      } finally {
        this.operations.delete(job.id);
        this.busy.delete(pluginId);
        this.snapshots.delete(pluginId);
      }
    })();
    this.tasks.add(running);
    void running.then(
      () => this.tasks.delete(running),
      () => this.tasks.delete(running)
    );
    return job;
  }
  async cancel(pluginId: string, jobId: string): Promise<JobRecord | null> {
    const operation = this.operations.get(jobId);
    if (!operation || operation.pluginId !== pluginId) return null;
    operation.abort.abort();
    return this.jobs().cancel(pluginId, jobId);
  }
  async waitForIdle(): Promise<void> {
    await Promise.all([...this.tasks]);
  }
  async disposePlugin(pluginId: string) {
    for (const [id, operation] of this.operations)
      if (operation.pluginId === pluginId) {
        operation.abort.abort();
        await this.jobs()
          .cancel(pluginId, id)
          .catch((): void => undefined);
      }
    this.snapshots.delete(pluginId);
  }

  getDependencyProfiles(pluginId: string): ModelDependencyProfile[] {
    const deps = this.authorize(pluginId).manifest.modelRuntime!.dependencies;
    return (
      deps.profiles ?? [
        {
          id: 'cpu',
          label: 'CPU（插件默认）',
          device: 'cpu',
          packages: deps.cpu,
          indexUrl: deps.indexUrls?.cpu ?? 'https://pypi.org/simple',
        },
        {
          id: 'cuda',
          label: 'CUDA（插件默认）',
          device: 'cuda',
          packages: deps.cuda,
          indexUrl: deps.indexUrls?.cuda ?? 'https://pypi.org/simple',
        },
      ]
    );
  }

  async inspectRuntime(pluginId: string, id?: string): Promise<ModelRuntimeDiagnostics> {
    this.authorize(pluginId);
    const report: ModelRuntimeDiagnostics = {
      platform: process.platform,
      architecture: process.arch,
      environmentRoot: this.directory(pluginId),
      cacheRoot: path.join(this.root, 'cache'),
      gpus: [],
      toolkits: [],
      warnings: [],
    };
    await fs.mkdir(this.root, { recursive: true });
    const stat = await fs.statfs(this.root).catch((): null => null);
    if (stat) report.freeBytes = Number(stat.bavail) * Number(stat.bsize);
    const gpu = await this.run(
      'nvidia-smi',
      ['--query-gpu=index,name,driver_version,memory.total', '--format=csv,noheader,nounits'],
      { timeoutMs: 8000 }
    ).catch((error) => {
      report.warnings.push(`NVIDIA 检测：${String(error).slice(-300)}`);
      return '';
    });
    report.gpus = parseGpuCsv(gpu);
    report.driverCudaMax = parseCudaVersion(
      await this.run('nvidia-smi', [], { timeoutMs: 8000 }).catch(() => '')
    );
    const nvcc = await this.locate(process.platform === 'win32' ? 'nvcc.exe' : 'nvcc');
    const candidates = new Set<string>(nvcc ? [nvcc] : []);
    const toolkitRoot =
      process.platform === 'win32'
        ? path.join(
            process.env['ProgramFiles'] ?? 'C:/Program Files',
            'NVIDIA GPU Computing Toolkit',
            'CUDA'
          )
        : '/usr/local';
    for (const dir of await fs.readdir(toolkitRoot).catch((): string[] => []))
      if (process.platform === 'win32' ? /^v\d/.test(dir) : /^cuda/.test(dir))
        candidates.add(
          path.join(toolkitRoot, dir, 'bin', process.platform === 'win32' ? 'nvcc.exe' : 'nvcc')
        );
    for (const command of [...candidates].slice(0, 12)) {
      const text = await this.run(command, ['--version'], { timeoutMs: 5000 }).catch(() => '');
      const version = /release\s+([\d.]+)/.exec(text)?.[1];
      if (version) report.toolkits.push({ path: command, version });
    }
    if (!report.toolkits.length)
      report.warnings.push('未检测到 CUDA Toolkit；PyTorch wheel 运行不一定需要全局 Toolkit。');
    if (id) {
      const environment = await this.environment(pluginId, id);
      try {
        report.framework = await inspectModelFramework(environment.pythonPath, this.run);
      } catch (error) {
        report.warnings.push(`所选环境诊断失败：${String(error).slice(-1000)}`);
      }
    }
    return report;
  }
}
