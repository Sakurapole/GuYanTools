import fs from 'fs-extra';
import path from 'path';
import type {
  PluginManifest,
  PluginPermission,
  PluginRuntimeKind,
  PluginTrustLevel,
} from '@/contracts/plugin_host';

const DEFAULT_PLUGIN_API_VERSION = '1.0.0';
const DEFAULT_HOST_VERSION_RANGE = '>=1.0.0';

type PackageJsonLike = {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  guyanToolsPlugin?: Partial<PluginManifest>;
};

function ensureArray<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value : [];
}

function toManifestShape(input: Partial<PluginManifest>, packageJson?: PackageJsonLike): PluginManifest {
  const name = input.name ?? packageJson?.name ?? input.id ?? 'unknown-plugin';
  const entry = input.entry ?? packageJson?.main ?? 'index.html';

  return {
    id: input.id ?? name,
    name,
    version: input.version ?? packageJson?.version ?? '0.0.0',
    displayName: input.displayName ?? name,
    description: input.description ?? packageJson?.description ?? '',
    pluginApiVersion: input.pluginApiVersion ?? DEFAULT_PLUGIN_API_VERSION,
    hostVersionRange: input.hostVersionRange ?? DEFAULT_HOST_VERSION_RANGE,
    trustLevel: (input.trustLevel ?? 'sandboxed') as PluginTrustLevel,
    runtime: (input.runtime ?? 'ui') as PluginRuntimeKind,
    entry,
    permissions: ensureArray(input.permissions) as PluginPermission[],
    contributes: input.contributes ?? {},
  };
}

export class PluginManifestResolver {
  async resolveFromDirectory(directoryPath: string): Promise<{ manifest: PluginManifest; resolvedEntryPath: string }> {
    const pluginJsonPath = path.join(directoryPath, 'plugin.json');
    const packageJsonPath = path.join(directoryPath, 'package.json');

    let manifestSource: Partial<PluginManifest> | null = null;
    let packageJson: PackageJsonLike | undefined;

    if (await fs.pathExists(pluginJsonPath)) {
      manifestSource = await fs.readJSON(pluginJsonPath);
    }

    if (await fs.pathExists(packageJsonPath)) {
      packageJson = await fs.readJSON(packageJsonPath);
      if (!manifestSource && packageJson.guyanToolsPlugin) {
        manifestSource = packageJson.guyanToolsPlugin;
      }
    }

    if (!manifestSource) {
      if (!packageJson) {
        throw new Error(`No plugin manifest found in ${directoryPath}`);
      }

      manifestSource = {
        id: packageJson.name,
        name: packageJson.name,
        version: packageJson.version,
        displayName: packageJson.name,
        description: packageJson.description,
        entry: packageJson.main ?? 'index.html',
      };
    }

    const manifest = toManifestShape(manifestSource, packageJson);
    const resolvedEntryPath = path.resolve(directoryPath, manifest.entry);
    if (!await fs.pathExists(resolvedEntryPath)) {
      throw new Error(`Plugin entry not found: ${resolvedEntryPath}`);
    }

    return { manifest, resolvedEntryPath };
  }

  async resolveFromPath(inputPath: string) {
    const stats = await fs.stat(inputPath);
    if (stats.isDirectory()) {
      return this.resolveFromDirectory(inputPath);
    }

    if (path.basename(inputPath) !== 'plugin.json') {
      throw new Error('Local plugin input must be a plugin directory or plugin.json');
    }

    return this.resolveFromDirectory(path.dirname(inputPath));
  }
}
