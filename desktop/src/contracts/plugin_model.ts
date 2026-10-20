export interface ModelPythonEnvironment {
  id: string;
  label: string;
  pythonPath: string;
  version: string;
  kind: 'system' | 'conda' | 'managed' | 'venv' | 'uv';
  condaPath?: string;
  manager?: 'venv' | 'conda' | 'uv';
  managed?: boolean;
  active?: boolean;
  prefix?: string;
}

export type ModelPackageManager = 'pip' | 'uv' | 'conda';
export interface ModelEnvironmentSnapshot {
  environments: ModelPythonEnvironment[];
  tools: Array<{ kind: 'python' | 'conda' | 'uv'; path: string; version: string }>;
  activeId?: string;
  errors: string[];
}
export interface ModelEnvironmentCreateInput {
  name: string;
  manager: 'venv' | 'conda' | 'uv';
  pythonVersion: string;
  baseId?: string;
}
export interface ModelPackageRecord {
  name: string;
  version: string;
  source?: string;
}
export interface ModelPackageChangeInput {
  environmentId: string;
  manager: ModelPackageManager;
  action: 'install' | 'upgrade' | 'remove';
  packages: string[];
}
export interface ModelDependencyProfile {
  id: string;
  label: string;
  device: 'cpu' | 'cuda';
  cudaVersion?: string;
  packages: string[];
  indexUrl: string;
}
export interface ModelRuntimeDiagnostics {
  platform: string;
  architecture: string;
  environmentRoot: string;
  cacheRoot: string;
  freeBytes?: number;
  driverCudaMax?: string;
  gpus: Array<{ index: number; name: string; driverVersion: string; memoryMiB: number }>;
  toolkits: Array<{ path: string; version: string }>;
  framework?: {
    python: string;
    probeStatus?: 'ready' | 'failed' | 'not-installed';
    errorCode?: 'OPENMP_RUNTIME_CONFLICT' | 'FRAMEWORK_PROBE_FAILED';
    openmpLibraries?: string[];
    torch?: string;
    numpy?: string;
    cudaRuntime?: string;
    cudnn?: number;
    cudaAvailable: boolean;
    devices: string[];
    architectures: string[];
    kernelTest: boolean;
    error?: string;
    onnxruntime?: string;
    tensorrt?: string;
  };
  warnings: string[];
}

export interface ModelFileHandle {
  id: string;
  name: string;
  kind: 'input' | 'weights' | 'output';
}

export interface ModelInferenceInput {
  inputId: string;
  weightsId: string;
  outputId: string;
  options: Record<string, string | number | boolean>;
}

export interface ModelRuntimeApi {
  listPython: () => Promise<ModelPythonEnvironment[]>;
  installMiniforge: () => Promise<ModelPythonEnvironment[]>;
  createEnvironment: (baseId: string) => Promise<ModelPythonEnvironment>;
  checkDependencies: (device: 'cpu' | 'cuda') => Promise<boolean>;
  installDependencies: (
    device: 'cpu' | 'cuda',
    profileId?: string
  ) => Promise<import('./plugin_media').JobRecord>;
  getEnvironmentSnapshot: () => Promise<ModelEnvironmentSnapshot>;
  importEnvironment: () => Promise<ModelPythonEnvironment | null>;
  createManagedEnvironment: (
    input: ModelEnvironmentCreateInput
  ) => Promise<import('./plugin_media').JobRecord>;
  selectEnvironment: (id: string) => Promise<ModelPythonEnvironment>;
  clearActiveEnvironment: () => Promise<void>;
  removeEnvironment: (id: string) => Promise<import('./plugin_media').JobRecord>;
  listPackages: (id: string, manager: ModelPackageManager) => Promise<ModelPackageRecord[]>;
  changePackages: (input: ModelPackageChangeInput) => Promise<import('./plugin_media').JobRecord>;
  checkPackages: (
    id: string,
    manager: ModelPackageManager
  ) => Promise<{ ok: boolean; details: string }>;
  exportPackages: (id: string, manager: ModelPackageManager) => Promise<string>;
  inspectRuntime: (id?: string) => Promise<ModelRuntimeDiagnostics>;
  getDependencyProfiles: () => Promise<ModelDependencyProfile[]>;
  pickFile: (kind: ModelFileHandle['kind']) => Promise<ModelFileHandle | null>;
  startInference: (input: ModelInferenceInput) => Promise<import('./plugin_media').JobRecord>;
  cancel: (jobId: string) => Promise<import('./plugin_media').JobRecord>;
}
