import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolvePluginPreloadPath } from './preload_path';

describe('plugin preload path', () => {
  it('uses the filename emitted by the preload-plugin Vite build', () => {
    expect(resolvePluginPreloadPath('C:/app/.vite/build')).toBe(path.join('C:/app/.vite/build', 'preload-plugin.js'));
  });
});
