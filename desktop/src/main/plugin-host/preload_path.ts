import path from 'node:path';

export function resolvePluginPreloadPath(buildDirectory: string) {
  return path.join(buildDirectory, 'preload-plugin.js');
}
