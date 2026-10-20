import catalog from './model_catalog.json';

export const TASKS = [
  { id: 'upscale', label: '超分辨率', description: '放大并恢复纹理细节' },
  { id: 'restore', label: '图像还原', description: '综合退化图像还原' },
  { id: 'denoise', label: '图像去噪', description: '减少图像噪声' },
  { id: 'deblur', label: '去模糊', description: '还原运动模糊' },
  { id: 'deartifact', label: '压缩修复', description: '去除 JPEG 压缩伪影' },
  { id: 'face-restore', label: '人脸修复', description: '恢复人脸细节' },
  { id: 'inpaint', label: '局部修复', description: '通过遮罩补全缺损区域' },
  { id: 'background-remove', label: '移除背景', description: '提取前景并去除背景' },
  { id: 'segment', label: '图像分割', description: '提取对象和区域遮罩' },
  { id: 'generate', label: 'AI 生成', description: '通过文字提示生成图像' },
  { id: 'edit', label: '指令编辑', description: '根据参考图与指令编辑' },
] as const;
export type ImageTask = (typeof TASKS)[number]['id'];
export type ModelBackend = 'cpu' | 'cuda' | 'tensorrt' | 'onnxruntime' | 'webgpu';
export interface ModelAsset {
  id: string;
  label: string;
  url: string;
  kind: 'file' | 'archive' | 'directory' | 'snapshot';
  format: string;
  access: 'public' | 'manual' | 'gated';
  sha256: string | null;
  sizeBytes: number | null;
  verification: 'head-verified' | 'source-listed' | 'auth-required' | 'unreachable';
  httpStatus?: number;
  checkedAt: string;
}
export interface ModelDefinition {
  id: string;
  name: string;
  version: string;
  author: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  licenseNote: string;
  description: string;
  tasks: ImageTask[];
  inputs: string[];
  nativeBackends: ModelBackend[];
  conversionBackends: ModelBackend[];
  runtimeAdapter: 'real-cugan' | null;
  resources: string;
  assets: ModelAsset[];
  revision?: string;
  snapshotNote?: string;
  checkedAt: string;
}
export interface ModelConfiguration {
  enabled: boolean;
  alias: string;
  tasks: ImageTask[];
  backend: ModelBackend;
  assetId: string;
}
export type ModelConfigurations = Record<string, ModelConfiguration>;
export const MODEL_CATALOG = catalog as ModelDefinition[];
export const CATALOG_STORAGE_KEY = 'image-model-library.v1';

export function taskLabel(task: string): string {
  return TASKS.find((item) => item.id === task)?.label ?? task;
}

export function filterModels(
  models: readonly ModelDefinition[],
  task: string,
  query: string
): ModelDefinition[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return models.filter(
    (model) =>
      (task === 'all' || model.tasks.includes(task as ImageTask)) &&
      terms.every((term) =>
        [
          model.name,
          model.id,
          model.author,
          model.license,
          model.description,
          ...model.tasks.map(taskLabel),
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(term)
      )
  );
}

export function sanitizeConfiguration(model: ModelDefinition, raw?: unknown): ModelConfiguration {
  const config =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const savedTasks = Array.isArray(config.tasks) ? config.tasks : model.tasks;
  const tasks = model.tasks.filter((task) => savedTasks.includes(task));
  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : true,
    alias: typeof config.alias === 'string' ? config.alias.trim().slice(0, 80) : '',
    tasks: tasks.length ? tasks : [...model.tasks],
    backend: model.nativeBackends.includes(config.backend as ModelBackend)
      ? (config.backend as ModelBackend)
      : model.nativeBackends[0],
    assetId: model.assets.some((asset) => asset.id === config.assetId)
      ? String(config.assetId)
      : model.assets[0].id,
  };
}

export function sanitizeConfigurations(raw: unknown): ModelConfigurations {
  const config =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    MODEL_CATALOG.map((model) => [model.id, sanitizeConfiguration(model, config[model.id])])
  );
}

export function resolveSelection(
  model: ModelDefinition,
  config: ModelConfiguration,
  currentTask: string
) {
  return {
    modelId: model.id,
    task: config.tasks.includes(currentTask as ImageTask)
      ? (currentTask as ImageTask)
      : config.tasks[0],
    backend: config.backend,
  };
}

export function canRunModel(model: ModelDefinition, task: string, backend: string): boolean {
  return (
    model.runtimeAdapter === 'real-cugan' && task === 'upscale' && ['cpu', 'cuda'].includes(backend)
  );
}

export function createCuganOptions(
  device: 'cpu' | 'cuda',
  scale: number,
  tile: number,
  half: boolean
) {
  return { scale, tile, device, half: device === 'cuda' && half };
}

export function assetSize(bytes: number | null): string {
  if (bytes === null) return '大小以发布页为准';
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GiB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}
