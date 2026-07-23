import path from 'node:path';
import fs from 'node:fs';

export function resolvePluginPreloadPath(buildDirectory: string, fileExists: (candidate: string) => boolean = fs.existsSync) {
  const candidates = ['preload-plugin.js', 'preload.plugin.js'].map(fileName => path.join(buildDirectory, fileName));
  return candidates.find(fileExists) ?? candidates[0];
}
