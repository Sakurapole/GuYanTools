import { describe, expect, it } from 'vitest';
import {
  MODEL_CATALOG,
  TASKS,
  filterModels,
  sanitizeConfiguration,
  sanitizeConfigurations,
  resolveSelection,
  canRunModel,
  createCuganOptions,
} from './model_catalog';

describe('local image model catalog', () => {
  it('contains traceable weight assets and separates checkpoint task types', () => {
    expect(MODEL_CATALOG.length).toBeGreaterThanOrEqual(18);
    expect(new Set(MODEL_CATALOG.map((m) => m.id)).size).toBe(MODEL_CATALOG.length);
    for (const model of MODEL_CATALOG) {
      expect(model.tasks.length).toBeGreaterThan(0);
      expect(model.tasks.every((t) => TASKS.some((task) => task.id === t))).toBe(true);
      expect(model.sourceUrl).toMatch(/^https:\/\//);
      expect(model.assets.length).toBeGreaterThan(0);
      for (const asset of model.assets) {
        expect(asset.url).toMatch(/^https:\/\//);
        if (asset.sha256 !== null) expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
        if (asset.url.startsWith('https://huggingface.co/') && model.revision) {
          expect(asset.url).toContain(model.revision);
          if (asset.kind === 'file') {
            expect(asset.sha256).not.toBeNull();
            expect(asset.sizeBytes).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(MODEL_CATALOG.find((m) => m.id === 'swinir-denoise')?.tasks).toEqual(['denoise']);
    expect(MODEL_CATALOG.find((m) => m.id === 'qwen-image-2512')?.tasks).toEqual(['generate']);
  });

  it('filters by official task capabilities and search terms', () => {
    expect(filterModels(MODEL_CATALOG, 'denoise', '').some((m) => m.id === 'swinir-denoise')).toBe(
      true
    );
    expect(filterModels(MODEL_CATALOG, 'denoise', '').some((m) => m.id === 'swinir-sr')).toBe(
      false
    );
    expect(filterModels(MODEL_CATALOG, 'all', '局部修复').some((m) => m.id === 'lama')).toBe(true);
    expect(filterModels(MODEL_CATALOG, 'all', 'Qwen').length).toBe(2);
  });

  it('cleans incompatible saved tasks, backends, assets and removed models', () => {
    const model = MODEL_CATALOG.find((m) => m.id === 'real-cugan')!;
    const config = sanitizeConfiguration(model, {
      tasks: ['generate', 'upscale'],
      backend: 'webgpu',
      assetId: 'missing',
      enabled: false,
      alias: ' 动漫放大 ',
    });
    expect(config.tasks).toEqual(['upscale']);
    expect(config.backend).toBe('cpu');
    expect(config.assetId).toBe(model.assets[0].id);
    expect(config.enabled).toBe(false);
    expect(config.alias).toBe('动漫放大');
    expect(sanitizeConfigurations({ deleted: { tasks: ['upscale'] } })).not.toHaveProperty(
      'deleted'
    );
    expect(sanitizeConfiguration(model, { tasks: [] }).tasks).toEqual(model.tasks);
  });

  it('switches to compatible tasks and never sends unadapted models to CUGAN', () => {
    const qwen = MODEL_CATALOG.find((m) => m.id === 'qwen-image-2512')!;
    expect(resolveSelection(qwen, sanitizeConfiguration(qwen), 'upscale').task).toBe('generate');
    expect(canRunModel(qwen, 'generate', 'cuda')).toBe(false);
    const cugan = MODEL_CATALOG.find((m) => m.id === 'real-cugan')!;
    expect(canRunModel(cugan, 'upscale', 'cpu')).toBe(true);
    expect(canRunModel(cugan, 'generate', 'cpu')).toBe(false);
    expect(createCuganOptions('cpu', 2, 2, true)).toEqual({
      scale: 2,
      tile: 2,
      device: 'cpu',
      half: false,
    });
    expect(Object.keys(createCuganOptions('cuda', 4, 1, true)).sort()).toEqual([
      'device',
      'half',
      'scale',
      'tile',
    ]);
  });
});
