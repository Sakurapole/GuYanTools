import type { InstalledPluginRecord } from '@/contracts/plugin_host';
import type {
  ModelFileHandle,
  ModelInferenceInput,
  ModelPythonEnvironment,
  ModelDependencyProfile,
} from '@/contracts/plugin_model';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { JobService } from './job_service';
import { ModelEnvironmentService, profileIsCompatible } from './model_environment_service';
import { modelProcessEnv, runModelCommand } from './model_process';

type FileKind = ModelFileHandle['kind'];
type Picker = (kind: FileKind) => Promise<string | null>;
type Job = Awaited<ReturnType<JobService['create']>>;

const MINIFORGE_RELEASE = '26.7.2-0';
const MINIFORGE_ASSETS = {
  win32: {
    file: `Miniforge3-${MINIFORGE_RELEASE}-Windows-x86_64.exe`,
    sha256: '71cf9519087be74fa53021219ff292beb2fc05fa49e0bb6eb0e0b6b14fccbaab',
  },
  linux: {
    file: `Miniforge3-${MINIFORGE_RELEASE}-Linux-x86_64.sh`,
    sha256: '281b0ac7d550802efc81af633225a5e6116d29ae72f3ab4eae7168c3931a4c05',
  },
} as const;

function pythonPath(prefix: string): string {
  return process.platform === 'win32'
    ? fs.existsSync(path.join(prefix, 'Scripts', 'python.exe'))
      ? path.join(prefix, 'Scripts', 'python.exe')
      : path.join(prefix, 'python.exe')
    : path.join(prefix, 'bin', 'python');
}

function condaPath(prefix: string): string {
  return process.platform === 'win32'
    ? path.join(prefix, 'Scripts', 'conda.exe')
    : path.join(prefix, 'bin', 'conda');
}

function environmentId(python: string): string {
  return crypto.createHash('sha256').update(path.resolve(python)).digest('hex').slice(0, 16);
}

function safeProcessEnv(): NodeJS.ProcessEnv {
  return modelProcessEnv();
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {}
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: safeProcessEnv(),
      shell: false,
      windowsHide: true,
    });
    let output = '';
    let errorOutput = '';
    const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 30_000);
    child.stdout.on('data', (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-64_000);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errorOutput = (errorOutput + chunk.toString()).slice(-64_000);
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error((errorOutput || output || `Process exited ${code}`).slice(-2000)));
    });
  });
}

async function probePython(
  command: string,
  prefixArgs: string[] = []
): Promise<{ path: string; version: string } | null> {
  try {
    const raw = await runCommand(
      command,
      [
        ...prefixArgs,
        '-c',
        'import json,sys;print(json.dumps({"path":sys.executable,"version":"%d.%d.%d"%sys.version_info[:3]}))',
      ],
      { timeoutMs: 5000 }
    );
    const result = JSON.parse(raw.trim()) as { path: string; version: string };
    return result.path && /^\d+\.\d+\.\d+$/.test(result.version) ? result : null;
  } catch {
    return null;
  }
}

export function assertModelAccess(
  record: InstalledPluginRecord | undefined
): asserts record is InstalledPluginRecord {
  if (!record || record.installSource.type !== 'builtin')
    throw new Error('MODEL_PLUGIN_NOT_TRUSTED');
  if (
    !record.enabled ||
    record.status !== 'enabled' ||
    !record.manifest.modelRuntime ||
    !record.manifest.permissions.includes('models.execute') ||
    !record.approvedPermissions.includes('models.execute')
  ) {
    throw new Error('MODEL_PERMISSION_DENIED');
  }
}

export function isLegacyBuiltinModelSource(
  record: InstalledPluginRecord | undefined,
  builtinRoot: string
): boolean {
  if (!record || record.installSource.type === 'builtin') return false;
  const sourcePath = path.resolve(record.installSource.value);
  const trustedPath = path.resolve(builtinRoot);
  return process.platform === 'win32'
    ? sourcePath.toLowerCase() === trustedPath.toLowerCase()
    : sourcePath === trustedPath;
}

export function resolveModelScript(root: string, entry: string): string {
  if (
    !entry.endsWith('.py') ||
    path.isAbsolute(entry) ||
    path.win32.isAbsolute(entry) ||
    entry.split(/[\\/]/).includes('..')
  )
    throw new Error('MODEL_SCRIPT_INVALID');
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, entry);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('MODEL_SCRIPT_INVALID');
  return resolved;
}

export function validateModelOptions(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('MODEL_OPTION_INVALID');
  const output: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      !/^[a-z][a-zA-Z0-9_]*$/.test(key) ||
      (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') ||
      (typeof item === 'string' &&
        (item.length > 100 || item.includes('/') || item.includes('\\'))) ||
      (typeof item === 'number' && !Number.isFinite(item))
    )
      throw new Error('MODEL_OPTION_INVALID');
    output[key] = item;
  }
  if (JSON.stringify(output).length > 2048) throw new Error('MODEL_OPTION_INVALID');
  return output;
}

export class ModelRuntimeService {
  readonly environments: ModelEnvironmentService;
  private readonly files = new Map<string, { pluginId: string; kind: FileKind; path: string }>();
  private readonly active = new Map<
    string,
    { pluginId: string; child: ChildProcessWithoutNullStreams }
  >();
  private readonly pending = new Map<string, string>();
  private readonly reservations = new Set<string>();
  private readonly trackedAbort = new Map<string, AbortController>();

  constructor(
    private readonly root: string,
    private readonly getRecord: (pluginId: string) => InstalledPluginRecord | undefined,
    private readonly jobs: () => JobService,
    private readonly picker: Picker,
    pickEnvironment: () => Promise<string | null> = async () => null
  ) {
    this.environments = new ModelEnvironmentService(
      root,
      (id) => this.require(id),
      jobs,
      (id) => this.discoverBasePython(id),
      pickEnvironment,
      (id) => this.reservations.has(id) || [...this.pending.values()].includes(id)
    );
  }

  private require(pluginId: string): InstalledPluginRecord {
    const record = this.getRecord(pluginId);
    assertModelAccess(record);
    return record;
  }

  private pluginEnvironmentPath(pluginId: string): string {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(pluginId)) throw new Error('MODEL_PLUGIN_ID_INVALID');
    return path.join(this.root, 'environments', pluginId);
  }

  async listPython(pluginId: string): Promise<ModelPythonEnvironment[]> {
    return (await this.environments.getEnvironmentSnapshot(pluginId)).environments;
  }

  private async discoverBasePython(pluginId: string): Promise<ModelPythonEnvironment[]> {
    this.require(pluginId);
    const found = new Map<string, ModelPythonEnvironment>();
    const add = async (
      command: string,
      kind: ModelPythonEnvironment['kind'],
      manager?: string,
      prefixArgs: string[] = []
    ) => {
      const probe = await probePython(command, prefixArgs);
      if (!probe) return;
      const resolved = path.resolve(probe.path);
      const previous = found.get(resolved);
      if (previous?.kind === 'managed' && kind !== 'managed') {
        if (manager) {
          previous.condaPath = manager;
          previous.manager = 'conda';
        }
        return;
      }
      found.set(resolved, {
        id: environmentId(resolved),
        label: `${kind} · Python ${probe.version} · ${resolved}`,
        prefix:
          kind === 'conda'
            ? process.platform === 'win32'
              ? path.dirname(resolved)
              : path.dirname(path.dirname(resolved))
            : kind === 'managed'
              ? this.pluginEnvironmentPath(pluginId)
              : undefined,
        pythonPath: resolved,
        version: probe.version,
        kind,
        ...(manager ? { condaPath: manager } : {}),
      });
    };
    const managed = pythonPath(this.pluginEnvironmentPath(pluginId));
    if (fs.existsSync(managed)) await add(managed, 'managed');
    const miniforge = condaPath(path.join(this.root, 'miniforge'));
    const managers = [miniforge];
    if (process.env.CONDA_EXE) managers.push(process.env.CONDA_EXE);
    if (process.platform === 'win32') {
      const located = await runCommand('where.exe', ['python.exe'], { timeoutMs: 5000 }).catch(
        () => ''
      );
      for (const python of located.split(/\r?\n/).filter(Boolean))
        managers.push(path.join(path.dirname(python.trim()), 'Scripts', 'conda.exe'));
    }
    if (process.platform === 'win32') {
      const located = await runCommand('where.exe', ['conda.exe'], { timeoutMs: 5000 }).catch(
        () => ''
      );
      managers.push(
        ...located
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
      );
    } else {
      managers.push('conda');
    }
    for (const manager of new Set(managers)) {
      try {
        const raw = await runCommand(manager, ['info', '--envs', '--json'], { timeoutMs: 8000 });
        const prefixes = (JSON.parse(raw) as { envs?: string[] }).envs ?? [];
        for (const prefix of prefixes.slice(0, 30)) await add(pythonPath(prefix), 'conda', manager);
      } catch {
        /* This Conda installation is unavailable. */
      }
    }
    for (const command of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
      await add(command, 'system', undefined, command === 'py' ? ['-3.10'] : []);
    }
    return [...found.values()];
  }

  async installMiniforge(pluginId: string): Promise<ModelPythonEnvironment[]> {
    this.require(pluginId);
    if (process.arch !== 'x64' || (process.platform !== 'win32' && process.platform !== 'linux'))
      throw new Error('MODEL_PLATFORM_UNSUPPORTED');
    const target = path.join(this.root, 'miniforge');
    if (fs.existsSync(condaPath(target))) return this.listPython(pluginId);
    await fsp.mkdir(this.root, { recursive: true });
    const asset = MINIFORGE_ASSETS[process.platform];
    const url = `https://github.com/conda-forge/miniforge/releases/download/${MINIFORGE_RELEASE}/${asset.file}`;
    const staging = await fsp.mkdtemp(path.join(this.root, 'miniforge-download-'));
    const downloaded = path.join(staging, asset.file);
    try {
      const response = await fetch(url);
      if (!response.ok || !response.body)
        throw new Error(`MODEL_MINIFORGE_DOWNLOAD_FAILED: ${response.status}`);
      await pipeline(Readable.fromWeb(response.body as never), fs.createWriteStream(downloaded));
      const hash = crypto.createHash('sha256');
      for await (const chunk of fs.createReadStream(downloaded)) hash.update(chunk as Buffer);
      const digest = hash.digest('hex');
      if (digest !== asset.sha256) throw new Error('MODEL_MINIFORGE_CHECKSUM_MISMATCH');
      if (process.platform === 'win32') {
        await runCommand(
          downloaded,
          ['/InstallationType=JustMe', '/RegisterPython=0', '/AddToPath=0', '/S', `/D=${target}`],
          { timeoutMs: 600_000 }
        );
      } else {
        await runCommand('bash', [downloaded, '-b', '-p', target], { timeoutMs: 600_000 });
      }
      if (!fs.existsSync(condaPath(target))) throw new Error('MODEL_MINIFORGE_INSTALL_FAILED');
      return this.listPython(pluginId);
    } finally {
      await fsp.rm(staging, { recursive: true, force: true });
    }
  }

  async createEnvironment(pluginId: string, baseId: string): Promise<ModelPythonEnvironment> {
    const requiredPython = this.require(pluginId).manifest.modelRuntime!.pythonVersion;
    if (
      this.reservations.has(pluginId) ||
      this.environments.isBusy(pluginId) ||
      [...this.pending.values()].includes(pluginId)
    )
      throw new Error('MODEL_ENVIRONMENT_BUSY');
    const candidates = await this.listPython(pluginId);
    const base = candidates.find((item) => item.id === baseId);
    if (!base) throw new Error('MODEL_PYTHON_NOT_FOUND');
    const target = this.pluginEnvironmentPath(pluginId);
    if (!fs.existsSync(pythonPath(target))) {
      await fsp.mkdir(path.dirname(target), { recursive: true });
      if (base.condaPath) {
        await runCommand(
          base.condaPath,
          ['create', '-y', '-p', target, `python=${requiredPython}`, 'pip'],
          { timeoutMs: 600_000 }
        );
      } else {
        if (!base.version.startsWith(`${requiredPython}.`))
          throw new Error('MODEL_PYTHON_VERSION_UNSUPPORTED');
        await runCommand(base.pythonPath, ['-m', 'venv', target], { timeoutMs: 120_000 });
      }
    }
    const ready = await probePython(pythonPath(target));
    if (!ready || !ready.version.startsWith(`${requiredPython}.`))
      throw new Error('MODEL_ENVIRONMENT_INVALID');
    return {
      id: environmentId(ready.path),
      label: `插件环境 · Python ${ready.version}`,
      pythonPath: ready.path,
      version: ready.version,
      kind: 'managed',
    };
  }

  async checkDependencies(pluginId: string, device: 'cpu' | 'cuda'): Promise<boolean> {
    this.require(pluginId);
    if (device !== 'cpu' && device !== 'cuda') throw new Error('MODEL_DEVICE_INVALID');
    const executable = await this.environments.activePython(
      pluginId,
      pythonPath(this.pluginEnvironmentPath(pluginId))
    );
    if (!fs.existsSync(executable)) return false;
    return (
      (await probePython(executable)) !== null &&
      (await runCommand(
        executable,
        [
          '-c',
          device === 'cuda'
            ? 'import torch,cv2,numpy;assert torch.cuda.is_available();torch.ones(1,device="cuda").add_(1).cpu().item()'
            : 'import torch,cv2,numpy',
        ],
        { timeoutMs: 20_000 }
      ).then(
        () => true,
        () => false
      ))
    );
  }

  async installDependencies(
    pluginId: string,
    device: 'cpu' | 'cuda',
    profileId?: string
  ): Promise<Job> {
    const record = this.require(pluginId);
    if (
      this.reservations.has(pluginId) ||
      this.environments.isBusy(pluginId) ||
      [...this.pending.values()].includes(pluginId)
    )
      throw new Error('MODEL_ENVIRONMENT_BUSY');
    this.reservations.add(pluginId);
    try {
      if (device !== 'cpu' && device !== 'cuda') throw new Error('MODEL_DEVICE_INVALID');
      const executable = await this.environments.activePython(
        pluginId,
        pythonPath(this.pluginEnvironmentPath(pluginId))
      );
      if (!fs.existsSync(executable)) throw new Error('MODEL_ENVIRONMENT_MISSING');
      const profile = profileId
        ? this.environments
            .getDependencyProfiles(pluginId)
            .find((item) => item.id === profileId && item.device === device)
        : undefined;
      if (profileId && !profile) throw new Error('MODEL_DEPENDENCY_PROFILE_INVALID');
      if (profile?.device === 'cuda') {
        const diagnostics = await this.environments.inspectRuntime(pluginId);
        if (!profileIsCompatible(profile, diagnostics.driverCudaMax, diagnostics.gpus.length > 0))
          throw new Error('MODEL_CUDA_PROFILE_INCOMPATIBLE');
      }
      const job = await this.jobs().create(pluginId, 'model-dependencies', { device, profileId });
      this.pending.set(job.id, pluginId);
      void this.installDependenciesTask(pluginId, job, executable, record, device, profile);
      return job;
    } finally {
      this.reservations.delete(pluginId);
    }
  }

  private async installDependenciesTask(
    pluginId: string,
    job: Job,
    executable: string,
    record: InstalledPluginRecord,
    device: 'cpu' | 'cuda',
    profile?: ModelDependencyProfile
  ): Promise<void> {
    try {
      const dependencies = record.manifest.modelRuntime!.dependencies;
      await this.jobs().update(pluginId, job.id, {
        status: 'running',
        currentStep: '安装通用依赖',
      });
      if (this.cancelled.has(job.id)) {
        await this.jobs().cancel(pluginId, job.id);
        return;
      }
      if (dependencies.common.length)
        await this.runTracked(pluginId, job.id, executable, [
          '-m',
          'pip',
          'install',
          '--disable-pip-version-check',
          '--no-input',
          ...dependencies.common,
        ]);
      if (this.cancelled.has(job.id)) return;
      await this.jobs().update(pluginId, job.id, {
        currentStep: device === 'cuda' ? '安装 CUDA 依赖' : '安装 CPU 依赖',
      });
      const index = profile?.indexUrl ?? dependencies.indexUrls?.[device];
      if (
        index &&
        (!index.startsWith('https://') || new URL(index).username || new URL(index).password)
      )
        throw new Error('MODEL_PACKAGE_INDEX_INVALID');
      if (this.cancelled.has(job.id)) return;
      await this.runTracked(pluginId, job.id, executable, [
        '-m',
        'pip',
        'install',
        '--disable-pip-version-check',
        '--no-input',
        '--force-reinstall',
        ...(index ? ['--index-url', index] : []),
        ...(profile?.packages ?? dependencies[device]),
      ]);
      if (!this.cancelled.has(job.id))
        await this.jobs().update(pluginId, job.id, {
          status: 'completed',
          progress: 1,
          currentStep: '依赖安装完成',
        });
    } catch (error) {
      if (!this.cancelled.has(job.id))
        await this.jobs().update(pluginId, job.id, {
          status: 'failed',
          error: String(error).slice(0, 1000),
          currentStep: '依赖安装失败',
        });
    } finally {
      this.cancelled.delete(job.id);
      this.pending.delete(job.id);
    }
  }

  async pickFile(pluginId: string, kind: FileKind): Promise<ModelFileHandle | null> {
    this.require(pluginId);
    if (!['input', 'weights', 'output'].includes(kind)) throw new Error('MODEL_FILE_KIND_INVALID');
    const selected = await this.picker(kind);
    if (!selected) return null;
    const real = await fsp.realpath(selected);
    const stat = await fsp.stat(real);
    if (kind === 'output' ? !stat.isDirectory() : !stat.isFile())
      throw new Error('MODEL_FILE_INVALID');
    if (kind === 'input' && !/\.(png|jpe?g|webp|bmp)$/i.test(real))
      throw new Error('MODEL_INPUT_FORMAT_INVALID');
    if (kind === 'weights' && !/\.pth$/i.test(real))
      throw new Error('MODEL_WEIGHTS_FORMAT_INVALID');
    const handle: ModelFileHandle = { id: crypto.randomUUID(), name: path.basename(real), kind };
    this.files.set(handle.id, { pluginId, kind, path: real });
    return handle;
  }

  private selected(pluginId: string, id: string, kind: FileKind): string {
    const file = this.files.get(id);
    if (!file || file.pluginId !== pluginId || file.kind !== kind)
      throw new Error('MODEL_FILE_HANDLE_INVALID');
    return file.path;
  }

  async startInference(pluginId: string, input: ModelInferenceInput): Promise<Job> {
    const record = this.require(pluginId);
    if (
      this.reservations.has(pluginId) ||
      this.environments.isBusy(pluginId) ||
      [...this.pending.values()].includes(pluginId)
    )
      throw new Error('MODEL_ENVIRONMENT_BUSY');
    this.reservations.add(pluginId);
    try {
      const options = validateModelOptions(input?.options);
      const image = this.selected(pluginId, input.inputId, 'input');
      const weights = this.selected(pluginId, input.weightsId, 'weights');
      const outputDirectory = this.selected(pluginId, input.outputId, 'output');
      const executable = await this.environments.activePython(
        pluginId,
        pythonPath(this.pluginEnvironmentPath(pluginId))
      );
      if (!fs.existsSync(executable)) throw new Error('MODEL_ENVIRONMENT_MISSING');
      const entry = record.resolvedEntryPaths.ui;
      if (!entry) throw new Error('MODEL_PLUGIN_ENTRY_MISSING');
      // UI can be nested (dist/index.html); model entry is relative to plugin root.
      let pluginRoot = entry;
      for (const segment of path
        .normalize(record.manifest.entry.ui!)
        .split(path.sep)
        .filter(Boolean)) {
        void segment;
        pluginRoot = path.dirname(pluginRoot);
      }
      const root = await fsp.realpath(pluginRoot);
      const script = resolveModelScript(root, record.manifest.modelRuntime!.entry);
      const realScript = await fsp.realpath(script);
      if (!realScript.startsWith(`${root}${path.sep}`) || !(await fsp.stat(realScript)).isFile())
        throw new Error('MODEL_SCRIPT_INVALID');
      const output = path.join(
        outputDirectory,
        `${path.parse(image).name}_x${String(options.scale ?? 'result')}_${Date.now()}.png`
      );
      const job = await this.jobs().create(pluginId, 'model-inference', {
        input: path.basename(image),
        weights: path.basename(weights),
        options,
      });
      this.pending.set(job.id, pluginId);
      void this.inferenceTask(pluginId, job, executable, realScript, root, {
        input: image,
        weights,
        output,
        options,
      });
      return job;
    } finally {
      this.reservations.delete(pluginId);
    }
  }

  private async inferenceTask(
    pluginId: string,
    job: Job,
    executable: string,
    script: string,
    cwd: string,
    request: {
      input: string;
      weights: string;
      output: string;
      options: Record<string, string | number | boolean>;
    }
  ): Promise<void> {
    try {
      await this.jobs().update(pluginId, job.id, { status: 'running', currentStep: '运行模型' });
      if (this.cancelled.has(job.id)) {
        await this.jobs().cancel(pluginId, job.id);
        return;
      }
      await this.runTracked(
        pluginId,
        job.id,
        executable,
        ['-s', '-E', script],
        JSON.stringify(request),
        cwd
      );
      if (this.cancelled.has(job.id)) return;
      if (!(await fsp.stat(request.output)).isFile()) throw new Error('MODEL_OUTPUT_MISSING');
      await this.jobs().update(pluginId, job.id, {
        status: 'completed',
        progress: 1,
        currentStep: '处理完成',
        output: { fileName: path.basename(request.output) },
      });
    } catch (error) {
      if (!this.cancelled.has(job.id))
        await this.jobs().update(pluginId, job.id, {
          status: 'failed',
          currentStep: '模型运行失败',
          error: String(error).slice(0, 1000),
        });
    } finally {
      this.cancelled.delete(job.id);
      this.pending.delete(job.id);
    }
  }

  private readonly cancelled = new Set<string>();

  private async runTracked(
    pluginId: string,
    jobId: string,
    command: string,
    args: string[],
    stdin?: string,
    cwd?: string
  ): Promise<void> {
    if (this.cancelled.has(jobId)) throw new Error('MODEL_JOB_CANCELLED');
    const abort = new AbortController();
    this.trackedAbort.set(jobId, abort);
    try {
      await runModelCommand(command, args, {
        signal: abort.signal,
        input: stdin,
        timeoutMs: 1_200_000,
        cwd,
        onStart: (child) => this.active.set(jobId, { pluginId, child }),
      });
    } finally {
      this.active.delete(jobId);
      this.trackedAbort.delete(jobId);
    }
  }

  async cancel(pluginId: string, jobId: string): Promise<Job> {
    this.require(pluginId);
    const environmentJob = await this.environments.cancel(pluginId, jobId);
    if (environmentJob) return environmentJob;
    await this.jobs().get(pluginId, jobId);
    const active = this.active.get(jobId);
    if (active?.pluginId !== pluginId && this.pending.get(jobId) !== pluginId)
      throw new Error('MODEL_JOB_NOT_RUNNING');
    this.cancelled.add(jobId);
    this.trackedAbort.get(jobId)?.abort();
    return this.jobs().cancel(pluginId, jobId);
  }

  async disposePlugin(pluginId: string): Promise<void> {
    await this.environments.disposePlugin(pluginId);
    for (const [jobId, owner] of this.pending) {
      if (owner !== pluginId) continue;
      this.cancelled.add(jobId);
      await this.jobs()
        .cancel(pluginId, jobId)
        .catch((): void => undefined);
    }
    for (const [jobId, active] of this.active) {
      if (active.pluginId !== pluginId) continue;
      this.trackedAbort.get(jobId)?.abort();
    }
    for (const [id, file] of this.files) if (file.pluginId === pluginId) this.files.delete(id);
  }
}
